-- PostgreSQL COALESCE es una expresión y no admite prefijo de esquema.
create or replace function public.interfon_verify_preparar(
 p_usuario uuid, p_accion text
)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 v access_private.interfon_telefonos%rowtype;
 v_key text;
 v_numero text;
 v_ultima timestamptz;
 v_total int;
begin
 if coalesce(pg_catalog.current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Solo servicio interno.';
 end if;
 if p_usuario is null or p_accion not in ('enviar','comprobar') then
    raise exception 'Solicitud no válida.';
 end if;
 if not exists (select 1 from public.profiles p where p.id=p_usuario
   and p.rol='owner' and p.activo=true and p.estado_registro='aprobado') then
    raise exception 'Usuario no autorizado.';
 end if;
 if not coalesce((select captura_sistema_admin from access_private.interfon_captura_config where singleton=true),false)
    then raise exception 'La configuración de verificación está deshabilitada.'; end if;
 select * into v from access_private.interfon_telefonos
 where destino='sistema_admin' and slot='sistema_admin' and registrado_por=p_usuario
 limit 1;
 if v.id is null then raise exception 'Registra primero tu propio teléfono.'; end if;
 if v.tipo<>'movil' then
    raise exception 'Para este método por SMS se requiere un celular; la verificación de teléfonos fijos será posterior.';
 end if;
 if v.verificado_at is not null then
    raise exception 'Este número ya está verificado.';
 end if;
 -- Serializar intentos del mismo usuario incluso ante solicitudes paralelas.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('interfon_verify:'||p_usuario::text));
 delete from access_private.interfon_verify_intentos where fecha < now()-interval '30 days';
 select count(*),max(fecha) into v_total,v_ultima
 from access_private.interfon_verify_intentos
 where usuario_id=p_usuario and accion=p_accion and fecha>now()-interval '24 hours';
 if (p_accion='enviar' and v_total>=5) or (p_accion='comprobar' and v_total>=12) then
    raise exception 'Límite de intentos alcanzado; inténtalo mañana.';
 end if;
 if p_accion='enviar' and v_ultima is not null and v_ultima>now()-interval '60 seconds' then
    raise exception 'Espera un minuto antes de pedir otro código.';
 end if;
 select decrypted_secret into v_key from vault.decrypted_secrets where name='interfon_tel_cipher_v1';
 if nullif(v_key,'') is null then raise exception 'Servicio de cifrado no disponible.'; end if;
 v_numero:=extensions.pgp_sym_decrypt(v.numero_cifrado,v_key);
 if v_numero !~ '^\+52[0-9]{10}$' then raise exception 'Formato telefónico inválido.'; end if;
 insert into access_private.interfon_verify_intentos(usuario_id,telefono_id,accion)
 values(p_usuario,v.id,p_accion);
 return pg_catalog.jsonb_build_object(
  'telefono_id',v.id,'numero',v_numero,
  'huella',pg_catalog.encode(extensions.digest(v.numero_cifrado,'sha256'),'hex')
 );
end $fn$;
