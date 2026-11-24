-- Ampliación limitada de las duraciones para el panel de Sistema Admin.
-- Camión de basura: 1 a 60 minutos. Paquetería: 1 a 15 minutos.
-- Conserva expiración del servidor, watchdog del ESP32 y autorización original.
-- No inicia ni cancela ventanas actuales ni altera duraciones guardadas.
alter table public.access_window_durations
  drop constraint if exists access_window_durations_garbage_minutes_check,
  drop constraint if exists access_window_durations_parcel_minutes_check;
alter table public.access_window_durations
  add constraint access_window_durations_garbage_minutes_check
    check(garbage_minutes between 1 and 60),
  add constraint access_window_durations_parcel_minutes_check
    check(parcel_minutes between 1 and 15);
alter table public.parcel_window
  drop constraint if exists parcel_window_max_three_minutes;
alter table public.parcel_window
  add constraint parcel_window_max_fifteen_minutes
    check(ends_at is null or (started_at is not null and ends_at>started_at
      and ends_at<=started_at+interval '15 minutes'));

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
  if p_garbage_minutes is null or p_garbage_minutes not between 1 and 60
     or p_parcel_minutes is null or p_parcel_minutes not between 1 and 15 then
    raise exception 'Rangos permitidos: basura de 1 a 60 minutos, paquetería de 1 a 15 minutos.';
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
    and w.ends_at<=w.started_at+interval '15 minutes',false);
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
 select least(ends_at,started_at+interval '15 minutes') into v_parcel
 from public.parcel_window
 where id=true and stopped_at is null and started_at is not null
   and least(ends_at,started_at+interval '15 minutes')>now();
 if v_until is not null or v_garbage is not null or v_parcel is not null then
  return jsonb_build_object('active',true,
   'until',floor(extract(epoch from greatest(coalesce(v_until,'-infinity'::timestamptz),coalesce(v_garbage,'-infinity'::timestamptz),coalesce(v_parcel,'-infinity'::timestamptz))))::bigint,
   'source',case when v_until is not null then 'reservation' when v_garbage is not null then 'garbage' else 'parcel' end);
 end if;
 return jsonb_build_object('active',false,'until',null,'source','none');
end $function$;
revoke all on function public.access_window_durations_set(integer,integer) from public,anon;
revoke all on function public.parcel_window_status() from public,anon;
grant execute on function public.access_window_durations_set(integer,integer) to authenticated;
grant execute on function public.parcel_window_status() to authenticated;
