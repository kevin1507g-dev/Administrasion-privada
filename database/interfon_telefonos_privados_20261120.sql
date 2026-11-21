-- Preparación privada de teléfonos para el futuro interfón de la privada.
-- NO activa llamadas, NO crea credenciales de voz ni emite aperturas de portón.
-- Captura REAL deshabilitada por defecto, hasta aviso de privacidad validado,
-- verificación del servicio y medidas adicionales de cifrado/custodia.
create table if not exists access_private.interfon_telefonos (
 id uuid primary key default gen_random_uuid(),
 destino text not null,
 casa_id uuid references public.casas(id),
 slot text not null,
 numero_e164 text not null,
 tipo text not null,
 registrado_por uuid not null references public.profiles(id),
 consentimiento_at timestamptz not null,
 verificado_at timestamptz,
 creado_at timestamptz not null default now(),
 actualizado_at timestamptz not null default now(),
 constraint interfon_destino_ck check (destino in ('casa','sistema_admin')),
 constraint interfon_slot_ck check (
   (destino='casa' and casa_id is not null and slot in ('principal','respaldo'))
   or (destino='sistema_admin' and casa_id is null and slot='sistema_admin')
 ),
 constraint interfon_tipo_ck check (tipo in ('movil','fijo')),
 constraint interfon_numero_ck check (numero_e164 ~ '^\+52[0-9]{10}$')
);
create unique index if not exists interfon_telefono_por_casa
  on access_private.interfon_telefonos(casa_id,slot) where destino='casa';
create unique index if not exists interfon_telefono_sistema_admin
  on access_private.interfon_telefonos(destino,slot) where destino='sistema_admin';
alter table access_private.interfon_telefonos enable row level security;
revoke all on access_private.interfon_telefonos from public,anon,authenticated;

create table if not exists access_private.interfon_captura_config (
 singleton boolean primary key default true check (singleton),
 captura_habilitada boolean not null default false,
 actualizado_at timestamptz not null default now()
);
insert into access_private.interfon_captura_config(singleton,captura_habilitada)
 values(true,false) on conflict(singleton) do nothing;
alter table access_private.interfon_captura_config enable row level security;
revoke all on access_private.interfon_captura_config from public,anon,authenticated;

-- Solo usuarios reales y aprobados pueden consultar su propia casa o el contacto oficial
-- de Sistema Admin. Las cifras completas y números de otras casas no salen de la API.
create or replace function public.interfon_mis_telefonos()
returns jsonb
language plpgsql security definer set search_path=''
as $$
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
 select captura_habilitada into v_habilitada
   from access_private.interfon_captura_config where singleton=true;
 select coalesce(jsonb_agg(jsonb_build_object(
   'slot',t.slot,
   'tipo',t.tipo,
   'ultimos4',right(t.numero_e164,4),
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
$$;
revoke all on function public.interfon_mis_telefonos() from public,anon,authenticated;
grant execute on function public.interfon_mis_telefonos() to authenticated;

-- Registro protegido: no permitirá captar números hasta que se active explícitamente
-- la política de privacidad correspondiente y la verificación profesional de telefonía.
create or replace function public.interfon_guardar_telefono(
 p_slot text, p_numero text, p_tipo text, p_consentimiento boolean
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v public.profiles%rowtype;
 v_destino text;
 v_numero text;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
 select * into v from public.profiles where id=auth.uid()
  and activo is true and estado_registro='aprobado';
 if v.id is null or v.rol not in ('residente','owner') then
   raise exception 'No autorizado para registrar este teléfono.';
 end if;
 if not coalesce((select captura_habilitada from access_private.interfon_captura_config where singleton=true),false) then
  raise exception 'El registro de teléfonos estará disponible después de validar el aviso de privacidad y la conexión del interfón.';
 end if;
 if p_consentimiento is not true then
   raise exception 'Se requiere consentimiento para registrar un número telefónico.';
 end if;
 if p_tipo not in ('movil','fijo') then raise exception 'Selecciona celular o teléfono fijo.'; end if;
 v_numero:=regexp_replace(coalesce(p_numero,''),'[[:space:]()-]','','g');
 if v_numero !~ '^\+52[0-9]{10}$' then
   raise exception 'Escribe un número válido de México: +52 y 10 dígitos.';
 end if;
 if v.rol='residente' then
   v_destino:='casa';
   if p_slot not in ('principal','respaldo') then raise exception 'Tipo de contacto inválido.'; end if;
   if not exists(select 1 from public.casas c where c.id=v.casa_id
     and c.activo is true and c.numero ~ '^(4[0-9]|5[0-9]|6[0-6])$') then
     raise exception 'Tu casa no está activa.';
   end if;
   insert into access_private.interfon_telefonos
     (destino,casa_id,slot,numero_e164,tipo,registrado_por,consentimiento_at)
   values('casa',v.casa_id,p_slot,v_numero,p_tipo,v.id,now())
   on conflict(casa_id,slot) where destino='casa' do update
   set numero_e164=excluded.numero_e164,tipo=excluded.tipo,registrado_por=excluded.registrado_por,
     consentimiento_at=now(),verificado_at=null,actualizado_at=now();
 else
   v_destino:='sistema_admin';
   if p_slot<>'sistema_admin' then raise exception 'Solo puedes editar tu contacto de Sistema Admin.'; end if;
   insert into access_private.interfon_telefonos
     (destino,casa_id,slot,numero_e164,tipo,registrado_por,consentimiento_at)
   values('sistema_admin',null,'sistema_admin',v_numero,p_tipo,v.id,now())
   on conflict(destino,slot) where destino='sistema_admin' do update
   set numero_e164=excluded.numero_e164,tipo=excluded.tipo,registrado_por=excluded.registrado_por,
     consentimiento_at=now(),verificado_at=null,actualizado_at=now();
 end if;
 return jsonb_build_object('ok',true,'slot',p_slot,'ultimos4',right(v_numero,4),
   'verificado',false,'llamadas_habilitadas',false);
end
$$;
revoke all on function public.interfon_guardar_telefono(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.interfon_guardar_telefono(text,text,text,boolean) to authenticated;

-- Eliminación disponible aun con captura deshabilitada, nunca permite leer otros números.
create or replace function public.interfon_eliminar_telefono(p_slot text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v public.profiles%rowtype;
 v_rows integer;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
 select * into v from public.profiles where id=auth.uid()
  and activo is true and estado_registro='aprobado';
 if v.id is null then raise exception 'No autorizado.'; end if;
 if v.rol='residente' and p_slot in ('principal','respaldo') then
   delete from access_private.interfon_telefonos
   where destino='casa' and casa_id=v.casa_id and slot=p_slot;
 elsif v.rol='owner' and p_slot='sistema_admin' then
   delete from access_private.interfon_telefonos
   where destino='sistema_admin' and casa_id is null and slot=p_slot;
 else
   raise exception 'No autorizado para eliminar este contacto.';
 end if;
 get diagnostics v_rows = row_count;
 return jsonb_build_object('ok',true,'eliminados',v_rows);
end
$$;
revoke all on function public.interfon_eliminar_telefono(text) from public,anon,authenticated;
grant execute on function public.interfon_eliminar_telefono(text) to authenticated;

comment on table access_private.interfon_telefonos is
 'Directorio PRIVADO y no expuesto. Captura de números inactiva hasta aviso legal, cifrado aplicable y verificación. La consulta web sólo revela los últimos cuatro dígitos.';
comment on table access_private.interfon_captura_config is
 'Puerta de privacidad: false por defecto. Nunca habilita llamadas ni aperturas por sí sola.';
