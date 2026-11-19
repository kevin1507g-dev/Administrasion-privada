-- Preparación para permisos anticipados de proveedores (NO emite aperturas).
-- Requiere aprobación explícita por el residente titular de la casa,
-- identificación verificada y comprobación física del portón antes de activarse.
create table if not exists public.proveedores_permisos_anticipados (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores_registrados(id) on delete cascade,
  casa_id uuid not null references public.casas(id),
  autorizado_por uuid references public.profiles(id),
  desde timestamptz not null,
  hasta timestamptz not null,
  hora_inicio time not null,
  hora_fin time not null,
  max_aperturas integer not null default 1,
  aperturas_utilizadas integer not null default 0,
  estado text not null default 'pendiente',
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  revocado_at timestamptz,
  constraint proveedores_perm_estado_ck check (estado in ('pendiente','activo','revocado','vencido')),
  constraint proveedores_perm_horas_ck check (hora_inicio < hora_fin),
  constraint proveedores_perm_vigencia_ck check (hasta>desde and hasta<=desde+interval '30 days'),
  constraint proveedores_perm_usos_ck check (max_aperturas between 1 and 30 and aperturas_utilizadas between 0 and max_aperturas),
  constraint proveedores_perm_autoriza_ck check (estado<>'activo' or autorizado_por is not null)
);
create index if not exists proveedores_permisos_proveedor_idx
  on public.proveedores_permisos_anticipados(proveedor_id,estado,hasta);
create index if not exists proveedores_permisos_casa_idx
  on public.proveedores_permisos_anticipados(casa_id,estado,hasta);
alter table public.proveedores_permisos_anticipados enable row level security;
revoke all on public.proveedores_permisos_anticipados from public,anon,authenticated;
comment on table public.proveedores_permisos_anticipados is
 'Esquema inactivo de permisos anticipados. NO abre puertas. Antes de activarlo hacen falta autorización del residente, comprobación presencial de seguridad del operador y aviso legal completo.';
