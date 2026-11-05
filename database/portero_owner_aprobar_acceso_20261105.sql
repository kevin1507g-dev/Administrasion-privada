-- Autorización MANUAL, solo Sistema Admin (Owner), desde el chat especial.
-- Respeta las comprobaciones vigentes de access_private.request: cuenta activa,
-- ESP32 en línea, Modo Evento, bloqueo de dispositivo, cooldown y órdenes pendientes.
-- Una aprobación envía UN pulso normal; NO mantiene el portón abierto 7 minutos.
ALTER TABLE public.portero_owner_chats
 ADD COLUMN IF NOT EXISTS autorizado_at timestamptz,
 ADD COLUMN IF NOT EXISTS access_command_id uuid REFERENCES access_private.commands(id),
 ADD COLUMN IF NOT EXISTS salida_reportada_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS portero_owner_chat_orden_unica
 ON public.portero_owner_chats(access_command_id)
 WHERE access_command_id IS NOT NULL;
COMMENT ON COLUMN public.portero_owner_chats.salida_reportada_at IS
 'Declaración del repartidor de que está fuera: NO confirma su presencia física ni cierra portón.';

CREATE OR REPLACE FUNCTION public.portero_owner_autorizar(p_chat_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $func$
DECLARE
 v_owner public.profiles%rowtype;
 v_chat public.portero_owner_chats%rowtype;
 v_entrega public.entregas_contacto%rowtype;
 v_casa public.casas%rowtype;
 v_orden uuid;
 v_ahora timestamptz := now();
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Inicia sesión para autorizar una entrega.';
 END IF;
 SELECT * INTO v_owner FROM public.profiles WHERE id=auth.uid();
 IF v_owner.id IS NULL OR v_owner.rol<>'owner'
  OR v_owner.activo IS NOT TRUE
  OR coalesce(v_owner.estado_registro,'aprobado')<>'aprobado' THEN
   RAISE EXCEPTION 'Solo Sistema Admin activo puede autorizar repartidores.';
 END IF;
 SELECT * INTO v_chat FROM public.portero_owner_chats
 WHERE id=p_chat_id FOR UPDATE;
 IF v_chat.id IS NULL OR v_chat.owner_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Chat no disponible para tu cuenta.';
 END IF;
 IF v_chat.access_command_id IS NOT NULL THEN
  RETURN jsonb_build_object('ok',true,'ya_autorizado',true,
    'autorizado_at',v_chat.autorizado_at,'command_id',v_chat.access_command_id);
 END IF;
 IF v_chat.estado<>'abierto' OR v_chat.expires_at<=v_ahora THEN
  RAISE EXCEPTION 'El chat ya terminó. No se puede autorizar desde él.';
 END IF;
 SELECT * INTO v_casa FROM public.casas WHERE numero=v_chat.casa_numero;
 IF v_casa.id IS NULL OR v_casa.activo IS NOT TRUE OR
  v_casa.numero !~ '^(4[0-9]|5[0-9]|6[0-6])$' THEN
  RAISE EXCEPTION 'La casa no está habilitada para esta solicitud.';
 END IF;
 IF v_chat.entrega_id IS NOT NULL THEN
  SELECT * INTO v_entrega FROM public.entregas_contacto
  WHERE id=v_chat.entrega_id FOR UPDATE;
  IF v_entrega.id IS NULL OR v_entrega.casa_id<>v_casa.id OR
   v_entrega.estado<>'esperando' OR v_entrega.expires_at<=v_ahora
   OR v_entrega.portero_modo_mixto IS NOT TRUE THEN
   RAISE EXCEPTION 'La solicitud de entrega venció o ya fue respondida.';
  END IF;
 END IF;
 -- Reutilizar los controles actuales de ESP32 y seguridad, SIN saltarlos.
 v_orden:=access_private.request('porton');
 IF v_chat.entrega_id IS NOT NULL THEN
  UPDATE access_private.commands SET delivery_id=v_chat.entrega_id
   WHERE id=v_orden;
  UPDATE public.entregas_contacto SET
   estado='respondido', respuesta='acceso_porton',
   respondido_por=auth.uid(), respondido_at=v_ahora
   WHERE id=v_entrega.id;
 END IF;
 UPDATE public.portero_owner_chats SET
  autorizado_at=v_ahora, access_command_id=v_orden, updated_at=v_ahora
 WHERE id=v_chat.id;

 INSERT INTO public.portero_owner_chat_mensajes(chat_id,autor,mensaje)
 VALUES(v_chat.id,'sistema',
  'Sistema Admin autorizó una orden de apertura de portón para la casa '||
  v_casa.numero||'. Comprueba que el portón haya abierto y que el paso esté libre. '||
  'Hay 7 minutos para declarar la salida; el portón NO permanecerá abierto por ese tiempo.');

 RETURN jsonb_build_object('ok',true,'ya_autorizado',false,
  'autorizado_at',v_ahora,'command_id',v_orden);
END $func$;

REVOKE ALL ON FUNCTION public.portero_owner_autorizar(uuid)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portero_owner_autorizar(uuid)
 TO authenticated;
