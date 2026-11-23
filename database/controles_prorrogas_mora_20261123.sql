-- Días extra por mora: solo Sistema Admin (único perfil rol owner).
-- La deuda se conserva; los controles suspendidos manualmente nunca se reactivan por este procedimiento.
create table if not exists public.prorrogas_mora_controles (
 casa_id uuid primary key references public.casas(id) on delete cascade,
 vigente_hasta timestamptz not null,
 dias_ultimos integer not null check (dias_ultimos between 1 and 365),
 otorgado_por uuid not null references auth.users(id),
 otorgado_en timestamptz not null default now(),
 revocado_por uuid references auth.users(id),
 revocado_en timestamptz,
 motivo text not null default 'Plazo adicional autorizado por Sistema Admin'
);
alter table public.prorrogas_mora_controles enable row level security;
revoke all on public.prorrogas_mora_controles from PUBLIC,anon,authenticated;

create table if not exists public.prorrogas_mora_controles_auditoria (
 id bigint generated always as identity primary key,
 casa_id uuid not null references public.casas(id),
 actor_id uuid not null references auth.users(id),
 accion text not null check(accion in ('otorgar','revocar')),
 dias integer,
 vigente_hasta timestamptz,
 registrado_en timestamptz not null default now()
);
alter table public.prorrogas_mora_controles_auditoria enable row level security;
revoke all on public.prorrogas_mora_controles_auditoria from PUBLIC,anon,authenticated;

-- Estado server-side de controles suspendidos, deuda que cumple el umbral de 10 días,
-- y plazos activos. Solo cuentas aprobadas de Administración ven este listado.
create or replace function public.controles_bloqueos_resumen()
returns table (
 casa_id uuid,
 numero text,
 deuda_mora numeric,
 cuotas_mora bigint,
 controles_suspendidos bigint,
 suspendidos_por_mora bigint,
 suspendidos_manuales bigint,
 prorroga_hasta timestamptz,
 dias_ultimos integer,
 prorroga_activa boolean
)
language plpgsql security definer set search_path='' stable as $$
begin
 if not exists (
   select 1 from public.profiles p
   where p.id=auth.uid() and p.activo=true and p.estado_registro='aprobado'
     and p.rol in ('admin','owner')
 ) then raise exception 'Acceso exclusivo de Administración.' using errcode='42501';end if;
 return query
 select c.id,c.numero,
  d.deuda_mora,d.cuotas_mora,
  ct.suspendidos,ct.por_mora,ct.manuales,
  g.vigente_hasta,g.dias_ultimos,
  coalesce(g.revocado_en is null and g.vigente_hasta>now(),false)
 from public.casas c
 cross join lateral (
  select coalesce(sum(greatest(q.monto-coalesce((
   select sum(pg.monto) from public.pagos pg where pg.cuota_id=q.id
  ),0),0)),0)::numeric as deuda_mora,
  count(*) filter (where greatest(q.monto-coalesce((
   select sum(pg.monto) from public.pagos pg where pg.cuota_id=q.id
  ),0),0)>0.009)::bigint as cuotas_mora
  from public.cuotas q
  where coalesce(q.casa_id,(select pr.casa_id from public.profiles pr where pr.id=q.residente_id))=c.id
   and coalesce(q.archivada,false)=false
   and q.vencimiento<=((now() at time zone 'America/Mexico_City')::date - 10)
 ) d
 cross join lateral (
  select count(*) filter(where cr.estado='suspendido')::bigint suspendidos,
   count(*) filter(where cr.estado='suspendido' and cr.suspension_automatica=true)::bigint por_mora,
   count(*) filter(where cr.estado='suspendido' and coalesce(cr.suspension_automatica,false)=false)::bigint manuales
  from public.controles_residenciales cr where cr.casa_id=c.id
 ) ct
 left join public.prorrogas_mora_controles g on g.casa_id=c.id
 where ct.suspendidos>0 or d.deuda_mora>0.009 or
   (g.revocado_en is null and g.vigente_hasta>now())
 order by c.numero::integer;
end;$$;
revoke all on function public.controles_bloqueos_resumen() from PUBLIC,anon,authenticated;
grant execute on function public.controles_bloqueos_resumen() to authenticated;

-- Días adicionales a partir de ahora o de la fecha de la última prórroga, si sigue vigente.
-- Revocación opcional, auditada. Ninguna acción se realiza sobre relés, mandos físicos ni cuotas.
create or replace function public.controles_otorgar_dias_mora(
 p_casa_id uuid,
 p_dias integer default null,
 p_accion text default 'otorgar'
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_until timestamptz;
 v_count integer;
 v_debt numeric;
begin
 if not exists (
  select 1 from public.profiles p
  where p.id=auth.uid() and p.rol='owner'
   and p.activo=true and p.estado_registro='aprobado'
 ) then raise exception 'Solo Sistema Admin puede administrar días adicionales.' using errcode='42501';end if;
 if p_accion not in ('otorgar','revocar') or p_accion is null
    then raise exception 'Acción inválida.' using errcode='22023';end if;
 if p_casa_id is null or not exists (
  select 1 from public.casas where id=p_casa_id and activo=true
 ) then raise exception 'Selecciona una casa activa.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_casa_id::text,2026));
 if p_accion='otorgar' then
  if p_dias is null or p_dias<1 or p_dias>365 then
   raise exception 'Puedes otorgar entre 1 y 365 días por autorización.' using errcode='22023';end if;
  select count(*) into v_count from public.controles_residenciales
   where casa_id=p_casa_id;
  if v_count=0 then raise exception 'La casa no tiene controles registrados.' using errcode='22023';end if;
  select coalesce(sum(greatest(q.monto-coalesce((
    select sum(pg.monto) from public.pagos pg where pg.cuota_id=q.id
  ),0),0)),0) into v_debt
  from public.cuotas q
  where coalesce(q.casa_id,(select pr.casa_id from public.profiles pr where pr.id=q.residente_id))=p_casa_id
   and coalesce(q.archivada,false)=false
   and q.vencimiento<=((now() at time zone 'America/Mexico_City')::date-10);
  if v_debt<=0.009 then
    raise exception 'La casa no presenta deuda vencida que genere el bloqueo de 10 días.' using errcode='22023';end if;
  insert into public.prorrogas_mora_controles(
   casa_id,vigente_hasta,dias_ultimos,otorgado_por,otorgado_en,
   revocado_por,revocado_en
  ) values(p_casa_id,now()+make_interval(days=>p_dias),p_dias,auth.uid(),now(),null,null)
  on conflict(casa_id) do update set
    vigente_hasta=greatest(now(),case
     when public.prorrogas_mora_controles.revocado_en is null
     then public.prorrogas_mora_controles.vigente_hasta
     else now() end)+make_interval(days=>p_dias),
    dias_ultimos=p_dias,otorgado_por=auth.uid(),otorgado_en=now(),
    revocado_por=null,revocado_en=null
  returning vigente_hasta into v_until;
 else
  update public.prorrogas_mora_controles
   set revocado_en=now(),revocado_por=auth.uid()
   where casa_id=p_casa_id and revocado_en is null and vigente_hasta>now()
   returning vigente_hasta into v_until;
  if not found then raise exception 'No hay días adicionales vigentes que revocar.' using errcode='22023';end if;
 end if;
 insert into public.prorrogas_mora_controles_auditoria(
  casa_id,actor_id,accion,dias,vigente_hasta
 )values(p_casa_id,auth.uid(),p_accion,case when p_accion='otorgar' then p_dias else null end,v_until);
 -- Sincroniza solamente estados marcados como suspensión automática; respeta bloqueos manuales.
 perform public.sincronizar_controles_por_mora();
 return jsonb_build_object('ok',true,'accion',p_accion,'casa_id',p_casa_id,'vigente_hasta',v_until);
end;$$;
revoke all on function public.controles_otorgar_dias_mora(uuid,integer,text) from PUBLIC,anon,authenticated;
grant execute on function public.controles_otorgar_dias_mora(uuid,integer,text) to authenticated;

-- Elegibilidad y sincronizador original del proyecto con prórrogas respetadas.
CREATE OR REPLACE FUNCTION access_private.eligibility(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.profiles%rowtype;
  today date := (now() at time zone 'America/Mexico_City')::date;
begin
  select * into p from public.profiles where id=p_user;
  if p.id is null or p.activo is not true or coalesce(p.estado_registro,'aprobado')<>'aprobado' then
    return jsonb_build_object('allowed',false,'reason','Tu cuenta no está activa y aprobada.','admin',false);
  end if;
  if p.rol IN ('admin','owner') then
    return jsonb_build_object('allowed',true,'admin',true);
  end if;
  if p.rol<>'residente' or p.casa_id is null or
     not exists (select 1 from public.casas where id=p.casa_id and activo) then
    return jsonb_build_object('allowed',false,'reason','Necesitas una casa activa asignada.','admin',false);
  end if;

  -- Un control marcado como suspendido bloquea ambos botones digitales
  -- para todos los residentes asignados a la misma casa.
  if exists (
    select 1
    from public.controles_residenciales cr
    where cr.estado='suspendido'
      and (
        cr.casa_id=p.casa_id
        or (
          cr.casa_id is null and cr.residente_id is not null
          and exists (
            select 1 from public.profiles p2
            where p2.id=cr.residente_id and p2.casa_id=p.casa_id
          )
        )
        or (
          cr.casa_id is null and cr.residente_id is null
          and exists (
            select 1 from public.casas ca
            where ca.id=p.casa_id and ca.numero=cr.unidad
          )
        )
      )
  ) then
    return jsonb_build_object(
      'allowed',false,
      'reason','Control digital suspendido temporalmente por la administración para esta casa. Se deshabilitaron portón y acceso peatonal.',
      'temporary_locked',true,
      'admin',false
    );
  end if;

  -- La prórroga de Sistema Admin pausa solamente la suspensión por deuda;
  -- nunca anula controles suspendidos manualmente ni bloqueos especiales.
  if not exists (
    select 1 from public.prorrogas_mora_controles g
    where g.casa_id=p.casa_id and g.revocado_en is null and g.vigente_hasta>now()
  ) and exists (
    select 1 from public.cuotas q
    where coalesce(q.casa_id,(select pr.casa_id from public.profiles pr where pr.id=q.residente_id))=p.casa_id
      and coalesce(q.archivada,false)=false -- Las cuotas archivadas no generan suspensión
      and q.vencimiento<=today-10
      and q.monto-coalesce(
        (select sum(pg.monto) from public.pagos pg where pg.cuota_id=q.id),0
      )>0.009
  ) then
    return jsonb_build_object(
      'allowed',false,
      'reason','Acceso digital suspendido: tu casa tiene saldo pendiente con 10 días o más de atraso.',
      'admin',false
    );
  end if;
  return jsonb_build_object('allowed',true,'admin',false);
end
$function$;
CREATE OR REPLACE FUNCTION public.sincronizar_controles_por_mora()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.controles_residenciales c
  set estado='suspendido', suspension_automatica=true,
      motivo_suspension='Cuota vencida con saldo pendiente',
      actualizado_en=now(), actualizado_por=null
  where c.casa_id is not null and c.bloqueo_owner is not true
    and not exists (
      select 1 from public.prorrogas_mora_controles g
      where g.casa_id=c.casa_id and g.revocado_en is null and g.vigente_hasta>now()
    )
    and exists (
      select 1 from public.cuotas q
      where q.casa_id=c.casa_id and q.archivada is not true
        and q.vencimiento is not null
        and q.vencimiento <= ((now() at time zone 'America/Mexico_City')::date - 10)
        and greatest(coalesce(q.monto,0)-coalesce((
          select sum(pg.monto) from public.pagos pg where pg.cuota_id=q.id
        ),0),0)>0.009
    ) and c.estado='activo';
  update public.controles_residenciales c
  set estado='activo', suspension_automatica=false,
      motivo_suspension=null, actualizado_en=now(), actualizado_por=null
  where c.casa_id is not null and c.bloqueo_owner is not true and c.suspension_automatica=true
    and (exists (
      select 1 from public.prorrogas_mora_controles g
      where g.casa_id=c.casa_id and g.revocado_en is null and g.vigente_hasta>now()
    ) or not exists (
      select 1 from public.cuotas q
      where q.casa_id=c.casa_id and q.archivada is not true
        and q.vencimiento is not null
        and q.vencimiento <= ((now() at time zone 'America/Mexico_City')::date - 10)
        and greatest(coalesce(q.monto,0)-coalesce((
          select sum(pg.monto) from public.pagos pg where pg.cuota_id=q.id
        ),0),0)>0.009
    ));
end;
$function$;
