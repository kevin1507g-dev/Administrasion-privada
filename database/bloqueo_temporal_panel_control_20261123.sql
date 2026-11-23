-- Bloqueo temporal de Control Digital: misma comprobación para Portón y Camión de basura.
-- No cambia ni activa ningún control real, usuario, cuota ni relé.
-- Estado solo para residentes; Admin/Sistema Admin conservan autorización.
CREATE OR REPLACE FUNCTION access_private.eligibility(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.profiles%rowtype;
  today date := (now() at time zone 'America/Mexico_City')::date;
begin
  select * into p from public.profiles where id=p_user;
  if p.id is null or p.activo is not true or coalesce(p.estado_registro,'aprobado')<>'aprobado' then
    return jsonb_build_object('allowed',false,'reason','Tu cuenta no está activa y aprobada.','admin',false);
  end if;
  if p.rol IN ('admin','owner') then
    return jsonb_build_object('allowed',true,'admin',true);
  end if;
  if p.rol<>'residente' or p.casa_id is null or
     not exists (select 1 from public.casas where id=p.casa_id and activo) then
    return jsonb_build_object('allowed',false,'reason','Necesitas una casa activa asignada.','admin',false);
  end if;

  -- Un control marcado como suspendido bloquea ambos botones digitales
  -- para todos los residentes asignados a la misma casa.
  if exists (
    select 1
    from public.controles_residenciales cr
    where cr.estado='suspendido'
      and (
        cr.casa_id=p.casa_id
        or (
          cr.casa_id is null and cr.residente_id is not null
          and exists (
            select 1 from public.profiles p2
            where p2.id=cr.residente_id and p2.casa_id=p.casa_id
          )
        )
        or (
          cr.casa_id is null and cr.residente_id is null
          and exists (
            select 1 from public.casas ca
            where ca.id=p.casa_id and ca.numero=cr.unidad
          )
        )
      )
  ) then
    return jsonb_build_object(
      'allowed',false,
      'reason','Control digital suspendido temporalmente por la administración para esta casa. Se deshabilitaron portón y acceso peatonal.',
      'temporary_locked',true,
      'admin',false
    );
  end if;

  -- Conserva el bloqueo automático por cuotas vencidas sin cambios.
  if exists (
    select 1 from public.cuotas q
    where coalesce(q.casa_id,(select pr.casa_id from public.profiles pr where pr.id=q.residente_id))=p.casa_id
      and coalesce(q.archivada,false)=false -- Las cuotas archivadas no generan suspensión
      and q.vencimiento<=today-10
      and q.monto-coalesce(
        (select sum(pg.monto) from public.pagos pg where pg.cuota_id=q.id),0
      )>0.009
  ) then
    return jsonb_build_object(
      'allowed',false,
      'reason','Acceso digital suspendido: tu casa tiene saldo pendiente con 10 días o más de atraso.',
      'admin',false
    );
  end if;
  return jsonb_build_object('allowed',true,'admin',false);
end
$function$

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
   'temporary_locked',coalesce((e->>'temporary_locked')::boolean,false),
   'event_active',v_event_active,'event_until',v_event->'until',
   'reason',reason,'grace_days',10,'command_state',case when c.state='pending' and c.expires_at<=now() then 'expired' when c.state='dispatched' and c.expires_at+interval '15 seconds'<=now() then 'unconfirmed' else c.state end);
end $function$

CREATE OR REPLACE FUNCTION public.garbage_window_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.profiles%rowtype; w public.garbage_window%rowtype; permitted boolean; ready boolean; reason text; temporary_locked boolean;
begin
 select * into p from public.profiles where id=auth.uid();
 -- El bloqueo de controles de la casa también impide recolección a residentes.
 temporary_locked:=p.rol='residente' and coalesce((access_private.eligibility(auth.uid())->>'temporary_locked')::boolean,false);
 permitted:=p.id is not null and p.activo is true
  and coalesce(p.estado_registro,'aprobado')='aprobado'
  and p.rol in ('admin','owner','residente')
  and (p.rol IN ('admin','owner') or (p.casa_id is not null and exists(select 1 from public.casas c where c.id=p.casa_id and c.activo)))
  and not coalesce(temporary_locked,false);
 select * into w from public.garbage_window where id=true;
 select coalesce(e.enabled,false) and coalesce(d.enabled,false) and d.last_seen>now()-interval '15 seconds' and (e.paused_until is null or e.paused_until<=now()) into ready from access_private.event_mode e cross join access_private.device d where e.singleton and d.singleton;
 reason:=case when coalesce(temporary_locked,false) then 'Bloqueo temporal de controles de tu casa. Contacta a administración.' when not permitted then 'Cuenta sin autorización.' when not coalesce(ready,false) then 'Modo Evento físico no habilitado o ESP32 sin conexión. Contacta a administración.' else 'Sin ventana activa.' end;
 return jsonb_build_object('allowed',permitted,
 'active',coalesce(w.ends_at>now() and w.stopped_at is null,false),'hardware_ready',coalesce(ready,false),
 'until',case when w.ends_at>now() and w.stopped_at is null then w.ends_at else null end,
 'reason',reason);
end $function$

