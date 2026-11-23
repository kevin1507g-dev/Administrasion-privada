-- Paquetería: ventana real de Modo Evento limitada a 3 minutos.
-- No se envían comandos físicos al aplicar esta migración.
-- El firmware existente controla la salida Evento GPIO25 y el watchdog local.
create table if not exists public.parcel_window (
  id boolean primary key default true check(id),
  started_at timestamptz,
  ends_at timestamptz,
  started_by uuid references auth.users(id),
  stopped_at timestamptz,
  stopped_by uuid references auth.users(id),
  constraint parcel_window_max_three_minutes
    check(ends_at is null or
      (started_at is not null and ends_at>started_at
       and ends_at<=started_at+interval '3 minutes'))
);
alter table public.parcel_window enable row level security;
revoke all on public.parcel_window from public,anon,authenticated;
insert into public.parcel_window(id) values(true) on conflict(id) do nothing;

create table if not exists public.parcel_window_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null check(action in ('start','stop')),
  event_at timestamptz not null default now(),
  ends_at timestamptz
);
alter table public.parcel_window_audit enable row level security;
revoke all on public.parcel_window_audit from public,anon,authenticated;

create or replace function public.parcel_window_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.profiles%rowtype;
  w public.parcel_window%rowtype;
  permitted boolean;
  ready boolean;
  running boolean;
  reason text;
begin
  select * into p from public.profiles where id=auth.uid();
  permitted := p.id is not null and p.activo is true
    and p.estado_registro='aprobado'
    and p.rol in ('owner','admin');
  select * into w from public.parcel_window where id=true;
  select coalesce(e.enabled,false)
      and coalesce(d.enabled,false)
      and d.last_seen>now()-interval '15 seconds'
      and (e.paused_until is null or e.paused_until<=now())
    into ready
    from access_private.event_mode e
    cross join access_private.device d
    where e.singleton and d.singleton;
  running := coalesce(w.started_at is not null and w.stopped_at is null
    and w.ends_at>now()
    and w.ends_at<=w.started_at+interval '3 minutes',false);
  reason := case
    when not coalesce(permitted,false) then 'Solo Administrador o Sistema Admin autorizado.'
    when not coalesce(ready,false) then 'Modo Evento no habilitado o ESP32 sin conexión.'
    when running then 'Ventana de Paquetería activa.'
    else 'Paquetería disponible.' end;
  return jsonb_build_object(
    'allowed',coalesce(permitted,false),
    'active',running,
    'hardware_ready',coalesce(ready,false),
    'until',case when running then w.ends_at else null end,
    'reason',reason
  );
end;
$$;
revoke all on function public.parcel_window_status() from public,anon;
grant execute on function public.parcel_window_status() to authenticated;

create or replace function public.parcel_window_manage(p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  st jsonb;
  w public.parcel_window%rowtype;
begin
  if p_action is null or p_action not in ('start','stop') then
    raise exception 'Acción inválida.';
  end if;
  -- Validación en el servidor, no confiar en el rol visible del navegador.
  st:=public.parcel_window_status();
  if coalesce((st->>'allowed')::boolean,false) is not true then
    raise exception 'Solo Administrador o Sistema Admin.';
  end if;

  -- Serializar Paquetería con la ventana del camión de basura.
  perform pg_advisory_xact_lock(7770123456::bigint);
  select * into w from public.parcel_window where id=true for update;
  if w.id is null then raise exception 'Ventana de Paquetería no disponible.'; end if;

  if p_action='start' then
    st:=public.parcel_window_status();
    if coalesce((st->>'hardware_ready')::boolean,false) is not true then
      raise exception 'Modo Evento no habilitado o ESP32 sin conexión.';
    end if;
    if w.ends_at>now() and w.stopped_at is null then
      raise exception 'La ventana de Paquetería ya está activa.';
    end if;
    if w.started_at>now()-interval '30 seconds' then
      raise exception 'Espera 30 segundos antes de solicitar otra ventana.';
    end if;
    if exists (
      select 1 from public.garbage_window g
      where g.id=true and g.ends_at>now() and g.stopped_at is null
    ) then
      raise exception 'Hay una ventana de camión de basura activa.';
    end if;
    if exists (
      select 1 from access_private.event_mode e
      where e.singleton and e.test_until>now()
    ) then
      raise exception 'El Modo Evento está en una prueba de mantenimiento.';
    end if;
    -- No interferir con reservas de portón que se solapen con los 3 minutos.
    if exists (
      select 1 from public.reservaciones r
      where r.estado='aprobada' and r.area='Portón'
        and r.hora_fin>r.hora_inicio
        and r.hora_fin-r.hora_inicio<=interval '8 hours'
        and now()<((r.fecha+r.hora_fin) at time zone 'America/Mexico_City')
        and now()+interval '3 minutes'>((r.fecha+r.hora_inicio) at time zone 'America/Mexico_City')
    ) then
      raise exception 'Hay una reservación del portón durante los próximos 3 minutos.';
    end if;
    update public.parcel_window
    set started_at=now(),ends_at=now()+interval '3 minutes',
        started_by=auth.uid(),stopped_at=null,stopped_by=null
    where id=true;
  else
    if w.ends_at is null or w.ends_at<=now() or w.stopped_at is not null then
      raise exception 'No hay ventana de Paquetería activa.';
    end if;
    update public.parcel_window set stopped_at=now(),stopped_by=auth.uid()
    where id=true;
  end if;

  insert into public.parcel_window_audit(actor_id,action,ends_at)
  select auth.uid(),p_action,
    case when p_action='start' then ends_at else null end
  from public.parcel_window where id=true;
  return public.parcel_window_status();
end;
$$;
revoke all on function public.parcel_window_manage(text) from public,anon;
grant execute on function public.parcel_window_manage(text) to authenticated;

-- Conserva el mismo comportamiento anterior del calendario y añade 'parcel'.
CREATE OR REPLACE FUNCTION access_private.event_schedule()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_enabled boolean; v_device_enabled boolean; v_pause timestamptz;
 v_test timestamptz; v_until timestamptz; v_garbage timestamptz; v_parcel timestamptz;
begin
 select enabled,paused_until,test_until into v_enabled,v_pause,v_test
 from access_private.event_mode where singleton;
 select enabled into v_device_enabled from access_private.device where singleton;
 if not coalesce(v_device_enabled,false) or (v_pause is not null and v_pause>now()) then
  return jsonb_build_object('active',false,'until',null,'source','none');
 end if;
 if v_test is not null and v_test>now() and v_test<=now()+interval '12 seconds' then
  return jsonb_build_object('active',true,
   'until',floor(extract(epoch from v_test))::bigint,'source','test');
 end if;
 if not coalesce(v_enabled,false) then
  return jsonb_build_object('active',false,'until',null,'source','none');
 end if;
 select max((r.fecha+r.hora_fin) at time zone 'America/Mexico_City') into v_until
 from public.reservaciones r
 where r.estado='aprobada' and r.area='Portón'
   and r.fecha is not null and r.hora_inicio is not null and r.hora_fin is not null
   and r.hora_fin>r.hora_inicio and r.hora_fin-r.hora_inicio<=interval '8 hours'
   and now()>=((r.fecha+r.hora_inicio) at time zone 'America/Mexico_City')
   and now()<((r.fecha+r.hora_fin) at time zone 'America/Mexico_City');
 select ends_at into v_garbage from public.garbage_window
 where id=true and stopped_at is null and ends_at>now();
 -- Ventana independiente para paquetería: nunca supera tres minutos.
 select least(ends_at,started_at+interval '3 minutes') into v_parcel
 from public.parcel_window
 where id=true and stopped_at is null and started_at is not null
   and least(ends_at,started_at+interval '3 minutes')>now();
 if v_until is not null or v_garbage is not null or v_parcel is not null then
  return jsonb_build_object('active',true,
   'until',floor(extract(epoch from greatest(coalesce(v_until,'-infinity'::timestamptz),coalesce(v_garbage,'-infinity'::timestamptz),coalesce(v_parcel,'-infinity'::timestamptz))))::bigint,
   'source',case when v_until is not null then 'reservation' when v_garbage is not null then 'garbage' else 'parcel' end);
 end if;
 return jsonb_build_object('active',false,'until',null,'source','none');
end $function$
;

-- Previene conflicto cuando los usuarios activen basura mientras Paquetería esté activa.
CREATE OR REPLACE FUNCTION public.garbage_window_manage(p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st jsonb; w public.garbage_window%rowtype;
begin
 st:=public.garbage_window_status();
 if coalesce((st->>'allowed')::boolean,false) is not true then raise exception 'Usuario no autorizado.'; end if;
 if p_action='start' and coalesce((st->>'hardware_ready')::boolean,false) is not true then raise exception 'Modo Evento no habilitado o ESP32 desconectado.'; end if;
 if p_action not in ('start','stop') or p_action is null then raise exception 'Acción inválida.'; end if;
 -- La ventana de paquetería y recolección no pueden activarse simultáneamente.
 perform pg_advisory_xact_lock(7770123456::bigint);
 select * into w from public.garbage_window where id=true for update;
 if p_action='start' and exists (
    select 1 from public.parcel_window x
    where x.id=true and x.stopped_at is null and x.ends_at>now()
 ) then
   raise exception 'Paquetería está activa. Espera a que termine antes de iniciar recolección.';
 end if;
 if p_action='start' then
  if exists (
    select 1 from public.reservaciones r where r.estado='aprobada' and r.area='Portón'
      and r.hora_fin>r.hora_inicio
      and now()>=((r.fecha+r.hora_inicio) at time zone 'America/Mexico_City')
      and now()<((r.fecha+r.hora_fin) at time zone 'America/Mexico_City')
  ) then raise exception 'Hay una reservación de Portón activa. No se puede iniciar recolección.'; end if;
  if w.ends_at>now() and w.stopped_at is null then raise exception 'Ya existe una ventana activa.'; end if;
  update public.garbage_window set started_at=now(),ends_at=now()+interval '20 minutes',
   started_by=auth.uid(),stopped_at=null,stopped_by=null where id=true;
 else
  if w.ends_at<=now() or w.stopped_at is not null or w.ends_at is null then raise exception 'No hay ventana activa.'; end if;
  update public.garbage_window set stopped_at=now(),stopped_by=auth.uid() where id=true;
 end if;
 return public.garbage_window_status();
end $function$
;
