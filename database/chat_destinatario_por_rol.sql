-- Chat de Administración Residencial: destinatario real por rol.
-- Historial antiguo se conserva en canal "general", visible a ambos roles administrativos.
-- Mensajes nuevos a "admin" o "owner" son privados exclusivamente para el rol elegido.

ALTER TABLE public.chat_conversaciones
  ADD COLUMN IF NOT EXISTS destinatario_rol text NOT NULL DEFAULT 'general';
ALTER TABLE public.chat_conversaciones
  DROP CONSTRAINT IF EXISTS chat_conversaciones_destinatario_valido;
ALTER TABLE public.chat_conversaciones
  ADD CONSTRAINT chat_conversaciones_destinatario_valido
  CHECK (destinatario_rol IN ('admin','owner','general'));
-- Antes existía solo una conversación por residente. Ahora una por canal.
ALTER TABLE public.chat_conversaciones
  DROP CONSTRAINT IF EXISTS chat_conversaciones_residente_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversaciones_residente_destinatario_key
  ON public.chat_conversaciones(residente_id,destinatario_rol);
-- Sólo los registros antiguos usan 'general'. Nuevos clientes heredados van a admin.
ALTER TABLE public.chat_conversaciones ALTER COLUMN destinatario_rol SET DEFAULT 'admin';

-- Se mantienen RLS y la creación de conversaciones existentes; restringe
-- SELECT/INSERT a remitente y destinatario. Nunca se permite cambiar de canal.
DROP POLICY IF EXISTS "admins full chat conversations" ON public.chat_conversaciones;
DROP POLICY IF EXISTS "resident create own chat conversation" ON public.chat_conversaciones;
DROP POLICY IF EXISTS "resident read own chat conversation" ON public.chat_conversaciones;
CREATE POLICY chat_select_participantes ON public.chat_conversaciones
 FOR SELECT TO authenticated USING (
  (public.current_user_role()='residente' AND residente_id=(SELECT auth.uid()))
  OR (
   public.current_user_role() IN ('admin','owner')
   AND destinatario_rol IN (public.current_user_role(),'general')
  )
 );
CREATE POLICY chat_insert_residente_destinatario ON public.chat_conversaciones
 FOR INSERT TO authenticated WITH CHECK (
  public.current_user_role()='residente'
  AND residente_id=(SELECT auth.uid())
  AND destinatario_rol IN ('admin','owner')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
     AND p.activo=true AND p.estado_registro='aprobado')
 );
CREATE POLICY chat_insert_staff_destinatario ON public.chat_conversaciones
 FOR INSERT TO authenticated WITH CHECK (
  public.current_user_role() IN ('admin','owner')
  AND destinatario_rol=public.current_user_role()
  AND EXISTS (SELECT 1 FROM public.profiles p
   WHERE p.id=chat_conversaciones.residente_id
     AND p.rol='residente' AND p.activo=true
     AND p.estado_registro='aprobado')
 );

DROP POLICY IF EXISTS "admins full chat messages" ON public.chat_mensajes;
DROP POLICY IF EXISTS "resident send own chat messages" ON public.chat_mensajes;
DROP POLICY IF EXISTS "resident read own chat messages" ON public.chat_mensajes;
CREATE POLICY chat_mensajes_select_participantes ON public.chat_mensajes
 FOR SELECT TO authenticated USING (
   EXISTS (SELECT 1 FROM public.chat_conversaciones c
    WHERE c.id=chat_mensajes.conversacion_id
    AND (
      (public.current_user_role()='residente' AND c.residente_id=(SELECT auth.uid()))
      OR (public.current_user_role() IN ('admin','owner')
       AND c.destinatario_rol IN (public.current_user_role(),'general'))
    )
   )
 );
CREATE POLICY chat_mensajes_insert_participantes ON public.chat_mensajes
 FOR INSERT TO authenticated WITH CHECK (
  autor_id=(SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.chat_conversaciones c
    WHERE c.id=chat_mensajes.conversacion_id
    AND (
      (public.current_user_role()='residente' AND c.residente_id=(SELECT auth.uid()))
      OR (public.current_user_role() IN ('admin','owner')
       AND c.destinatario_rol IN (public.current_user_role(),'general'))
    )
  )
 );

DROP POLICY IF EXISTS "users insert own chat receipts" ON public.chat_lecturas;
DROP POLICY IF EXISTS "users read own chat receipts" ON public.chat_lecturas;
CREATE POLICY chat_lecturas_select_titular ON public.chat_lecturas
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY chat_lecturas_insert_participantes ON public.chat_lecturas
 FOR INSERT TO authenticated WITH CHECK (
  user_id=(SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.chat_mensajes m
    JOIN public.chat_conversaciones c ON c.id=m.conversacion_id
    WHERE m.id=chat_lecturas.mensaje_id
    AND (
     (public.current_user_role()='residente' AND c.residente_id=(SELECT auth.uid()))
     OR (public.current_user_role() IN ('admin','owner')
      AND c.destinatario_rol IN (public.current_user_role(),'general'))
    )
  )
 );

-- No permitir que usuarios alteren destinatario, mensajes o lecturas ya
-- existentes mediante UPDATE: sólo lectura e inserción.
REVOKE ALL ON public.chat_conversaciones,public.chat_mensajes,public.chat_lecturas FROM authenticated;
GRANT SELECT,INSERT ON public.chat_conversaciones,public.chat_mensajes,public.chat_lecturas TO authenticated;

-- El disparador anterior avisaba simultáneamente a admin y owner.
-- Ahora notifica solo al canal elegido, manteniendo legado "general".
CREATE OR REPLACE FUNCTION public.notificar_chat_mensaje()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 v_residente uuid;
 v_rol text;
 v_destino text;
 v_nombre_destino text;
BEGIN
 SELECT residente_id,destinatario_rol INTO v_residente,v_destino
 FROM public.chat_conversaciones WHERE id=NEW.conversacion_id;
 SELECT rol INTO v_rol FROM public.profiles WHERE id=NEW.autor_id;
 IF v_residente IS NULL OR v_rol IS NULL OR v_destino IS NULL THEN RETURN NEW;END IF;
 v_nombre_destino:=CASE WHEN v_destino='owner' THEN 'Sistema Admin'
                            WHEN v_destino='admin' THEN 'Administración'
                            ELSE 'Administración general' END;
 IF v_rol IN ('admin','owner') THEN
   INSERT INTO public.notificaciones_push(user_id,titulo,mensaje,tipo,referencia,destino)
   VALUES(
    v_residente,'💬 Nuevo mensaje de '||CASE WHEN v_rol='owner' THEN 'Sistema Admin' ELSE 'Administración' END,
    'Tienes un mensaje privado de '||CASE WHEN v_rol='owner' THEN 'Sistema Admin' ELSE 'administración' END||'.',
    'chat_mensaje','chat:'||NEW.conversacion_id::text||':'||NEW.id::text,'chat')
   ON CONFLICT DO NOTHING;
 ELSIF v_rol='residente' THEN
   INSERT INTO public.notificaciones_push(user_id,titulo,mensaje,tipo,referencia,destino)
   SELECT p.id,'💬 Nuevo mensaje para '||v_nombre_destino,
     'Un residente ha enviado un mensaje privado al canal de '||v_nombre_destino||'.',
     'chat_mensaje','chat:'||NEW.conversacion_id::text||':'||NEW.id::text||':'||p.id::text,'chat'
   FROM public.profiles p WHERE
    p.rol IN ('admin','owner')
    AND (p.rol=v_destino OR v_destino='general')
    AND p.activo=true AND coalesce(p.estado_registro,'aprobado')='aprobado'
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
