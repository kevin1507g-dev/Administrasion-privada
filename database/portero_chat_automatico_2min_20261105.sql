-- El aviso del Portero IA a los 2 minutos debe CREAR una conversación Owner.
-- La credencial del visitante sigue siendo el token público aleatorio de su
-- solicitud original; se conserva únicamente su SHA-256 en el chat.
-- Sin ninguna orden al ESP32, ni aprobación automática de accesos.
ALTER TABLE public.portero_owner_chats
 ADD COLUMN IF NOT EXISTS entrega_id uuid UNIQUE
 REFERENCES public.entregas_contacto(id) ON DELETE SET NULL;

ALTER TABLE public.portero_owner_chat_mensajes
 DROP CONSTRAINT IF EXISTS portero_owner_chat_mensajes_autor_check;
ALTER TABLE public.portero_owner_chat_mensajes
 ADD CONSTRAINT portero_owner_chat_mensajes_autor_check
 CHECK (autor IN ('repartidor','owner','sistema'));

CREATE OR REPLACE FUNCTION access_private.portero_chat_escalar(p_entrega_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v public.entregas_contacto%rowtype;
 v_casa text;
 v_owner uuid;
 v_chat uuid;
 v_autorizada boolean;
 v_es_nuevo boolean := false;
 v_hora time := (now() AT TIME ZONE 'America/Mexico_City')::time;
BEGIN
 SELECT * INTO v FROM public.entregas_contacto
 WHERE id=p_entrega_id FOR UPDATE;
 -- Nunca se debe generar un chat de acceso sin una solicitud real y vigente.
 IF v.id IS NULL OR v.portero_modo_mixto IS NOT TRUE OR
    v.estado<>'esperando' OR
    v.created_at>now()-interval '2 minutes' OR
    v.expires_at<=now() THEN
  RETURN NULL;
 END IF;

 SELECT c.id INTO v_chat FROM public.portero_owner_chats c
 WHERE c.entrega_id=v.id;
 IF v_chat IS NOT NULL THEN RETURN v_chat; END IF;

 SELECT c.numero INTO v_casa FROM public.casas c WHERE c.id=v.casa_id;
 IF v_casa !~ '^(4[0-9]|5[0-9]|6[0-6])$' THEN RETURN NULL; END IF;
 SELECT p.id INTO v_owner FROM public.profiles p
 WHERE p.rol='owner' AND p.activo IS TRUE
 AND coalesce(p.estado_registro,'aprobado')='aprobado'
 ORDER BY p.created_at ASC LIMIT 1;
 IF v_owner IS NULL THEN RETURN NULL; END IF;

 SELECT EXISTS(
  SELECT 1 FROM public.empresas_reparto_autorizadas e
  WHERE e.activa IS TRUE
   AND lower(btrim(e.nombre))=lower(btrim(coalesce(v.empresa,'')))
   AND v_hora BETWEEN e.hora_inicio AND e.hora_fin
 ) INTO v_autorizada;

 INSERT INTO public.portero_owner_chats(
  entrega_id, owner_id, token_hash, casa_numero, empresa, repartidor,
  tipo, motivo, rate_key, created_at, updated_at, last_visitor_at
 )
 VALUES(
  v.id, v_owner,
  encode(extensions.digest(v.public_token::text,'sha256'),'hex'),
  v_casa, btrim(v.empresa), btrim(v.repartidor),
  v.tipo, btrim(v.mensaje), 'cron:'||v.id::text,
  now(), now(), now()
 )
 ON CONFLICT (entrega_id) DO NOTHING
 RETURNING id INTO v_chat;

 IF v_chat IS NULL THEN
  SELECT c.id INTO v_chat FROM public.portero_owner_chats c
  WHERE c.entrega_id=v.id;
 ELSE
  v_es_nuevo:=true;
 END IF;
 IF v_chat IS NULL THEN RETURN NULL; END IF;

 UPDATE public.entregas_contacto
  SET portero_intervino_at=coalesce(portero_intervino_at,now()),
      portero_resultado=coalesce(portero_resultado,
       CASE WHEN v_autorizada THEN 'empresa_permitida_sin_acreditacion'
            ELSE 'sin_acreditacion' END)
  WHERE id=v.id;

 IF v_es_nuevo THEN
  INSERT INTO public.portero_owner_chat_mensajes(chat_id,autor,mensaje)
  VALUES (v_chat,'sistema',
    'Pasaron 2 minutos sin respuesta del residente. '||
    'Portero IA solicitó atención de Sistema Admin para la casa '||
    v_casa||'. El portón NO fue abierto automáticamente.');

  PERFORM access_private.notify_owners(
   '💬 Portero IA: chat especial a los 2 minutos',
   'Casa '||v_casa||' · Empresa declarada: '||left(v.empresa,80)||
   '. El residente no respondió. Abre el chat especial en IA para atender esta entrega. '||
   'Sin acreditación verificable no hay apertura automática.',
   'portero_chat_owner',
   'portero_chat:'||v_chat::text,
   'portero_owner_chat'
  );
 END IF;
 RETURN v_chat;
END
$function$;

REVOKE ALL ON FUNCTION access_private.portero_chat_escalar(uuid)
 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION access_private.portero_intervenir_pendientes()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_id uuid;
 v_total integer:=0;
BEGIN
 FOR v_id IN
  SELECT d.id FROM public.entregas_contacto d
  WHERE d.portero_modo_mixto IS TRUE
   AND d.estado='esperando'
   AND d.created_at<=now()-interval '2 minutes'
   AND d.expires_at>now()
   AND (d.portero_intervino_at IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.portero_owner_chats c WHERE c.entrega_id=d.id
   ))
  ORDER BY d.created_at
  LIMIT 100
  FOR UPDATE SKIP LOCKED
 LOOP
  IF access_private.portero_chat_escalar(v_id) IS NOT NULL THEN
   v_total:=v_total+1;
  END IF;
 END LOOP;
 RETURN v_total;
END
$function$;
REVOKE ALL ON FUNCTION access_private.portero_intervenir_pendientes()
 FROM PUBLIC, anon, authenticated;

-- Registrar también los casos de los últimos minutos que el cron anterior
-- notificó pero dejó sin chat, solo mientras sigan vigentes y pendientes.
SELECT access_private.portero_intervenir_pendientes();
