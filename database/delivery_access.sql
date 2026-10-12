-- Delivery authorization and ESP32 command are committed together.
alter table access_private.commands add column delivery_id uuid references public.entregas_contacto(id) on delete set null;
create unique index digital_command_delivery_once on access_private.commands(delivery_id) where delivery_id is not null;

create function access_private.request_delivery(p_delivery uuid,p_target text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; d public.entregas_contacto%rowtype;
 c access_private.commands%rowtype; result uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_target is null or p_target not in ('peatonal','porton') then raise exception 'Acceso no válido.'; end if;
 select * into p from public.profiles where id=auth.uid();
 if p.rol is distinct from 'residente' or p.activo is not true or coalesce(p.estado_registro,'aprobado')<>'aprobado' then
   raise exception 'Se requiere un residente activo y aprobado.';
 end if;
 select * into d from public.entregas_contacto where id=p_delivery for update;
 if d.id is null or p.casa_id is null or d.casa_id is distinct from p.casa_id then raise exception 'Solicitud no disponible para tu casa.'; end if;
 select * into c from access_private.commands where delivery_id=d.id;
 if c.id is not null then
   if c.actor_id=auth.uid() and c.target=p_target then return c.id; end if;
   raise exception 'Esta solicitud ya tiene una orden de acceso.';
 end if;
 if d.estado<>'esperando' or d.expires_at<=now() then raise exception 'La solicitud ya fue respondida o expiró.'; end if;
 -- Reuse device availability, resident enablement, arrears and rate checks.
 result:=access_private.request(p_target);
 update access_private.commands set delivery_id=d.id,expires_at=least(expires_at,d.expires_at) where id=result;
 update public.entregas_contacto set estado='respondido',
 respuesta=case when p_target='peatonal' then 'acceso_peatonal' else 'acceso_porton' end,
 respondido_por=auth.uid(),respondido_at=now() where id=d.id;
 return result;
end $$;
revoke all on function access_private.request_delivery(uuid,text) from public,anon,authenticated;
grant execute on function access_private.request_delivery(uuid,text) to authenticated;
create function public.digital_access_delivery_request(p_delivery uuid,p_target text)
returns uuid language sql security invoker set search_path='' as $$select access_private.request_delivery(p_delivery,p_target)$$;
revoke all on function public.digital_access_delivery_request(uuid,text) from public,anon,authenticated;
grant execute on function public.digital_access_delivery_request(uuid,text) to authenticated;
notify pgrst,'reload schema';
