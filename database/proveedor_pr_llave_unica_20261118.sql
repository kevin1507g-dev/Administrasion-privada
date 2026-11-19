-- El codigo PR-... sera la unica llave de solicitud de acceso del proveedor.
-- Se admite UNA solicitud vinculada por proveedor; no se emiten otros codigos.
-- La apertura real todavia exige autorizacion del residente via sistema existente.
alter table public.proveedores_registrados
  add column if not exists codigo_reservado_at timestamptz,
  add column if not exists codigo_usado_at timestamptz;

-- Un registro no puede crear dos solicitudes, ni siquiera con peticiones paralelas.
create unique index if not exists proveedores_solicitud_unica_proveedor_idx
  on public.proveedores_solicitudes_acceso(proveedor_id);

create or replace function public.proveedores_vincular_solicitud_unica(
  p_proveedor uuid, p_entrega uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  p public.proveedores_registrados%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'No autorizado.';
  end if;
  select * into p from public.proveedores_registrados
    where id=p_proveedor for update;
  if p.id is null or p.estado<>'aprobado'
     or p.codigo_reservado_at is not null
     or p.codigo_usado_at is not null
     or (p.modalidad='basico' and (p.caduca_at is null or p.caduca_at<=now()))
  then
    return false;
  end if;
  if exists (select 1 from public.proveedores_solicitudes_acceso where proveedor_id=p_proveedor)
  then
    return false;
  end if;
  insert into public.proveedores_solicitudes_acceso(proveedor_id,entrega_id)
    values(p_proveedor,p_entrega);
  update public.proveedores_registrados
    set codigo_reservado_at=now(), actualizado_at=now()
    where id=p_proveedor;
  return true;
end
$$;
revoke all on function public.proveedores_vincular_solicitud_unica(uuid,uuid) from public,anon,authenticated;
grant execute on function public.proveedores_vincular_solicitud_unica(uuid,uuid) to service_role;

-- La confirmacion del ESP32 registra el uso; si la orden nunca se confirma,
-- la llave sigue reservada para evitar un segundo intento no supervisado.
create or replace function access_private.proveedores_registrar_apertura_confirmada()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.state='pulse_confirmed'
     and old.state is distinct from new.state
     and new.delivery_id is not null then
    update public.proveedores_registrados p
       set codigo_usado_at=coalesce(p.codigo_usado_at,now()),
           actualizado_at=now()
      from public.proveedores_solicitudes_acceso s
     where s.entrega_id=new.delivery_id
       and s.proveedor_id=p.id;
  end if;
  return new;
end
$$;
drop trigger if exists trg_proveedor_pr_uso_confirmado on access_private.commands;
create trigger trg_proveedor_pr_uso_confirmado
after update of state on access_private.commands
for each row execute function access_private.proveedores_registrar_apertura_confirmada();
revoke all on function access_private.proveedores_registrar_apertura_confirmada()
  from public,anon,authenticated;

comment on column public.proveedores_registrados.codigo_reservado_at is
 'La llave PR ya ha solicitado su unico acceso. No emitir segunda solicitud, incluso si hubo expiracion o error.';
comment on column public.proveedores_registrados.codigo_usado_at is
 'Pulso de apertura confirmado por el ESP32. La llave PR es definitivamente de un solo uso.';
