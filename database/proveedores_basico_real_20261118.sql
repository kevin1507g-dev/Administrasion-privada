-- Registro de proveedores de datos mínimos. No captura documentos ni fotos.
-- La activación pública se controla en Edge Function por aviso validado.
alter table public.proveedores_registrados
  add column if not exists modalidad text not null default 'documental',
  add column if not exists caduca_at timestamptz;
alter table public.proveedores_registrados
  add constraint proveedores_registrados_modalidad_check
  check (modalidad in ('documental','basico'));
create index if not exists proveedores_basicos_caducidad_idx
  on public.proveedores_registrados(modalidad,caduca_at)
  where modalidad='basico';
comment on column public.proveedores_registrados.modalidad is
  'Modalidad basico = sin INE, sin fotos, aprobación manual y acceso sujeto a residente';
comment on column public.proveedores_registrados.caduca_at is
  'Fecha máxima de validez del registro básico (30 días).';
