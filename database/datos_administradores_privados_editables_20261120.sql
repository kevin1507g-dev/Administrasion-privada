-- Datos privados y editables de Sistema Admin y de las cuentas Administrador.
-- Los datos personales no forman parte del aviso de privacidad PUBLICO.
-- Solo Sistema Admin activo/aprobado puede consultarlos o cambiarlos.
-- Guardar no cambia el rol ni los datos de autenticacion de la cuenta.
create table if not exists access_private.datos_administradores (
 perfil_id uuid primary key references public.profiles(id) on delete cascade,
 nombre_completo text not null default '',
 domicilio text not null default '',
 colonia text not null default '',
 municipio text not null default '',
 estado text not null default '',
 codigo_postal text not null default '',
 correo_contacto text not null default '',
 telefono_contacto text not null default '',
 actualizado_at timestamptz not null default now(),
 actualizado_por uuid references public.profiles(id),
 constraint datos_admin_l_nombre check (length(nombre_completo)<=160),
 constraint datos_admin_l_domicilio check (length(domicilio)<=220),
 constraint datos_admin_l_colonia check (length(colonia)<=140),
 constraint datos_admin_l_municipio check (length(municipio)<=140),
 constraint datos_admin_l_estado check (length(estado)<=100),
 constraint datos_admin_l_cp check (codigo_postal='' or codigo_postal ~ '^[0-9]{5}$'),
 constraint datos_admin_l_correo check (length(correo_contacto)<=180),
 constraint datos_admin_l_telefono check (length(telefono_contacto)<=24)
);
alter table access_private.datos_administradores enable row level security;
revoke all on access_private.datos_administradores from public,anon,authenticated;

create or replace function public.administracion_datos_listar()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_usuario uuid:=auth.uid();
  v_registros jsonb;
begin
  if v_usuario is null or not exists(
    select 1 from public.profiles p
    where p.id=v_usuario and p.rol='owner' and p.activo is true
      and p.estado_registro='aprobado'
  ) then
    raise exception 'Solo Sistema Admin puede consultar estos datos.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'perfil_id',p.id,
    'rol',p.rol,
    'nombre_cuenta',coalesce(p.nombre,''),
    'tiene_ficha',d.perfil_id is not null,
    'nombre_completo',coalesce(d.nombre_completo,''),
    'domicilio',coalesce(d.domicilio,''),
    'colonia',coalesce(d.colonia,''),
    'municipio',coalesce(d.municipio,''),
    'estado',coalesce(d.estado,''),
    'codigo_postal',coalesce(d.codigo_postal,''),
    'correo_contacto',coalesce(d.correo_contacto,''),
    'telefono_contacto',coalesce(d.telefono_contacto,''),
    'actualizado_at',d.actualizado_at
  ) order by case when p.rol='owner' then 0 else 1 end,p.nombre),'[]'::jsonb)
   into v_registros
  from public.profiles p
  left join access_private.datos_administradores d on d.perfil_id=p.id
  where p.rol in ('owner','admin') and p.activo is true
    and p.estado_registro='aprobado';

  return jsonb_build_object('ok',true,'personas',v_registros);
end;
$$;
revoke all on function public.administracion_datos_listar() from public,anon,authenticated;
grant execute on function public.administracion_datos_listar() to authenticated;

create or replace function public.administracion_datos_guardar(
 p_perfil_id uuid,
 p_nombre_completo text,
 p_domicilio text,
 p_colonia text,
 p_municipio text,
 p_estado text,
 p_codigo_postal text,
 p_correo_contacto text,
 p_telefono_contacto text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_usuario uuid:=auth.uid();
  v_nombre text:=btrim(coalesce(p_nombre_completo,''));
  v_domicilio text:=btrim(coalesce(p_domicilio,''));
  v_colonia text:=btrim(coalesce(p_colonia,''));
  v_municipio text:=btrim(coalesce(p_municipio,''));
  v_estado text:=btrim(coalesce(p_estado,''));
  v_cp text:=btrim(coalesce(p_codigo_postal,''));
  v_correo text:=lower(btrim(coalesce(p_correo_contacto,'')));
  v_telefono text:=btrim(coalesce(p_telefono_contacto,''));
  v_actualizado timestamptz;
begin
  if v_usuario is null or not exists(
    select 1 from public.profiles p
    where p.id=v_usuario and p.rol='owner' and p.activo is true
      and p.estado_registro='aprobado'
  ) then
    raise exception 'Solo Sistema Admin puede cambiar estos datos.';
  end if;
  if p_perfil_id is null or not exists(
    select 1 from public.profiles p
    where p.id=p_perfil_id and p.rol in ('owner','admin')
      and p.activo is true and p.estado_registro='aprobado'
  ) then
    raise exception 'Selecciona una cuenta de administrador activa.';
  end if;
  if v_nombre='' or length(v_nombre)>160 then
    raise exception 'El nombre completo es obligatorio (máximo 160 caracteres).';
  end if;
  if length(v_domicilio)>220 or length(v_colonia)>140 or
     length(v_municipio)>140 or length(v_estado)>100 then
    raise exception 'El domicilio supera la longitud permitida.';
  end if;
  if v_cp<>'' and v_cp !~ '^[0-9]{5}$' then
    raise exception 'El código postal debe tener 5 dígitos.';
  end if;
  if length(v_correo)>180 or (v_correo<>'' and v_correo !~
       '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'Escribe un correo de contacto válido o déjalo vacío.';
  end if;
  if length(v_telefono)>24 or (v_telefono<>'' and
      v_telefono !~ '^[+0-9 ()-]{7,24}$') then
    raise exception 'Escribe un teléfono de contacto válido o déjalo vacío.';
  end if;

  insert into access_private.datos_administradores (
    perfil_id,nombre_completo,domicilio,colonia,municipio,estado,
    codigo_postal,correo_contacto,telefono_contacto,
    actualizado_at,actualizado_por
  ) values (
    p_perfil_id,v_nombre,v_domicilio,v_colonia,v_municipio,v_estado,
    v_cp,v_correo,v_telefono,now(),v_usuario
  )
  on conflict(perfil_id) do update set
    nombre_completo=excluded.nombre_completo,
    domicilio=excluded.domicilio,
    colonia=excluded.colonia,
    municipio=excluded.municipio,
    estado=excluded.estado,
    codigo_postal=excluded.codigo_postal,
    correo_contacto=excluded.correo_contacto,
    telefono_contacto=excluded.telefono_contacto,
    actualizado_at=now(),
    actualizado_por=v_usuario
  returning actualizado_at into v_actualizado;

  return jsonb_build_object('ok',true,'perfil_id',p_perfil_id,
    'actualizado_at',v_actualizado,'publicado',false);
end;
$$;
revoke all on function public.administracion_datos_guardar(
 uuid,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.administracion_datos_guardar(
 uuid,text,text,text,text,text,text,text,text
) to authenticated;

comment on table access_private.datos_administradores is
 'Fichas privadas de Sistema Admin y administradores. Acceso solo por RPC con validacion owner. Edicion ilimitada, sin publicacion automatica del domicilio.';
