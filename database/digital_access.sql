-- Digital access: private queue, per-device credential, 10-day house arrears.
-- RF remotes and the existing control-suspension routines are not changed.
create schema if not exists access_private;
revoke all on schema access_private from public;
grant usage on schema access_private to anon, authenticated;

create table access_private.device (
  singleton boolean primary key default true check(singleton),
  token_hash bytea not null,
  enabled boolean not null default true,
  residents_enabled boolean not null default false,
  last_seen timestamptz,
  last_requested timestamptz,
  updated_at timestamptz not null default now()
);
create table access_private.commands (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  target text not null check(target in ('peatonal','porton')),
  state text not null default 'pending' check(state in ('pending','dispatched','pulse_confirmed','expired','cancelled','unconfirmed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '12 seconds'),
  dispatched_at timestamptz,
  confirmed_at timestamptz
);
create index digital_commands_pending on access_private.commands(created_at) where state='pending';
create index digital_commands_actor on access_private.commands(actor_id,created_at desc);
alter table access_private.device enable row level security;
alter table access_private.commands enable row level security;
revoke all on all tables in schema access_private from public,anon,authenticated;

create function access_private.eligibility(p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; today date := (now() at time zone 'America/Mexico_City')::date;
begin
 select * into p from public.profiles where id=p_user;
 if p.id is null or p.activo is not true or coalesce(p.estado_registro,'aprobado')<>'aprobado' then
   return jsonb_build_object('allowed',false,'reason','Tu cuenta no está activa y aprobada.','admin',false);
 end if;
 if p.rol='admin' then return jsonb_build_object('allowed',true,'admin',true); end if;
 if p.rol<>'residente' or p.casa_id is null or not exists(select 1 from public.casas where id=p.casa_id and activo) then
   return jsonb_build_object('allowed',false,'reason','Necesitas una casa activa asignada.','admin',false);
 end if;
 if exists (
   select 1 from public.cuotas q
   where coalesce(q.casa_id,(select pr.casa_id from public.profiles pr where pr.id=q.residente_id))=p.casa_id
     and q.vencimiento<=today-10
     and q.monto-coalesce((select sum(pg.monto) from public.pagos pg where pg.cuota_id=q.id),0)>0.009
 ) then
   return jsonb_build_object('allowed',false,'reason','Acceso digital suspendido: tu casa tiene saldo pendiente con 10 días o más de atraso.','admin',false);
 end if;
 return jsonb_build_object('allowed',true,'admin',false);
end $$;

create function access_private.status(p_command uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb; d access_private.device%rowtype; c access_private.commands%rowtype; online boolean; reason text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 e:=access_private.eligibility(auth.uid());
 select * into d from access_private.device where singleton;
 online:=coalesce(d.enabled and d.last_seen>now()-interval '15 seconds',false);
 reason:=case when not (e->>'allowed')::boolean then e->>'reason'
   when d.singleton is null then 'Pendiente de vincular el ESP32.'
   when not d.enabled then 'Control digital pausado por la administración.'
   when not (e->>'admin')::boolean and not d.residents_enabled then 'Pruebas del equipo en curso. Aún no está habilitado para residentes.'
   when not online then 'ESP32 sin conexión reciente. No se enviarán órdenes.'
   else 'Equipo conectado. Cada botón envía un pulso de un segundo.' end;
 if p_command is not null then
   select * into c from access_private.commands where id=p_command and (actor_id=auth.uid() or (e->>'admin')::boolean);
 end if;
 return jsonb_build_object('registered',d.singleton is not null,'online',online,'enabled',coalesce(d.enabled,false),
   'residents_enabled',coalesce(d.residents_enabled,false),'admin',(e->>'admin')::boolean,
   'allowed',(e->>'allowed')::boolean and online and ((e->>'admin')::boolean or coalesce(d.residents_enabled,false)),
   'reason',reason,'grace_days',10,'command_state',case when c.state='pending' and c.expires_at<=now() then 'expired' when c.state='dispatched' and c.expires_at+interval '15 seconds'<=now() then 'unconfirmed' else c.state end);
end $$;

create function access_private.manage(p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb; token text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 e:=access_private.eligibility(auth.uid());
 if not (e->>'admin')::boolean then raise exception 'Solo administración.'; end if;
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
end $$;

create function access_private.request(p_target text)
returns uuid language plpgsql security definer set search_path='' as $$
declare e jsonb; d access_private.device%rowtype; result uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_target not in ('peatonal','porton') or p_target is null then raise exception 'Acceso no válido.'; end if;
 select * into d from access_private.device where singleton for update;
 e:=access_private.eligibility(auth.uid());
 if not (e->>'allowed')::boolean then raise exception '%',e->>'reason'; end if;
 if d.singleton is null or not d.enabled or d.last_seen is null or d.last_seen<=now()-interval '15 seconds' then raise exception 'ESP32 desconectado o pausado.'; end if;
 if not (e->>'admin')::boolean and not d.residents_enabled then raise exception 'Equipo en pruebas de administración.'; end if;
 if d.last_requested>now()-interval '3 seconds' then raise exception 'Espera unos segundos antes de otra orden.'; end if;
 if exists(select 1 from access_private.commands where actor_id=auth.uid() and created_at>now()-interval '5 seconds') then raise exception 'Espera cinco segundos entre órdenes.'; end if;
 update access_private.commands set state='expired' where state='pending' and expires_at<=now();
 if exists(select 1 from access_private.commands where state='pending') then raise exception 'Hay una orden pendiente. Espera su resultado.'; end if;
 insert into access_private.commands(actor_id,target) values(auth.uid(),p_target) returning id into result;
 update access_private.device set last_requested=now() where singleton;
 return result;
end $$;

-- Device authenticates with its own random credential, never a service-role key.
create function access_private.exchange(p_token text,p_boot boolean,p_ack uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d access_private.device%rowtype; c access_private.commands%rowtype; e jsonb;
begin
 if p_token is null or length(p_token)<>64 then raise exception 'Credencial de equipo inválida.'; end if;
 select * into d from access_private.device where singleton for update;
 if d.singleton is null or d.token_hash<>extensions.digest(p_token,'sha256') then raise exception 'Credencial de equipo inválida.'; end if;
 update access_private.device set last_seen=now() where singleton;
 if p_ack is not null then
   update access_private.commands set state='pulse_confirmed',confirmed_at=now() where id=p_ack and state='dispatched';
 end if;
 if p_boot is true then
   update access_private.commands set state='cancelled' where state='pending';
   return jsonb_build_object('ok',true,'command',null);
 end if;
 update access_private.commands set state='expired' where state='pending' and expires_at<=now();
 if not d.enabled then return jsonb_build_object('ok',true,'command',null); end if;
 select * into c from access_private.commands where state='pending' and expires_at>now() order by created_at limit 1 for update;
 if c.id is null then return jsonb_build_object('ok',true,'command',null); end if;
 -- Recheck house/account permissions at dispatch, not just when clicked.
 e:=access_private.eligibility(c.actor_id);
 if not (e->>'allowed')::boolean or (not (e->>'admin')::boolean and not d.residents_enabled) then
   update access_private.commands set state='cancelled' where id=c.id;
   return jsonb_build_object('ok',true,'command',null);
 end if;
 update access_private.commands set state='dispatched',dispatched_at=now() where id=c.id;
 -- At-most-once delivery: no retries of a dispatched command.
 return jsonb_build_object('ok',true,'command',jsonb_build_object('id',c.id,'target',c.target,'expires',floor(extract(epoch from c.expires_at))::bigint));
end $$;

revoke all on all functions in schema access_private from public,anon,authenticated;
grant execute on function access_private.status(uuid),access_private.manage(text),access_private.request(text) to authenticated;
grant execute on function access_private.exchange(text,boolean,uuid) to anon,authenticated;

create function public.digital_access_status(p_command uuid default null) returns jsonb language sql security invoker set search_path='' as $$select access_private.status(p_command)$$;
create function public.digital_access_manage(p_action text) returns jsonb language sql security invoker set search_path='' as $$select access_private.manage(p_action)$$;
create function public.digital_access_request(p_target text) returns uuid language sql security invoker set search_path='' as $$select access_private.request(p_target)$$;
create function public.digital_access_exchange(p_token text,p_boot boolean default false,p_ack uuid default null) returns jsonb language sql security invoker set search_path='' as $$select access_private.exchange(p_token,p_boot,p_ack)$$;
revoke all on function public.digital_access_status(uuid),public.digital_access_manage(text),public.digital_access_request(text),public.digital_access_exchange(text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.digital_access_status(uuid),public.digital_access_manage(text),public.digital_access_request(text) to authenticated;
grant execute on function public.digital_access_exchange(text,boolean,uuid) to anon,authenticated;
notify pgrst,'reload schema';
