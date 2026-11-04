-- Corrige validación digital: excluye cuotas archivadas del bloqueo por mora.
-- Preserva suspensiones administrativas y restricciones sobre cuotas vigentes.
-- Reproduce la función instalada en Supabase, con el único predicado nuevo.
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
      'admin',false
    );
  end if;

  -- Conserva el bloqueo automático por cuotas vencidas sin cambios.
  if exists (
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
$function$
;
