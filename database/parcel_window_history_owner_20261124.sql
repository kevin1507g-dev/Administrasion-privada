-- Historial de Paquetería, lectura exclusiva para Sistema Admin.
-- Usa los movimientos ya registrados por parcel_window_manage; no opera el portón.
create or replace function public.parcel_window_history(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  result jsonb;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null
    or actor.rol <> 'owner'
    or actor.activo is not true
    or coalesce(actor.estado_registro,'aprobado') <> 'aprobado'
  then
    raise exception 'Solo Sistema Admin puede consultar el historial de Paquetería.'
      using errcode='42501';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'performed_at', a.event_at,
        'actor', coalesce(nullif(p.nombre,''),'Cuenta no disponible'),
        'role', coalesce(p.rol,''),
        'house', coalesce(c.numero,p.unidad,'—'),
        'ends_at', a.ends_at
      )
      order by a.event_at desc,a.id desc
    ),
    '[]'::jsonb
  ) into result
  from (
    select id,actor_id,action,event_at,ends_at
    from public.parcel_window_audit
    order by event_at desc,id desc
    limit greatest(1,least(coalesce(p_limit,50),100))
  ) a
  left join public.profiles p on p.id=a.actor_id
  left join public.casas c on c.id=p.casa_id;

  return result;
end;
$$;
revoke all on function public.parcel_window_history(integer) from public,anon;
grant execute on function public.parcel_window_history(integer) to authenticated;
