-- Alta y edición de teléfonos de residentes, administrados únicamente por Sistema Admin.
-- No envía SMS, no marca números como verificados y no habilita llamadas ni apertura.
-- Requiere la declaración del administrador de que obtuvo autorización del titular.
-- Se guardan solo números cifrados con la clave existente en Supabase Vault.
alter table access_private.interfon_telefonos
 add column if not exists origen_registro text not null default 'titular';
alter table access_private.interfon_telefonos
 add constraint interfon_origen_registro_ck
 check (origen_registro in ('titular','sistema_admin'));

CREATE OR REPLACE FUNCTION public.interfon_mis_telefonos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v public.profiles%rowtype;
 v_destino text;
 v_casa text;
 v_habilitada boolean;
 v_telefonos jsonb;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
 select * into v from public.profiles where id=auth.uid()
   and activo is true and estado_registro='aprobado';
 if v.id is null or v.rol not in ('residente','owner') then
   raise exception 'No autorizado para administrar teléfonos del interfón.';
 end if;
 if v.rol='residente' then
   if v.casa_id is null then raise exception 'No hay una casa asignada.'; end if;
   v_destino:='casa';
   select c.numero into v_casa from public.casas c
    where c.id=v.casa_id and c.activo is true and c.numero ~ '^(4[0-9]|5[0-9]|6[0-6])$';
   if v_casa is null then raise exception 'Casa no habilitada.'; end if;
 else
   v_destino:='sistema_admin';
 end if;
 select case when v_destino='sistema_admin'
             then captura_sistema_admin
             else captura_habilitada end
 into v_habilitada
 from access_private.interfon_captura_config where singleton=true;

 select coalesce(jsonb_agg(jsonb_build_object(
   'slot',t.slot,
   'tipo',t.tipo,
   'origen_registro',t.origen_registro,
   'ultimos4',t.numero_ultimos4,
   'verificado',t.verificado_at is not null,
   'actualizado_at',t.actualizado_at
 ) order by case t.slot when 'principal' then 1 when 'respaldo' then 2 else 3 end),'[]'::jsonb)
 into v_telefonos
 from access_private.interfon_telefonos t
 where t.destino=v_destino and (
    (v_destino='casa' and t.casa_id=v.casa_id)
    or (v_destino='sistema_admin' and t.casa_id is null)
 );
 return jsonb_build_object(
  'ok',true,'destino',v_destino,'casa',v_casa,
  'captura_habilitada',coalesce(v_habilitada,false),
  'llamadas_habilitadas',false,
  'telefonos',v_telefonos
 );
end
$function$;


-- Listado de casas con teléfonos enmascarados; el número completo no sale de la base.
create or replace function public.interfon_owner_listar_casas()
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_owner public.profiles%rowtype;
 v_casas jsonb;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into v_owner from public.profiles
 where id=auth.uid() and rol='owner'
 and activo is true and estado_registro='aprobado';
 if v_owner.id is null then raise exception 'Solo Sistema Admin puede administrar estos teléfonos.'; end if;

 select coalesce(jsonb_agg(
   jsonb_build_object(
      'casa',c.numero,
      'contactos',coalesce((
        select jsonb_agg(jsonb_build_object(
           'slot',t.slot,
           'tipo',t.tipo,
           'ultimos4',t.numero_ultimos4,
           'verificado',t.verificado_at is not null,
           'origen_registro',t.origen_registro,
           'actualizado_at',t.actualizado_at
        ) order by case t.slot when 'principal' then 1 else 2 end)
        from access_private.interfon_telefonos t
        where t.destino='casa' and t.casa_id=c.id
      ),'[]'::jsonb)
   ) order by c.numero::integer
 ),'[]'::jsonb) into v_casas
 from public.casas c
 where c.activo is true
   and c.numero ~ '^(4[0-9]|5[0-9]|6[0-6])$';

 return jsonb_build_object('ok',true,'casas',v_casas,'llamadas_habilitadas',false);
end $fn$;

create or replace function public.interfon_owner_guardar_casa(
 p_casa text, p_slot text, p_numero text, p_tipo text, p_autorizacion boolean
)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_owner public.profiles%rowtype;
 v_casa_id uuid;
 v_numero text;
 v_key text;
 v_cifrado bytea;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into v_owner from public.profiles
 where id=auth.uid() and rol='owner'
 and activo is true and estado_registro='aprobado';
 if v_owner.id is null then raise exception 'Solo Sistema Admin puede registrar teléfonos de residentes.'; end if;

 if p_autorizacion is not true then
   raise exception 'Confirma que el residente autorizó el registro de su número.';
 end if;
 if p_slot not in ('principal','respaldo') then
   raise exception 'Selecciona teléfono principal o respaldo.';
 end if;
 if p_tipo not in ('movil','fijo') then
   raise exception 'Selecciona celular o teléfono fijo.';
 end if;
 if p_casa is null or p_casa !~ '^(4[0-9]|5[0-9]|6[0-6])$' then
   raise exception 'Selecciona una casa de la 40 a la 66.';
 end if;
 select c.id into v_casa_id from public.casas c
 where c.numero=p_casa and c.activo is true
 limit 1;
 if v_casa_id is null then raise exception 'La casa seleccionada no está registrada o activa.'; end if;

 v_numero:=regexp_replace(coalesce(p_numero,''),'[[:space:]()-]','','g');
 if v_numero !~ '^\+52[0-9]{10}$' then
    raise exception 'Número de México inválido: +52 y diez dígitos.';
 end if;

 select decrypted_secret into v_key from vault.decrypted_secrets
 where name='interfon_tel_cipher_v1';
 if nullif(v_key,'') is null then raise exception 'No está disponible el cifrado privado.'; end if;
 v_cifrado:=extensions.pgp_sym_encrypt(v_numero,v_key,
  'cipher-algo=aes256,compress-algo=0');

 insert into access_private.interfon_telefonos
  (destino,casa_id,slot,numero_cifrado,numero_ultimos4,tipo,
   registrado_por,consentimiento_at,verificado_at,origen_registro)
 values('casa',v_casa_id,p_slot,v_cifrado,right(v_numero,4),p_tipo,
   v_owner.id,now(),null,'sistema_admin')
 on conflict(casa_id,slot) where destino='casa' do update
 set numero_cifrado=excluded.numero_cifrado,
     numero_ultimos4=excluded.numero_ultimos4,
     tipo=excluded.tipo,
     registrado_por=excluded.registrado_por,
     consentimiento_at=now(),
     verificado_at=null,
     origen_registro='sistema_admin',
     actualizado_at=now();

 return jsonb_build_object(
  'ok',true,'casa',p_casa,'slot',p_slot,'ultimos4',right(v_numero,4),
  'verificado',false,'origen_registro','sistema_admin','llamadas_habilitadas',false);
end $fn$;

create or replace function public.interfon_owner_eliminar_casa(p_casa text,p_slot text)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_owner public.profiles%rowtype;
 v_casa_id uuid;
 v_count int;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into v_owner from public.profiles
 where id=auth.uid() and rol='owner'
 and activo is true and estado_registro='aprobado';
 if v_owner.id is null then raise exception 'Solo Sistema Admin puede eliminar contactos de otras casas.'; end if;
 if p_casa is null or p_casa !~ '^(4[0-9]|5[0-9]|6[0-6])$'
   or p_slot not in ('principal','respaldo') then
   raise exception 'Casa o tipo de contacto no válido.';
 end if;
 select c.id into v_casa_id from public.casas c
 where c.numero=p_casa and c.activo is true
 limit 1;
 if v_casa_id is null then raise exception 'Casa no disponible.'; end if;
 delete from access_private.interfon_telefonos
 where destino='casa' and casa_id=v_casa_id and slot=p_slot;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'eliminados',v_count);
end $fn$;

-- Ningún usuario obtiene acceso directo a la tabla cifrada.
revoke all on access_private.interfon_telefonos from public,anon,authenticated;
revoke all on function public.interfon_owner_listar_casas() from public,anon,authenticated;
revoke all on function public.interfon_owner_guardar_casa(text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.interfon_owner_eliminar_casa(text,text) from public,anon,authenticated;
grant execute on function public.interfon_owner_listar_casas() to authenticated;
grant execute on function public.interfon_owner_guardar_casa(text,text,text,text,boolean) to authenticated;
grant execute on function public.interfon_owner_eliminar_casa(text,text) to authenticated;
