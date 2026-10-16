-- Recolección de basura: ventana compartida de 20 minutos.
-- Solo estado de plataforma. NO controla ESP32 ni Modo Evento físico.
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
declare p public.profiles%rowtype; w public.garbage_window%rowtype; permitted boolean;
begin
 select * into p from public.profiles where id=auth.uid();
 permitted:=p.id is not null and p.activo is true
  and coalesce(p.estado_registro,'aprobado')='aprobado'
  and p.rol in ('admin','residente')
  and (p.rol='admin' or (p.casa_id is not null and exists(select 1 from public.casas c where c.id=p.casa_id and c.activo)));
 select * into w from public.garbage_window where id=true;
 return jsonb_build_object('allowed',permitted,
 'active',coalesce(w.ends_at>now() and w.stopped_at is null,false),
 'until',case when w.ends_at>now() and w.stopped_at is null then w.ends_at else null end,
 'reason',case when not permitted then 'Cuenta sin autorización.' else 'Sin ventana activa.' end);
end $$;

create or replace function public.garbage_window_manage(p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb; w public.garbage_window%rowtype;
begin
 st:=public.garbage_window_status();
 if coalesce((st->>'allowed')::boolean,false) is not true then raise exception 'Usuario no autorizado.'; end if;
 if p_action not in ('start','stop') or p_action is null then raise exception 'Acción inválida.'; end if;
 select * into w from public.garbage_window where id=true for update;
 if p_action='start' then
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
