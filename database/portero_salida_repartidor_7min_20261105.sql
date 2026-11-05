-- Salida declarada por repartidor durante los siete minutos posteriores a una
-- autorización registrada. No hay órdenes al motor ni retención de relevadores.
ALTER TABLE public.entregas_contacto
 ADD COLUMN IF NOT EXISTS salida_reportada_at timestamptz;
ALTER TABLE public.visitor_pass_access_log
 ADD COLUMN IF NOT EXISTS salida_reportada_at timestamptz;
COMMENT ON COLUMN public.entregas_contacto.salida_reportada_at
 IS 'El visitante declaró haber salido; no verifica posición, presencia ni portón físico.';
COMMENT ON COLUMN public.visitor_pass_access_log.salida_reportada_at
 IS 'Declaración del visitante tras usar un código válido; no prueba salida física.';

-- Reutiliza toda la autorización protegida y únicamente devuelve el identificador
-- de la orden ya creada, para vincular de forma segura el registro de salida.
CREATE OR REPLACE FUNCTION public.visitor_pass_request(p_name text, p_house text, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.visitor_passes%rowtype; d access_private.device%rowtype; e jsonb; c uuid;
begin
 -- El nombre debe declararse antes de cualquier autorización física.
 if regexp_replace(coalesce(p_name,''),'[[:space:]]','','g') = '' then
  raise exception 'El nombre del visitante es obligatorio.' using errcode='22023';
 end if;
 -- Solo viviendas 40-66 antes de verificar códigos o enviar comandos.
 if btrim(coalesce(p_house,'')) !~ '^(4[0-9]|5[0-9]|6[0-6])$' then
  return jsonb_build_object('accepted',false,
   'message','Solo se aceptan solicitudes para las casas de la 40 a la 66.');
 end if;
 if length(btrim(coalesce(p_name,''))) > 100 or length(btrim(coalesce(p_house,''))) not between 1 and 20
 or upper(btrim(coalesce(p_code,''))) !~ '^([A-HJ-NP-Z][0-9]{6}|[A-F0-9]{16})$' then
  raise exception 'Datos de visita no válidos o código fuera de horario.';
 end if;
 perform pg_advisory_xact_lock(hashtext('visitor-pass:'||lower(btrim(p_house))));
 if (select count(*) from access_private.visitor_code_attempts where house_input=lower(btrim(p_house)) and attempted_at>now()-interval '10 minutes')>=8 then
  return jsonb_build_object('accepted',false,'message','Demasiados intentos. Espera 10 minutos antes de volver a intentar.');
 end if;
 select v0.* into v from public.visitor_passes v0 join public.casas h on h.id=v0.house_id
 where v0.code_hash=extensions.digest(upper(btrim(p_code)),'sha256')
  and lower(btrim(h.numero))=lower(btrim(p_house))
 for update of v0;
 if v.id is null then
  insert into access_private.visitor_code_attempts(house_input) values(lower(btrim(p_house)));
  return jsonb_build_object('accepted',false,'message','Código o casa incorrectos.');
 end if;
 if v.revoked_at is not null or now()<v.starts_at or now()>=v.ends_at
 or (v.is_permanent and v.approval_status<>'approved')
 or (not v.is_permanent and v.used_count>=20) then
  raise exception 'Datos de visita no válidos o código fuera de horario.';
 end if;
 if v.last_used_at>now()-interval '45 seconds' then raise exception 'Espera antes de volver a solicitar apertura.'; end if;
 e:=access_private.eligibility(v.sponsor_id);
 if not coalesce((e->>'allowed')::boolean,false) then raise exception 'Acceso no disponible. Contacta al residente.'; end if;
 select * into d from access_private.device where singleton for update;
 if d.singleton is null or d.enabled is not true or d.residents_enabled is not true or d.last_seen<=now()-interval '15 seconds' then
  raise exception 'Portón no disponible. Contacta al residente.';
 end if;
 if d.last_requested>now()-interval '5 seconds' then raise exception 'Espera unos segundos antes de otra solicitud.'; end if;
 update access_private.commands set state='expired' where state='pending' and expires_at<=now();
 if exists(select 1 from access_private.commands where state='pending') then raise exception 'El equipo está procesando otra orden.'; end if;
 insert into access_private.commands(actor_id,target,expires_at) values(v.sponsor_id,'porton',now()+interval '12 seconds') returning id into c;
 insert into public.visitor_pass_access_log(pass_id,command_id,visitor_name,house_id) values(v.id,c,btrim(p_name),v.house_id);
 update public.visitor_passes set used_count=used_count+1,last_used_at=now() where id=v.id;
 update access_private.device set last_requested=now() where singleton;
 return jsonb_build_object('accepted',true,'command_id',c,'access_at',now(),'message','Solicitud enviada al portón. Comprueba físicamente que la entrada esté libre y haya abierto.');
end $function$
;
