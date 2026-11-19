-- Registro de proveedores con autorización humana por cada entrada.
-- Nunca utilizar un código de registro como credencial de apertura física.
create table if not exists public.proveedores_registrados (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas(id),
  nombre text not null check (char_length(nombre) between 2 and 70),
  apellido_paterno text not null check (char_length(apellido_paterno) between 2 and 70),
  apellido_materno text not null check (char_length(apellido_materno) between 2 and 70),
  codigo_hash text not null unique check (codigo_hash ~ '^[a-f0-9]{64}$'),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','revocado')),
  ine_frente_ruta text,
  ine_reverso_ruta text,
  rostro_ruta text,
  rate_key text not null,
  consentimiento_at timestamptz not null,
  creado_at timestamptz not null default now(),
  revisado_at timestamptz,
  revisado_por uuid references public.profiles(id),
  actualizado_at timestamptz not null default now()
);
create index if not exists proveedores_registrados_casa_idx on public.proveedores_registrados(casa_id,creado_at desc);
create index if not exists proveedores_registrados_rate_idx on public.proveedores_registrados(rate_key,creado_at desc);
create index if not exists proveedores_registrados_estado_idx on public.proveedores_registrados(estado,creado_at desc);

create table if not exists public.proveedores_solicitudes_acceso (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores_registrados(id),
  entrega_id uuid not null unique references public.entregas_contacto(id) on delete cascade,
  creado_at timestamptz not null default now()
);
create index if not exists proveedores_solicitudes_proveedor_idx on public.proveedores_solicitudes_acceso(proveedor_id,creado_at desc);

create table if not exists public.proveedores_consultas_rate (
  id bigint generated always as identity primary key,
  rate_key text not null,
  creado_at timestamptz not null default now()
);
create index if not exists proveedores_consultas_rate_idx on public.proveedores_consultas_rate(rate_key,creado_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('proveedores-identidad','proveedores-identidad',false,3145728,
        array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=false,file_size_limit=3145728,
 allowed_mime_types=array['image/jpeg','image/png','image/webp']::text[];

alter table public.proveedores_registrados enable row level security;
alter table public.proveedores_solicitudes_acceso enable row level security;
alter table public.proveedores_consultas_rate enable row level security;
revoke all on public.proveedores_registrados from public,anon,authenticated;
revoke all on public.proveedores_solicitudes_acceso from public,anon,authenticated;
revoke all on public.proveedores_consultas_rate from public,anon,authenticated;
revoke all on sequence public.proveedores_consultas_rate_id_seq from public,anon,authenticated;
comment on table public.proveedores_registrados is
 'INE frente, reverso y foto del rostro en bucket PRIVADO únicamente para revisión de Sistema Admin; borrar las fotografías al resolver la solicitud. El código de registro no abre el portón.';
