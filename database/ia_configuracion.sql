-- Ajustes públicos no sensibles del asistente. Owner puede cambiar nombre e icono.
create table if not exists public.ia_configuracion(
 id boolean primary key default true check(id),
 nombre text not null default 'Asistente Residencial IA' check(length(nombre) between 5 and 45),
 icono text not null default '✦' check(icono in ('✦','🤖','🏠','🛡️')),
 updated_at timestamptz not null default now()
);
insert into public.ia_configuracion(id,nombre,icono)
 values(true,'Asistente Residencial IA','✦') on conflict(id) do nothing;
alter table public.ia_configuracion enable row level security;
revoke all on public.ia_configuracion from public,anon,authenticated;
grant select,update on public.ia_configuracion to authenticated;
create policy ia_config_leer on public.ia_configuracion for select to authenticated
 using(public.current_user_role() in ('owner','admin','residente'));
create policy ia_config_owner_update on public.ia_configuracion for update to authenticated
 using(public.current_user_role()='owner') with check(public.current_user_role()='owner');
