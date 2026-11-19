-- Un código de acceso de proveedor autoriza COMO MÁXIMO una entrada.
-- No crea ni activa un mecanismo para accionar el portón.
-- El código de registro PR identifica el perfil y NO abre puertas.
alter table public.proveedores_permisos_anticipados
  drop constraint if exists proveedores_perm_usos_ck;

alter table public.proveedores_permisos_anticipados
  add constraint proveedores_perm_usos_ck
  check (max_aperturas = 1 and aperturas_utilizadas in (0,1));

alter table public.proveedores_permisos_anticipados
  add column if not exists codigo_acceso_hash text,
  add column if not exists codigo_consumido_at timestamptz;

create unique index if not exists proveedores_perm_codigo_unico_idx
  on public.proveedores_permisos_anticipados(codigo_acceso_hash)
  where codigo_acceso_hash is not null;

alter table public.proveedores_permisos_anticipados
  add constraint proveedores_perm_codigo_formato_ck
  check (codigo_acceso_hash is null or codigo_acceso_hash ~ '^[a-f0-9]{64}$');

alter table public.proveedores_permisos_anticipados
  add constraint proveedores_perm_codigo_consumo_ck
  check (
    (aperturas_utilizadas=0 and codigo_consumido_at is null)
    or (aperturas_utilizadas=1 and codigo_consumido_at is not null)
  );

-- Se impide restaurar un permiso ya utilizado, incluso si un operador
-- actualiza los campos directamente. Un nuevo ingreso requiere nuevo permiso.
create or replace function access_private.proveedores_bloquear_reuso()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.max_aperturas <> 1 then
    raise exception 'Cada código de proveedor permite un solo acceso.';
  end if;
  if new.aperturas_utilizadas < old.aperturas_utilizadas
      or (old.codigo_consumido_at is not null
          and new.codigo_consumido_at is distinct from old.codigo_consumido_at)
      or (old.codigo_acceso_hash is not null
          and new.codigo_acceso_hash is distinct from old.codigo_acceso_hash)
  then
    raise exception 'Un código utilizado o emitido no puede reutilizarse.';
  end if;
  return new;
end
$$;

drop trigger if exists trg_proveedores_bloquear_reuso
  on public.proveedores_permisos_anticipados;

create trigger trg_proveedores_bloquear_reuso
before update on public.proveedores_permisos_anticipados
for each row execute function access_private.proveedores_bloquear_reuso();

revoke all on function access_private.proveedores_bloquear_reuso()
  from public, anon, authenticated;

comment on column public.proveedores_permisos_anticipados.codigo_acceso_hash is
  'Solo SHA256 del código temporal individual, nunca código en claro. Sin permisos ni mecanismos de apertura activos.';
comment on column public.proveedores_permisos_anticipados.codigo_consumido_at is
  'Se marca definitivamente consumido tras una apertura confirmada y vinculada al permiso; no se permite restaurar.';
