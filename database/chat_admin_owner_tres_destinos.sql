-- Chats privados de Administración y Sistema Admin.
-- «Todos» = un envío a CADA conversación individual, no un grupo abierto.
-- No modificar mensajes, lecturas o conversaciones existentes de residentes.
CREATE TABLE IF NOT EXISTS public.chat_staff_conversaciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chat_staff_mensajes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversacion_id uuid NOT NULL REFERENCES public.chat_staff_conversaciones(id) ON DELETE CASCADE,
 autor_id uuid NOT NULL REFERENCES public.profiles(id),
 mensaje text NOT NULL CHECK (char_length(btrim(mensaje)) BETWEEN 1 AND 1500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_staff_mensajes_por_conversacion
 ON public.chat_staff_mensajes(conversacion_id,created_at);
CREATE TABLE IF NOT EXISTS public.chat_staff_lecturas (
 mensaje_id uuid NOT NULL REFERENCES public.chat_staff_mensajes(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 leido_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(mensaje_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.chat_envios_masivos (
 solicitud_id uuid PRIMARY KEY,
 remitente_id uuid NOT NULL REFERENCES public.profiles(id),
 destino text NOT NULL CHECK (destino IN ('residentes','admins')),
 total integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_envios_masivos_remitente_fecha
 ON public.chat_envios_masivos(remitente_id,created_at DESC);

ALTER TABLE public.chat_staff_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_staff_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_staff_lecturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_envios_masivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_staff_conversaciones_select ON public.chat_staff_conversaciones;
CREATE POLICY chat_staff_conversaciones_select ON public.chat_staff_conversaciones
 FOR SELECT TO authenticated USING (
  public.current_user_role()='owner'
  OR (public.current_user_role()='admin' AND admin_id=(SELECT auth.uid()))
 );
DROP POLICY IF EXISTS chat_staff_mensajes_select ON public.chat_staff_mensajes;
CREATE POLICY chat_staff_mensajes_select ON public.chat_staff_mensajes
 FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.chat_staff_conversaciones c
          WHERE c.id=chat_staff_mensajes.conversacion_id)
 );
DROP POLICY IF EXISTS chat_staff_lecturas_select ON public.chat_staff_lecturas;
CREATE POLICY chat_staff_lecturas_select ON public.chat_staff_lecturas
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS chat_staff_lecturas_insert ON public.chat_staff_lecturas;
CREATE POLICY chat_staff_lecturas_insert ON public.chat_staff_lecturas
 FOR INSERT TO authenticated WITH CHECK(
  user_id=(SELECT auth.uid()) AND
  EXISTS (
   SELECT 1 FROM public.chat_staff_mensajes m WHERE m.id=chat_staff_lecturas.mensaje_id
  )
 );
DROP POLICY IF EXISTS chat_envios_masivos_select ON public.chat_envios_masivos;
CREATE POLICY chat_envios_masivos_select ON public.chat_envios_masivos
 FOR SELECT TO authenticated USING(remitente_id=(SELECT auth.uid()));

REVOKE ALL ON public.chat_staff_conversaciones,public.chat_staff_mensajes,
 public.chat_staff_lecturas,public.chat_envios_masivos FROM anon,authenticated;
GRANT SELECT ON public.chat_staff_conversaciones,public.chat_staff_mensajes,
 public.chat_staff_lecturas,public.chat_envios_masivos TO authenticated;
GRANT INSERT ON public.chat_staff_lecturas TO authenticated;

-- Todos los mensajes del administrador son privados para el owner.
CREATE OR REPLACE FUNCTION public.chat_enviar_staff(p_admin_id uuid,p_mensaje text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 v_uid uuid:=(SELECT auth.uid());
 v_rol text:=public.current_user_role();
 v_conv uuid;
 v_mensaje uuid;
BEGIN
 IF v_uid IS NULL OR v_rol NOT IN ('admin','owner') THEN
  RAISE EXCEPTION 'No autorizado para chat administrativo' USING ERRCODE='42501';
 END IF;
 IF char_length(btrim(coalesce(p_mensaje,''))) NOT BETWEEN 1 AND 1500 THEN
  RAISE EXCEPTION 'El mensaje debe contener de 1 a 1500 caracteres' USING ERRCODE='22023';
 END IF;
 IF p_admin_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.id=p_admin_id AND p.rol='admin'
   AND p.activo=true AND p.estado_registro='aprobado'
 ) THEN
  RAISE EXCEPTION 'Administrador no disponible' USING ERRCODE='22023';
 END IF;
 IF v_rol='admin' AND p_admin_id<>v_uid THEN
  RAISE EXCEPTION 'No puedes acceder al chat privado de otro administrador' USING ERRCODE='42501';
 END IF;

 INSERT INTO public.chat_staff_conversaciones(admin_id)
 VALUES(p_admin_id)
 ON CONFLICT (admin_id) DO UPDATE SET updated_at=now()
 RETURNING id INTO v_conv;
 INSERT INTO public.chat_staff_mensajes(conversacion_id,autor_id,mensaje)
 VALUES(v_conv,v_uid,btrim(p_mensaje)) RETURNING id INTO v_mensaje;
 UPDATE public.chat_staff_conversaciones SET updated_at=now() WHERE id=v_conv;
 RETURN v_mensaje;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_enviar_staff(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_enviar_staff(uuid,text) TO authenticated;

-- Un mensaje masivo se COPIA de modo privado a cada destinatario.
-- Cada destinatario responde en su conversación individual.
CREATE OR REPLACE FUNCTION public.chat_enviar_masivo(p_destino text,p_mensaje text,p_solicitud_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 v_uid uuid:=(SELECT auth.uid());
 v_rol text:=public.current_user_role();
 v_destino_rol text;
 v_persona record;
 v_conv uuid;
 v_total integer:=0;
 v_rows integer;
BEGIN
 IF v_uid IS NULL OR v_rol NOT IN ('admin','owner') THEN
  RAISE EXCEPTION 'No autorizado para envíos masivos' USING ERRCODE='42501';
 END IF;
 IF (p_destino='admins' AND v_rol<>'owner') OR
    p_destino NOT IN ('residentes','admins') THEN
  RAISE EXCEPTION 'Destino masivo no autorizado' USING ERRCODE='42501';
 END IF;
 IF char_length(btrim(coalesce(p_mensaje,''))) NOT BETWEEN 1 AND 1500 THEN
  RAISE EXCEPTION 'El mensaje debe contener de 1 a 1500 caracteres' USING ERRCODE='22023';
 END IF;
 IF p_solicitud_id IS NULL THEN
  RAISE EXCEPTION 'Falta el identificador de envío' USING ERRCODE='22023';
 END IF;
 -- Proteger de dobles pulsaciones o repeticiones de red.
 INSERT INTO public.chat_envios_masivos(solicitud_id,remitente_id,destino)
 VALUES(p_solicitud_id,v_uid,p_destino) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows=0 THEN RAISE EXCEPTION 'El envío ya se procesó. No se volverá a enviar.' USING ERRCODE='23505'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.chat_envios_masivos e WHERE e.remitente_id=v_uid
    AND e.solicitud_id<>p_solicitud_id AND e.created_at>now()-interval '5 seconds'
 ) THEN
  RAISE EXCEPTION 'Espera unos segundos antes de otro envío general' USING ERRCODE='22023';
 END IF;

 IF p_destino='residentes' THEN
   v_destino_rol:=v_rol; -- admin u owner; no mezclar ambos canales
   FOR v_persona IN SELECT p.id FROM public.profiles p
       WHERE p.rol='residente' AND p.activo=true AND p.estado_registro='aprobado'
       ORDER BY p.id LOOP
    INSERT INTO public.chat_conversaciones(residente_id,destinatario_rol)
    VALUES(v_persona.id,v_destino_rol)
    ON CONFLICT (residente_id,destinatario_rol) DO UPDATE SET updated_at=now()
    RETURNING id INTO v_conv;
    INSERT INTO public.chat_mensajes(conversacion_id,autor_id,mensaje)
    VALUES(v_conv,v_uid,btrim(p_mensaje));
    v_total:=v_total+1;
   END LOOP;
 ELSE
   -- «Todos los administradores»: conversaciones staff individuales.
   FOR v_persona IN SELECT p.id FROM public.profiles p
       WHERE p.rol='admin' AND p.activo=true AND p.estado_registro='aprobado'
       ORDER BY p.id LOOP
    INSERT INTO public.chat_staff_conversaciones(admin_id)
    VALUES(v_persona.id)
    ON CONFLICT (admin_id) DO UPDATE SET updated_at=now()
    RETURNING id INTO v_conv;
    INSERT INTO public.chat_staff_mensajes(conversacion_id,autor_id,mensaje)
    VALUES(v_conv,v_uid,btrim(p_mensaje));
    v_total:=v_total+1;
   END LOOP;
 END IF;
 UPDATE public.chat_envios_masivos SET total=v_total WHERE solicitud_id=p_solicitud_id;
 RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_enviar_masivo(text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_enviar_masivo(text,text,uuid) TO authenticated;

-- Avisar a cada destinatario real del mensaje staff.
CREATE OR REPLACE FUNCTION public.notificar_chat_staff_mensaje()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_admin uuid; v_rol text;
BEGIN
 SELECT c.admin_id INTO v_admin FROM public.chat_staff_conversaciones c
 WHERE c.id=NEW.conversacion_id;
 SELECT rol INTO v_rol FROM public.profiles WHERE id=NEW.autor_id;
 IF v_rol='admin' THEN
  INSERT INTO public.notificaciones_push(user_id,titulo,mensaje,tipo,referencia,destino)
  SELECT p.id,'💬 Mensaje de Administración','Un administrador te ha enviado un mensaje privado.',
   'chat_staff_mensaje','staff:'||NEW.conversacion_id::text||':'||NEW.id::text,'chat_staff'
  FROM public.profiles p WHERE p.rol='owner' AND p.activo=true
   AND p.estado_registro='aprobado'
  ON CONFLICT DO NOTHING;
 ELSIF v_rol='owner' AND v_admin IS NOT NULL THEN
  INSERT INTO public.notificaciones_push(user_id,titulo,mensaje,tipo,referencia,destino)
  VALUES(v_admin,'💬 Mensaje de Sistema Admin',
    'Sistema Admin te ha enviado un mensaje privado.',
    'chat_staff_mensaje','staff:'||NEW.conversacion_id::text||':'||NEW.id::text,'chat_staff')
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_staff_notificar_mensaje ON public.chat_staff_mensajes;
CREATE TRIGGER chat_staff_notificar_mensaje AFTER INSERT ON public.chat_staff_mensajes
 FOR EACH ROW EXECUTE FUNCTION public.notificar_chat_staff_mensaje();

-- Mantener el contador de conversaciones staff actualizado.
CREATE OR REPLACE FUNCTION public.chat_staff_actualizar_fecha()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 UPDATE public.chat_staff_conversaciones SET updated_at=now()
 WHERE id=NEW.conversacion_id;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_staff_fecha_mensaje ON public.chat_staff_mensajes;
CREATE TRIGGER chat_staff_fecha_mensaje AFTER INSERT ON public.chat_staff_mensajes
 FOR EACH ROW EXECUTE FUNCTION public.chat_staff_actualizar_fecha();
