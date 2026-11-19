-- Empresa o actividad declarada por el proveedor.
-- Este dato es autodeclarado y no acredita identidad ni relación laboral.
alter table public.proveedores_registrados
  add column if not exists empresa text;
alter table public.proveedores_registrados
  add constraint proveedores_registrados_empresa_formato
  check (empresa is null or (char_length(btrim(empresa)) between 2 and 80));
comment on column public.proveedores_registrados.empresa is
  'Empresa que declara representar el proveedor. No se valida la relación laboral, y nunca es por sí sola autorización de entrada.';
