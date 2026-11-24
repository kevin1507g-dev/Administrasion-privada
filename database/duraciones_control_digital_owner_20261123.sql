-- Configuración de duraciones de Control Digital (2026-11-23).
-- Migración ya aplicada al proyecto; conservar para restauración y revisión de código.
-- Los tiempos nunca exceden los límites originales: basura 20 min, paquetería 3 min.
-- Los cambios solo se aplican a las futuras activaciones; no activan relés.
create table if not exists public.access_window_durations (
  singleton boolean primary key default true check(singleton),
  garbage_minutes integer not null default 20 check(garbage_minutes between 1 and 20),
  parcel_minutes integer not null default 3 check(parcel_minutes between 1 and 3),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.access_window_durations enable row level security;
revoke all on public.access_window_durations from public, anon, authenticated;
insert into public.access_window_durations(singleton) values (true)
on conflict(singleton) do nothing;

create table if not exists public.access_window_durations_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  garbage_minutes_before integer not null,
  garbage_minutes_after integer not null,
  parcel_minutes_before integer not null,
  parcel_minutes_after integer not null
);
alter table public.access_window_durations_audit enable row level security;
revoke all on public.access_window_durations_audit from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.access_window_durations_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g integer; p integer; changed timestamptz;
begin
  if not exists (
    select 1 from public.profiles x
    where x.id=auth.uid() and x.rol='owner'
      and x.activo is true
      and coalesce(x.estado_registro,'aprobado')='aprobado'
  ) then
    raise exception 'Solo Sistema Admin puede configurar los tiempos.';
  end if;
  select garbage_minutes,parcel_minutes,updated_at into g,p,changed
  from public.access_window_durations where singleton=true;
  return jsonb_build_object('garbage_minutes',g,'parcel_minutes',p,'updated_at',changed);
end;
$function$;

CREATE OR REPLACE FUNCTION public.access_window_durations_set(p_garbage_minutes integer, p_parcel_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_g integer; old_p integer;
begin
  if not exists (
    select 1 from public.profiles x
    where x.id=auth.uid() and x.rol='owner'
      and x.activo is true
      and coalesce(x.estado_registro,'aprobado')='aprobado'
  ) then
    raise exception 'Solo Sistema Admin puede configurar los tiempos.';
  end if;
  if p_garbage_minutes is null or p_garbage_minutes not between 1 and 20
     or p_parcel_minutes is null or p_parcel_minutes not between 1 and 3 then
    raise exception 'Rangos permitidos: basura de 1 a 20 minutos, paquetería de 1 a 3 minutos.';
  end if;
  -- Se serializa con las activaciones; ninguna ventana ya iniciada cambia de vencimiento.
  perform pg_advisory_xact_lock(7770123456::bigint);
  select garbage_minutes,parcel_minutes into old_g,old_p
  from public.access_window_durations where singleton=true for update;
  if old_g is null then raise exception 'No está disponible la configuración.'; end if;
  if old_g is distinct from p_garbage_minutes or old_p is distinct from p_parcel_minutes then
    update public.access_window_durations
      set garbage_minutes=p_garbage_minutes,
          parcel_minutes=p_parcel_minutes,
          updated_by=auth.uid(), updated_at=now()
    where singleton=true;
    insert into public.access_window_durations_audit (
      actor_id,garbage_minutes_before,garbage_minutes_after,parcel_minutes_before,parcel_minutes_after
    ) values (auth.uid(),old_g,p_garbage_minutes,old_p,p_parcel_minutes);
  end if;
  return public.access_window_durations_get();
end;
$function$;

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
  update public.garbage_window set started_at=now(),ends_at=now()+make_interval(mins=>coalesce((select garbage_minutes from public.access_window_durations where singleton=true),20)),
   started_by=auth.uid(),stopped_at=null,stopped_by=null where id=true;
 else
  if w.ends_at<=now() or w.stopped_at is not null or w.ends_at is null then raise exception 'No hay ventana activa.'; end if;
  update public.garbage_window set stopped_at=now(),stopped_by=auth.uid() where id=true;
 end if;
 return public.garbage_window_status();
end $function$;

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
 'reason',reason,
 'duration_seconds',(select garbage_minutes*60 from public.access_window_durations where singleton=true));
end $function$;

CREATE OR REPLACE FUNCTION public.parcel_window_manage(p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  st jsonb;
  w public.parcel_window%rowtype;
begin
  if p_action is null or p_action not in ('start','stop') then
    raise exception 'Acción inválida.';
  end if;
  -- Todas las autorizaciones se verifican en servidor contra auth.uid().
  st:=public.parcel_window_status();
  if coalesce((st->>'allowed')::boolean,false) is not true then
    raise exception '%',coalesce(st->>'reason','Cuenta no autorizada para Paquetería.');
  end if;

  -- Mantener exclusión mutua con basura y ventana de reserva.
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
    if exists (
      select 1 from public.reservaciones r
      where r.estado='aprobada' and r.area='Portón'
        and r.hora_fin>r.hora_inicio
        and r.hora_fin-r.hora_inicio<=interval '8 hours'
        and now()<((r.fecha+r.hora_fin) at time zone 'America/Mexico_City')
        and now()+make_interval(mins=>coalesce((select parcel_minutes from public.access_window_durations where singleton=true),3))>((r.fecha+r.hora_inicio) at time zone 'America/Mexico_City')
    ) then
      raise exception 'Hay una reservación del portón durante los próximos 3 minutos.';
    end if;
    update public.parcel_window
    set started_at=now(),ends_at=now()+make_interval(mins=>coalesce((select parcel_minutes from public.access_window_durations where singleton=true),3)),
        started_by=auth.uid(),stopped_at=null,stopped_by=null
    where id=true;
  else
    if w.ends_at is null or w.ends_at<=now() or w.stopped_at is not null then
      raise exception 'No hay ventana de Paquetería activa.';
    end if;
    if not (w.started_by=auth.uid() or
       exists(select 1 from public.profiles p
              where p.id=auth.uid() and p.rol in ('owner','admin'))) then
      raise exception 'Solo quien activó Paquetería o Administración puede cancelarla.';
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
$function$;

CREATE OR REPLACE FUNCTION public.parcel_window_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.profiles%rowtype;
  w public.parcel_window%rowtype;
  access_check jsonb;
  permitted boolean := false;
  ready boolean := false;
  running boolean := false;
  can_stop boolean := false;
  reason text;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.rol='residente' then
    access_check := access_private.eligibility(auth.uid());
  end if;
  permitted := p.id is not null
    and p.activo is true
    and coalesce(p.estado_registro,'aprobado')='aprobado'
    and p.rol in ('owner','admin','residente')
    and (p.rol in ('owner','admin') or
         coalesce((access_check->>'allowed')::boolean,false));
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
  can_stop := coalesce(permitted,false) and running and
    (p.rol in ('owner','admin') or w.started_by=auth.uid());
  reason := case
    when p.rol='residente' and not coalesce(permitted,false)
      then coalesce(access_check->>'reason','Cuenta de residente sin autorización.')
    when not coalesce(permitted,false) then 'Cuenta sin autorización para Paquetería.'
    when not coalesce(ready,false) then 'Modo Evento no habilitado o ESP32 sin conexión.'
    when running and not can_stop
      then 'Paquetería está en uso por otro residente. Espera a que termine.'
    when running then 'Ventana de Paquetería activa.'
    else 'Paquetería disponible.' end;
  return jsonb_build_object(
    'allowed',coalesce(permitted,false),
    'active',running,
    'can_stop',coalesce(can_stop,false),
    'hardware_ready',coalesce(ready,false),
    'until',case when running then w.ends_at else null end,
    'reason',reason,
    'duration_seconds',(select parcel_minutes*60 from public.access_window_durations where singleton=true)
  );
end;
$function$;

revoke all on function public.access_window_durations_get() from public,anon;
revoke all on function public.access_window_durations_set(integer,integer) from public,anon;
revoke all on function public.garbage_window_status() from public,anon;
revoke all on function public.garbage_window_manage(text) from public,anon;
revoke all on function public.parcel_window_status() from public,anon;
revoke all on function public.parcel_window_manage(text) from public,anon;
grant execute on function public.access_window_durations_get() to authenticated;
grant execute on function public.access_window_durations_set(integer,integer) to authenticated;
grant execute on function public.garbage_window_status() to authenticated;
grant execute on function public.garbage_window_manage(text) to authenticated;
grant execute on function public.parcel_window_status() to authenticated;
grant execute on function public.parcel_window_manage(text) to authenticated;
