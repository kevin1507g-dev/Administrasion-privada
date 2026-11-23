-- Versión vigente de Paquetería para residentes autorizados.
-- Aplicada en Supabase como migración paqueteria_tres_minutos_residentes_autorizados.
-- Requiere parcel_window, parcel_window_audit y access_private.eligibility(uuid).
-- No envía pulsos de apertura por sí misma. Mantiene ventana máxima de 3 minutos.

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
    'reason',reason
  );
end;
$function$;

revoke all on function public.parcel_window_status() from public, anon;
grant execute on function public.parcel_window_status() to authenticated;
revoke all on function public.parcel_window_manage(text) from public, anon;
grant execute on function public.parcel_window_manage(text) to authenticated;
