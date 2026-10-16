-- Recolección de basura: ventana compartida de 20 minutos.
-- Integra el Modo Evento existente, sin modificar el firmware.
-- Permanece inactivo si access_private.event_mode.enabled = false.
create table if not exists public.garbage_window (
 id boolean primary key default true check(id),
 started_at timestamptz,
 ends_at timestamptz,
 started_by uuid references auth.users(id),
 stopped_at timestamptz,
 stopped_by uuid references auth.users(id)
);
alter table public.garbage_window enable row level security;
revoke all on public.garbage_window from anon, authenticated;
insert into public.garbage_window(id) values(true) on conflict(id) do nothing;

create or replace function public.garbage_window_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; w public.garbage_window%rowtype; permitted boolean; ready boolean; reason text;
begin
 select * into p from public.profiles where id=auth.uid();
 permitted:=p.id is not null and p.activo is true
  and coalesce(p.estado_registro,'aprobado')='aprobado'
  and p.rol in ('admin','residente')
  and (p.rol='admin' or (p.casa_id is not null and exists(select 1 from public.casas c where c.id=p.casa_id and c.activo)));
 select * into w from public.garbage_window where id=true;
 select coalesce(e.enabled,false) and coalesce(d.enabled,false) and d.last_seen>now()-interval '15 seconds' and (e.paused_until is null or e.paused_until<=now()) into ready from access_private.event_mode e cross join access_private.device d where e.singleton and d.singleton;
 reason:=case when not permitted then 'Cuenta sin autorización.' when not coalesce(ready,false) then 'Modo Evento físico no habilitado o ESP32 sin conexión. Contacta a administración.' else 'Sin ventana activa.' end;
 return jsonb_build_object('allowed',permitted,
 'active',coalesce(w.ends_at>now() and w.stopped_at is null,false),'hardware_ready',coalesce(ready,false),
 'until',case when w.ends_at>now() and w.stopped_at is null then w.ends_at else null end,
 'reason',reason);
end $$;

create or replace function public.garbage_window_manage(p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb; w public.garbage_window%rowtype;
begin
 st:=public.garbage_window_status();
 if coalesce((st->>'allowed')::boolean,false) is not true then raise exception 'Usuario no autorizado.'; end if;
 if p_action='start' and coalesce((st->>'hardware_ready')::boolean,false) is not true then raise exception 'Modo Evento no habilitado o ESP32 desconectado.'; end if;
 if p_action not in ('start','stop') or p_action is null then raise exception 'Acción inválida.'; end if;
 select * into w from public.garbage_window where id=true for update;
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
end $$;
revoke all on function public.garbage_window_status() from public,anon;
revoke all on function public.garbage_window_manage(text) from public,anon;
grant execute on function public.garbage_window_status() to authenticated;
grant execute on function public.garbage_window_manage(text) to authenticated;

-- Amplía el calendario del Modo Evento para aceptar la ventana de basura.
-- Conserva las pruebas de 12 segundos y las reservaciones aprobadas.
create or replace function access_private.event_schedule()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_enabled boolean; v_device_enabled boolean; v_pause timestamptz;
 v_test timestamptz; v_until timestamptz; v_garbage timestamptz;
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
 if v_until is not null or v_garbage is not null then
  return jsonb_build_object('active',true,
   'until',floor(extract(epoch from greatest(coalesce(v_until,'-infinity'::timestamptz),coalesce(v_garbage,'-infinity'::timestamptz))))::bigint,
   'source',case when v_until is not null then 'reservation' else 'garbage' end);
 end if;
 return jsonb_build_object('active',false,'until',null,'source','none');
end $$;
