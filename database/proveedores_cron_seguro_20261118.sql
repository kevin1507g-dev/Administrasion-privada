-- Autorización exclusiva para el trabajo de limpieza programada de proveedores.
-- El secreto real reside en Supabase Vault, nunca en GitHub ni en el navegador.
create table if not exists access_private.proveedores_cron_auth (
 singleton boolean primary key default true check (singleton),
 token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$')
);
revoke all on access_private.proveedores_cron_auth from public, anon, authenticated;

create or replace function public.proveedores_cron_validar(p_token text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from access_private.proveedores_cron_auth a
    where a.singleton = true
      and a.token_hash = encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
  );
$$;
revoke all on function public.proveedores_cron_validar(text) from public, anon, authenticated;
grant execute on function public.proveedores_cron_validar(text) to service_role;
comment on function public.proveedores_cron_validar(text) is
 'Validación del secreto de Supabase Vault para la limpieza programada; solo service_role.';
