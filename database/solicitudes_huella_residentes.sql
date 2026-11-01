-- Prerregistro por cuenta residente y por casa. Sin imágenes ni plantillas biométricas.
-- Solo el lector R503Pro podrá completar capturas cuando se implemente su integración.
create table if not exists public.solicitudes_huella (
 id uuid primary key default gen_random_uuid(),
 residente_id uuid not null references public.profiles(id) on delete cascade,
 casa_id uuid not null references public.casas(id) on delete cascade,
 dedo text not null check (dedo in ('indice_izquierdo','pulgar_derecho')),
 estado text not null default 'pendiente_captura'
   check (estado in ('pendiente_captura','registrada','cancelada','error')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists solicitudes_huella_una_por_dedo_activa
 on public.solicitudes_huella(residente_id,dedo)
 where estado in ('pendiente_captura','registrada');
alter table public.solicitudes_huella enable row level security;
revoke all on public.solicitudes_huella from public,anon,authenticated;
grant select,insert,delete on public.solicitudes_huella to authenticated;

create policy "huella_select_owner_admin_o_titular"
on public.solicitudes_huella for select to authenticated
using (
 public.current_user_role() in ('admin','owner')
 or (
  residente_id=(select auth.uid())
  and exists (
   select 1 from public.profiles p join public.casas c on c.id=p.casa_id
   where p.id=(select auth.uid()) and p.rol='residente'
     and p.activo is true and p.estado_registro='aprobado' and c.activo is true
     and p.casa_id=solicitudes_huella.casa_id
  )
 )
);

create policy "huella_insert_solo_residente_su_casa"
on public.solicitudes_huella for insert to authenticated
with check (
 residente_id=(select auth.uid())
 and estado='pendiente_captura'
 and exists (
  select 1 from public.profiles p join public.casas c on c.id=p.casa_id
  where p.id=(select auth.uid()) and p.rol='residente'
    and p.activo is true and p.estado_registro='aprobado' and c.activo is true
    and p.casa_id=solicitudes_huella.casa_id
 )
);

-- Solo se eliminan solicitudes pendientes: borrar una huella ya capturada
-- del historial NO la borraría del sensor físico.
create policy "huella_delete_pendiente_titular_o_admin"
on public.solicitudes_huella for delete to authenticated
using (
 estado='pendiente_captura'
 and (
  public.current_user_role() in ('admin','owner')
  or (
   residente_id=(select auth.uid())
   and exists (
    select 1 from public.profiles p join public.casas c on c.id=p.casa_id
    where p.id=(select auth.uid()) and p.rol='residente'
      and p.activo is true and p.estado_registro='aprobado' and c.activo is true
      and p.casa_id=solicitudes_huella.casa_id
   )
  )
 )
);