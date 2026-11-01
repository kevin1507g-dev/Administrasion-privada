-- Bloqueo de pulsos digitales mientras Modo Evento (reservación, basura o prueba) está activo.
-- Usa access_private.event_schedule() para sincronizar estado, solicitudes y entrega al ESP32.
-- Las funciones existentes conservan firma, SECURITY DEFINER y permisos previos.

CREATE OR REPLACE FUNCTION access_private.request(p_target text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e jsonb; d access_private.device%rowtype; result uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_target not in ('peatonal','porton') or p_target is null then raise exception 'Acceso no válido.'; end if;
 select * into d from access_private.device where singleton for update;
 if coalesce((access_private.event_schedule()->>'active')::boolean,false) then
  raise exception 'Modo Evento activo: el Control Digital está bloqueado hasta que finalice.';
 end if;
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
end $function$;

CREATE OR REPLACE FUNCTION access_private.status(p_command uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e jsonb; d access_private.device%rowtype; c access_private.commands%rowtype; online boolean; reason text; v_event jsonb; v_event_active boolean;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 e:=access_private.eligibility(auth.uid());
 select * into d from access_private.device where singleton;
 online:=coalesce(d.enabled and d.last_seen>now()-interval '15 seconds',false);
 v_event:=access_private.event_schedule();
 v_event_active:=coalesce((v_event->>'active')::boolean,false);
 reason:=case when v_event_active then 'Modo Evento activo: el Control Digital está bloqueado hasta que finalice.'
   when not (e->>'allowed')::boolean then e->>'reason'
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
   'allowed',(e->>'allowed')::boolean and online and not v_event_active and ((e->>'admin')::boolean or coalesce(d.residents_enabled,false)),
   'event_active',v_event_active,'event_until',v_event->'until',
   'reason',reason,'grace_days',10,'command_state',case when c.state='pending' and c.expires_at<=now() then 'expired' when c.state='dispatched' and c.expires_at+interval '15 seconds'<=now() then 'unconfirmed' else c.state end);
end $function$;

CREATE OR REPLACE FUNCTION access_private.exchange(p_token text, p_boot boolean, p_ack uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 -- Rechaza las órdenes en cola durante el Modo Evento sin detener el heartbeat ni el evento.
 if coalesce((access_private.event_schedule()->>'active')::boolean,false) then
   update access_private.commands set state='cancelled' where state='pending';
   return jsonb_build_object('ok',true,'command',null);
 end if;
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
end $function$;
