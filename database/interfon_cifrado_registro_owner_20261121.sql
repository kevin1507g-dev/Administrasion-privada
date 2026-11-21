-- Habilitar exclusivamente el alta voluntaria del PROPIO teléfono de Sistema Admin.
-- Residentes continúan sin captura hasta contar con aviso integral y verificación.
-- No se activan llamadas, webhooks ni órdenes de apertura de portón.
-- Los números se cifran en servidor usando una clave aleatoria guardada en Vault.
do $$
begin
 if exists(select 1 from access_private.interfon_telefonos) then
   raise exception 'No se puede migrar el cifrado: existen teléfonos previos que requieren migración segura.';
 end if;
end $$;

do $$
begin
 if not exists(select 1 from vault.secrets where name='interfon_tel_cipher_v1') then
   perform vault.create_secret(
     encode(extensions.gen_random_bytes(32),'hex'),
     'interfon_tel_cipher_v1',
     'Clave privada para cifrar el directorio telefonico del interfon (no se publica)'
   );
 end if;
end $$;

alter table access_private.interfon_telefonos
 drop constraint if exists interfon_numero_ck;
alter table access_private.interfon_telefonos
 add column if not exists numero_cifrado bytea,
 add column if not exists numero_ultimos4 text;
alter table access_private.interfon_telefonos
 drop column if exists numero_e164;
alter table access_private.interfon_telefonos
 alter column numero_cifrado set not null,
 alter column numero_ultimos4 set not null;
alter table access_private.interfon_telefonos
 add constraint interfon_ultimos4_ck check (numero_ultimos4 ~ '^[0-9]{4}$');

alter table access_private.interfon_captura_config
 add column if not exists captura_sistema_admin boolean not null default true;
update access_private.interfon_captura_config
set captura_sistema_admin=true,actualizado_at=now()
where singleton=true;
-- Nunca habilitar captura de teléfonos de residentes con el aviso incompleto.
update access_private.interfon_captura_config
set captura_habilitada=false
where singleton=true;

create or replace function public.interfon_mis_telefonos()
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
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
$fn$;

create or replace function public.interfon_guardar_telefono(
 p_slot text, p_numero text, p_tipo text, p_consentimiento boolean
)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v public.profiles%rowtype;
 v_numero text;
 v_key text;
 v_cifrado bytea;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
 select * into v from public.profiles where id=auth.uid()
  and activo is true and estado_registro='aprobado';
 if v.id is null or v.rol not in ('residente','owner') then
   raise exception 'No autorizado para registrar este teléfono.';
 end if;
 if v.rol='residente' then
   if not coalesce((select captura_habilitada
     from access_private.interfon_captura_config where singleton=true),false) then
     raise exception 'El registro de residentes seguirá deshabilitado hasta completar el aviso integral y la verificación telefónica.';
   end if;
   -- Esta fase no habilita inscripciones de residentes, aun si alguien cambia
   -- la configuración sin una nueva revisión funcional.
   raise exception 'El alta de residentes todavía no está disponible.';
 elsif v.rol='owner' then
   if p_slot<>'sistema_admin' then
      raise exception 'Solo puedes registrar tu número de Sistema Admin.';
   end if;
   if not coalesce((select captura_sistema_admin
     from access_private.interfon_captura_config where singleton=true),false) then
      raise exception 'El registro de Sistema Admin está temporalmente deshabilitado.';
   end if;
 end if;

 if p_consentimiento is not true then
   raise exception 'Debes confirmar que el número es tuyo o tienes autorización para usarlo.';
 end if;
 if p_tipo not in ('movil','fijo') then
   raise exception 'Selecciona celular o teléfono fijo.';
 end if;
 v_numero:=regexp_replace(coalesce(p_numero,''),'[[:space:]()-]','','g');
 if v_numero !~ '^\+52[0-9]{10}$' then
   raise exception 'Escribe un número válido de México: +52 y 10 dígitos.';
 end if;

 select decrypted_secret into v_key from vault.decrypted_secrets
 where name='interfon_tel_cipher_v1';
 if nullif(v_key,'') is null then
    raise exception 'Cifrado no disponible: no se guardó el número.';
 end if;
 v_cifrado:=extensions.pgp_sym_encrypt(v_numero,v_key,'cipher-algo=aes256,compress-algo=0');
 insert into access_private.interfon_telefonos
   (destino,casa_id,slot,numero_cifrado,numero_ultimos4,tipo,registrado_por,consentimiento_at)
 values('sistema_admin',null,'sistema_admin',v_cifrado,
   right(v_numero,4),p_tipo,v.id,now())
 on conflict(destino,slot) where destino='sistema_admin' do update
 set numero_cifrado=excluded.numero_cifrado,
     numero_ultimos4=excluded.numero_ultimos4,
     tipo=excluded.tipo,
     registrado_por=excluded.registrado_por,
     consentimiento_at=now(),
     verificado_at=null,
     actualizado_at=now();

 return jsonb_build_object('ok',true,'slot','sistema_admin',
   'ultimos4',right(v_numero,4),'verificado',false,'llamadas_habilitadas',false);
end
$fn$;

revoke all on function public.interfon_mis_telefonos() from public,anon,authenticated;
grant execute on function public.interfon_mis_telefonos() to authenticated;
revoke all on function public.interfon_guardar_telefono(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.interfon_guardar_telefono(text,text,text,boolean) to authenticated;

comment on table access_private.interfon_telefonos is
'Numeros cifrados en servidor con clave en Vault. Solo se exponen ultimos cuatro digitos. Solo Sistema Admin puede registrar su propio numero en esta fase, no se utiliza para llamadas sin verificacion.';
comment on table access_private.interfon_captura_config is
'captura_sistema_admin controla autogestion del contacto owner; captura_habilitada de residentes sigue FALSE. No se realizan llamadas ni aperturas.';
