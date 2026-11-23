-- Impedir la creación de viviendas nuevas por el disparador público de altas.
-- Mantiene el flujo actual: usuarios nuevos siempre quedan residentes inactivos
-- y pendientes de aprobación, sin elevar permisos ni modificar residentes existentes.
create or replace function public.crear_perfil_residente_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidad text;
  v_casa_id uuid;
  v_nombre text;
begin
  v_unidad := btrim(coalesce(new.raw_user_meta_data ->> 'unidad', ''));
  if v_unidad !~ '^[0-9]{1,6}$' then
    raise exception 'El número de casa no es válido.' using errcode='22023';
  end if;

  -- Mantener compatibilidad con casas escritas como 0045.
  v_unidad := regexp_replace(v_unidad, '^0+', '');
  if v_unidad !~ '^(4[0-9]|5[0-9]|6[0-6])$' then
    raise exception 'Solo se aceptan casas de la 40 a la 66.' using errcode='22023';
  end if;

  -- No crear casas desde un alta pública de usuario.
  select c.id into v_casa_id
  from public.casas c
  where c.numero=v_unidad and c.activo is true
  limit 1;
  if v_casa_id is null then
    raise exception 'La casa solicitada no existe o está desactivada.' using errcode='22023';
  end if;

  v_nombre := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'),''),'Residente');
  if char_length(v_nombre) > 100 then
    raise exception 'El nombre excede el máximo permitido.' using errcode='22023';
  end if;

  insert into public.profiles (id,nombre,unidad,casa_id,rol,activo,email,estado_registro)
  values (new.id,v_nombre,v_unidad,v_casa_id,'residente',false,new.email,'pendiente')
  on conflict (id) do nothing;

  return new;
end;
$$;
-- El disparador de auth.users sigue habilitado y ejecuta este código.
revoke execute on function public.crear_perfil_residente_al_registrarse()
 from public, anon, authenticated;
