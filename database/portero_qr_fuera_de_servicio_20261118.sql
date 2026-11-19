-- Portero Virtual / QR de repartidores y visitas: pausa administrable desde la web.
-- Control administrativo independiente del resto de aperturas de residentes.
-- No detiene ni cambia los relevadores, el firmware ni Control Digital.
create table if not exists public.portero_servicio_config (
 singleton boolean primary key default true check (singleton),
 activo boolean not null default true,
 actualizado_at timestamptz not null default now(),
 actualizado_por uuid references public.profiles(id)
);
insert into public.portero_servicio_config(singleton,activo) values (true,true)
 on conflict(singleton) do nothing;
alter table public.portero_servicio_config enable row level security;
revoke all on public.portero_servicio_config from public,anon,authenticated;

create or replace function access_private.portero_servicio_activo()
returns boolean language sql stable security definer set search_path=''
as $$
 select coalesce((select activo from public.portero_servicio_config where singleton=true),false)
$$;
revoke all on function access_private.portero_servicio_activo() from public,anon,authenticated;

create or replace function public.portero_servicio_estado()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object('activo',coalesce(c.activo,false),'actualizado_at',c.actualizado_at)
 from public.portero_servicio_config c where c.singleton=true
$$;
revoke all on function public.portero_servicio_estado() from public;
grant execute on function public.portero_servicio_estado() to anon,authenticated,service_role;

create or replace function public.portero_servicio_cambiar(p_activo boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_rol text;
begin
 if v_uid is null or p_activo is null then raise exception 'No autorizado.'; end if;
 select rol into v_rol from public.profiles
 where id=v_uid and rol in ('owner','admin')
   and activo=true and estado_registro='aprobado';
 if v_rol is null then raise exception 'Solo Administración puede cambiar el servicio del QR.'; end if;
 -- Serializa con el intercambio del ESP32 para evitar carreras con pulsos pendientes.
 perform 1 from access_private.device where singleton for update;
 update public.portero_servicio_config set
   activo=p_activo, actualizado_at=now(), actualizado_por=v_uid
 where singleton=true;
 if not found then raise exception 'No existe la configuración del Portero Virtual.'; end if;
 if not p_activo then
   -- Cancela únicamente órdenes del Portero Virtual que aún no se despacharon.
   update access_private.commands c set state='cancelled'
   where c.state='pending' and
     (c.delivery_id is not null
      or exists(select 1 from public.visitor_pass_access_log v where v.command_id=c.id)
      or exists(select 1 from public.portero_owner_chats ch where ch.access_command_id=c.id));
   update public.entregas_contacto set estado='expirado'
   where estado='esperando';
 end if;
 return jsonb_build_object('ok',true,'activo',p_activo,'actualizado_at',now());
end
$$;
revoke all on function public.portero_servicio_cambiar(boolean) from public,anon;
grant execute on function public.portero_servicio_cambiar(boolean) to authenticated,service_role;

-- Bloquea las altas de solicitudes incluso si alguien salta el formulario web.
create or replace function access_private.portero_bloquear_nuevas_solicitudes()
returns trigger language plpgsql set search_path=''
as $$
begin
 if not access_private.portero_servicio_activo() then
   raise exception 'Portero Virtual fuera de servicio por mantenimiento.';
 end if;
 return new;
end
$$;
revoke all on function access_private.portero_bloquear_nuevas_solicitudes() from public,anon,authenticated;

drop trigger if exists trg_portero_pausa_entregas on public.entregas_contacto;
create trigger trg_portero_pausa_entregas
 before insert on public.entregas_contacto
 for each row execute function access_private.portero_bloquear_nuevas_solicitudes();

drop trigger if exists trg_portero_pausa_chats on public.portero_owner_chats;
create trigger trg_portero_pausa_chats
 before insert on public.portero_owner_chats
 for each row execute function access_private.portero_bloquear_nuevas_solicitudes();

-- También bloquea aperturas con códigos de visita y aprobaciones pendientes.
-- Guard public.visitor_pass_request(text,text,text)
CREATE OR REPLACE FUNCTION public.visitor_pass_request(p_name text, p_house text, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.visitor_passes%rowtype; d access_private.device%rowtype; e jsonb; c uuid;
begin
 if not access_private.portero_servicio_activo() then
  return jsonb_build_object('accepted',false,'message','Portero Virtual fuera de servicio por mantenimiento. Intenta más tarde o contacta a Administración.');
 end if;
 -- El nombre debe declararse antes de cualquier autorización física.
 if regexp_replace(coalesce(p_name,''),'[[:space:]]','','g') = '' then
  raise exception 'El nombre del visitante es obligatorio.' using errcode='22023';
 end if;
 -- Solo viviendas 40-66 antes de verificar códigos o enviar comandos.
 if btrim(coalesce(p_house,'')) !~ '^(4[0-9]|5[0-9]|6[0-6])$' then
  return jsonb_build_object('accepted',false,
   'message','Solo se aceptan solicitudes para las casas de la 40 a la 66.');
 end if;
 if length(btrim(coalesce(p_name,''))) > 100 or length(btrim(coalesce(p_house,''))) not between 1 and 20
 or upper(btrim(coalesce(p_code,''))) !~ '^([A-HJ-NP-Z][0-9]{6}|[A-F0-9]{16})$' then
  raise exception 'Datos de visita no válidos o código fuera de horario.';
 end if;
 perform pg_advisory_xact_lock(hashtext('visitor-pass:'||lower(btrim(p_house))));
 if (select count(*) from access_private.visitor_code_attempts where house_input=lower(btrim(p_house)) and attempted_at>now()-interval '10 minutes')>=8 then
  return jsonb_build_object('accepted',false,'message','Demasiados intentos. Espera 10 minutos antes de volver a intentar.');
 end if;
 select v0.* into v from public.visitor_passes v0 join public.casas h on h.id=v0.house_id
 where v0.code_hash=extensions.digest(upper(btrim(p_code)),'sha256')
  and lower(btrim(h.numero))=lower(btrim(p_house))
 for update of v0;
 if v.id is null then
  insert into access_private.visitor_code_attempts(house_input) values(lower(btrim(p_house)));
  return jsonb_build_object('accepted',false,'message','Código o casa incorrectos.');
 end if;
 if v.revoked_at is not null or now()<v.starts_at or now()>=v.ends_at
 or (v.is_permanent and v.approval_status<>'approved')
 or (not v.is_permanent and v.used_count>=20) then
  raise exception 'Datos de visita no válidos o código fuera de horario.';
 end if;
 if v.last_used_at>now()-interval '45 seconds' then raise exception 'Espera antes de volver a solicitar apertura.'; end if;
 e:=access_private.eligibility(v.sponsor_id);
 if not coalesce((e->>'allowed')::boolean,false) then raise exception 'Acceso no disponible. Contacta al residente.'; end if;
 select * into d from access_private.device where singleton for update;
 if d.singleton is null or d.enabled is not true or d.residents_enabled is not true or d.last_seen<=now()-interval '15 seconds' then
  raise exception 'Portón no disponible. Contacta al residente.';
 end if;
 if d.last_requested>now()-interval '5 seconds' then raise exception 'Espera unos segundos antes de otra solicitud.'; end if;
 update access_private.commands set state='expired' where state='pending' and expires_at<=now();
 if exists(select 1 from access_private.commands where state='pending') then raise exception 'El equipo está procesando otra orden.'; end if;
 insert into access_private.commands(actor_id,target,expires_at) values(v.sponsor_id,'porton',now()+interval '12 seconds') returning id into c;
 insert into public.visitor_pass_access_log(pass_id,command_id,visitor_name,house_id) values(v.id,c,btrim(p_name),v.house_id);
 update public.visitor_passes set used_count=used_count+1,last_used_at=now() where id=v.id;
 update access_private.device set last_requested=now() where singleton;
 return jsonb_build_object('accepted',true,'command_id',c,'access_at',now(),'message','Solicitud enviada al portón. Comprueba físicamente que la entrada esté libre y haya abierto.');
end $function$
;

-- Guard access_private.request_delivery(uuid,text)
CREATE OR REPLACE FUNCTION access_private.request_delivery(p_delivery uuid, p_target text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.profiles%rowtype; d public.entregas_contacto%rowtype;
 c access_private.commands%rowtype; result uuid;
begin
 if not access_private.portero_servicio_activo() then
  raise exception 'Portero Virtual fuera de servicio por mantenimiento.';
 end if;
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_target is null or p_target not in ('peatonal','porton') then raise exception 'Acceso no válido.'; end if;
 select * into p from public.profiles where id=auth.uid();
 if p.rol is distinct from 'residente' or p.activo is not true or coalesce(p.estado_registro,'aprobado')<>'aprobado' then
   raise exception 'Se requiere un residente activo y aprobado.';
 end if;
 select * into d from public.entregas_contacto where id=p_delivery for update;
 if d.id is null or p.casa_id is null or d.casa_id is distinct from p.casa_id then raise exception 'Solicitud no disponible para tu casa.'; end if;
 select * into c from access_private.commands where delivery_id=d.id;
 if c.id is not null then
   if c.actor_id=auth.uid() and c.target=p_target then return c.id; end if;
   raise exception 'Esta solicitud ya tiene una orden de acceso.';
 end if;
 if d.estado<>'esperando' or d.expires_at<=now() then raise exception 'La solicitud ya fue respondida o expiró.'; end if;
 -- Reuse device availability, resident enablement, arrears and rate checks.
 result:=access_private.request(p_target);
 update access_private.commands set delivery_id=d.id,expires_at=least(expires_at,d.expires_at) where id=result;
 update public.entregas_contacto set estado='respondido',
 respuesta=case when p_target='peatonal' then 'acceso_peatonal' else 'acceso_porton' end,
 respondido_por=auth.uid(),respondido_at=now() where id=d.id;
 return result;
end $function$
;

-- Guard public.portero_owner_autorizar(uuid)
CREATE OR REPLACE FUNCTION public.portero_owner_autorizar(p_chat_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_owner public.profiles%rowtype;
 v_chat public.portero_owner_chats%rowtype;
 v_entrega public.entregas_contacto%rowtype;
 v_casa public.casas%rowtype;
 v_orden uuid;
 v_ahora timestamptz := now();
BEGIN
 IF NOT access_private.portero_servicio_activo() THEN
  RAISE EXCEPTION 'Portero Virtual fuera de servicio por mantenimiento.';
 END IF;
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
END $function$
;

comment on table public.portero_servicio_config is
 'Pausa del QR de repartidores y visitas; por defecto activo. Sólo Admin/Sistema Admin pueden cambiarlo.';
