-- Modificaciones y revocaciones solo por Sistema Admin.
-- El residente conserva la cancelación de visitas propias.
-- La creación de registros permanece habilitada para Administradores.

-- public.disciplina_responder_aclaracion
CREATE OR REPLACE FUNCTION public.disciplina_responder_aclaracion(p_id uuid, p_respuesta text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol = 'owner' and p.activo and p.estado_registro='aprobado') then raise exception 'Sin permiso'; end if;
 if length(trim(coalesce(p_respuesta,'')))<5 then raise exception 'Escribe una respuesta'; end if;
 update public.disciplina_aclaraciones set respuesta=trim(p_respuesta),respondida_por=auth.uid(),respondida_at=now() where id=p_id and respondida_at is null;
 if not found then raise exception 'Aclaración no disponible'; end if;
end $function$
;

-- public.gestionar_archivo_cuota
CREATE OR REPLACE FUNCTION public.gestionar_archivo_cuota(p_cuota_id bigint, p_archivar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor public.profiles%rowtype;
  v_cuota public.cuotas%rowtype;
  v_pending int;
  v_payment int;
  v_intents int;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  IF v_actor.id IS NULL OR v_actor.activo IS DISTINCT FROM true
    OR v_actor.estado_registro IS DISTINCT FROM 'aprobado'
    OR v_actor.rol <> 'owner' THEN
    RAISE EXCEPTION 'Solo Sistema Admin puede archivar o restaurar cuotas' USING ERRCODE='42501';
  END IF;
  IF p_archivar IS NULL THEN RAISE EXCEPTION 'Acción no válida'; END IF;
  SELECT * INTO v_cuota FROM public.cuotas WHERE id=p_cuota_id FOR UPDATE;
  IF v_cuota.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  SELECT count(*) INTO v_pending FROM mp_private.intents
   WHERE cuota_id=p_cuota_id AND status = 'review';
  IF p_archivar AND v_pending>0 THEN
    RETURN jsonb_build_object('ok',false,'reason','active_or_unreconciled_checkout');
  END IF;
  IF p_archivar THEN
    UPDATE public.cuotas SET archivada=true, archivada_el=now(), archivada_por=v_actor.id
      WHERE id=p_cuota_id;
  ELSE
    UPDATE public.cuotas SET archivada=false, archivada_el=NULL, archivada_por=NULL
      WHERE id=p_cuota_id;
  END IF;
  SELECT count(*) INTO v_payment FROM public.pagos WHERE cuota_id=p_cuota_id;
  SELECT count(*) INTO v_intents FROM mp_private.intents WHERE cuota_id=p_cuota_id;
  RETURN jsonb_build_object('ok',true,'archivada',p_archivar,
    'tiene_historial_de_pagos',v_payment>0,'tiene_historial_mercadopago',v_intents>0,
    'enlace_podria_seguir_activo',EXISTS (SELECT 1 FROM mp_private.intents i WHERE i.cuota_id=p_cuota_id AND i.status IN ('draft','ready')));
END $function$
;

-- access_private.manage
CREATE OR REPLACE FUNCTION access_private.manage(p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e jsonb; token text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 e:=access_private.eligibility(auth.uid());
 if not (e->>'admin')::boolean or public.current_user_role() is distinct from 'owner' then raise exception 'Solo Sistema Admin puede modificar la configuración digital.' using errcode='42501'; end if;
 if p_action='pair' then
   token:=encode(extensions.gen_random_bytes(32),'hex');
   insert into access_private.device(singleton,token_hash) values(true,extensions.digest(token,'sha256'))
   on conflict(singleton) do update set token_hash=excluded.token_hash,enabled=true,residents_enabled=false,last_seen=null,last_requested=null,updated_at=now();
   update access_private.commands set state='cancelled' where state='pending';
   return jsonb_build_object('token',token);
 end if;
 perform 1 from access_private.device where singleton for update;
 if not found then raise exception 'Primero vincula el ESP32.'; end if;
 if p_action='pause' then
   update access_private.device set enabled=false,updated_at=now() where singleton;
 elsif p_action='resume' then
   update access_private.device set enabled=true,updated_at=now() where singleton;
 elsif p_action='residents_on' then
   if not exists(select 1 from access_private.device where singleton and enabled and last_seen>now()-interval '15 seconds') then raise exception 'El equipo debe estar conectado antes de habilitar residentes.'; end if;
   update access_private.device set residents_enabled=true,updated_at=now() where singleton;
 elsif p_action='residents_off' then
   update access_private.device set residents_enabled=false,updated_at=now() where singleton;
 else raise exception 'Acción no válida.';
 end if;
 update access_private.commands set state='cancelled' where state='pending';
 return jsonb_build_object('ok',true);
end $function$
;

-- public.visitor_pass_revoke
CREATE OR REPLACE FUNCTION public.visitor_pass_revoke(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.profiles%rowtype;
begin
 select * into p from public.profiles where id=auth.uid();
 if p.id is null or p.rol not in ('owner','residente') or p.activo is not true or coalesce(p.estado_registro,'aprobado')<>'aprobado' then raise exception 'Cuenta no autorizada.'; end if;
 update public.visitor_passes set revoked_at=now()
 where id=p_id and revoked_at is null and (p.rol='owner' or sponsor_id=p.id);
 return found;
end $function$
;
