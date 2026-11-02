-- Reservaciones guiadas por IA: operaciones para el residente autenticado.
-- El permiso se valida en Postgres, no en el texto ni en el modelo de IA.
-- No activa relés ni aprueba automáticamente ninguna reservación.
ALTER TABLE public.reservaciones
 ADD COLUMN IF NOT EXISTS ia_solicitud_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS reservaciones_ia_solicitud_id_unique
 ON public.reservaciones(ia_solicitud_id)
 WHERE ia_solicitud_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ia_reservaciones_ocupadas(p_fecha date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_uid uuid:=auth.uid(); v_result jsonb;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.id=v_uid AND p.rol='residente'
    AND p.activo=true AND p.estado_registro='aprobado' AND p.casa_id IS NOT NULL
 ) THEN RAISE EXCEPTION 'Solo los residentes aprobados pueden consultar horarios.' USING ERRCODE='42501'; END IF;
 IF p_fecha IS NULL OR p_fecha<((now() AT TIME ZONE 'America/Mexico_City')::date)
   OR p_fecha>((now() AT TIME ZONE 'America/Mexico_City')::date+365)
 THEN RAISE EXCEPTION 'Selecciona una fecha válida dentro de los próximos 365 días.' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'inicio',to_char(r.hora_inicio,'HH24:MI'),'fin',to_char(r.hora_fin,'HH24:MI')
 ) ORDER BY r.hora_inicio),'[]'::jsonb) INTO v_result
 FROM public.reservaciones r WHERE r.fecha=p_fecha AND r.area='Portón'
   AND r.estado IN ('pendiente','aprobada');
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ia_residente_reservar(
 p_fecha date,p_inicio time without time zone,p_fin time without time zone,
 p_notas text,p_solicitud_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_uid uuid:=auth.uid(); v_casa uuid; v_numero text;
  v_id uuid; v_old public.reservaciones%rowtype;
BEGIN
 SELECT p.casa_id,c.numero INTO v_casa,v_numero
 FROM public.profiles p JOIN public.casas c ON c.id=p.casa_id
 WHERE p.id=v_uid AND p.rol='residente' AND p.activo=true
  AND p.estado_registro='aprobado' AND c.activo=true;
 IF v_uid IS NULL OR v_casa IS NULL THEN
  RAISE EXCEPTION 'Solo un residente aprobado con casa activa puede reservar.' USING ERRCODE='42501';END IF;
 IF p_fecha IS NULL OR p_inicio IS NULL OR p_fin IS NULL OR p_solicitud_id IS NULL
  OR p_fin<=p_inicio OR p_fecha<((now() AT TIME ZONE 'America/Mexico_City')::date)
  OR p_fecha>((now() AT TIME ZONE 'America/Mexico_City')::date+365)
  OR ((p_fecha+p_inicio) AT TIME ZONE 'America/Mexico_City')<=now()
 THEN RAISE EXCEPTION 'Selecciona una fecha futura y un horario válido del mismo día (máximo 365 días).' USING ERRCODE='22023';END IF;
 IF char_length(coalesce(p_notas,''))>300 THEN
  RAISE EXCEPTION 'Las notas deben tener máximo 300 caracteres.' USING ERRCODE='22023';END IF;
 -- Idempotencia ante doble clic o reconexión. Reintento devuelve el mismo id.
 SELECT * INTO v_old FROM public.reservaciones WHERE ia_solicitud_id=p_solicitud_id FOR UPDATE;
 IF FOUND THEN
  IF v_old.creado_por<>v_uid OR v_old.casa_id<>v_casa OR v_old.fecha<>p_fecha
     OR v_old.hora_inicio<>p_inicio OR v_old.hora_fin<>p_fin
     OR coalesce(v_old.notas,'')<>btrim(coalesce(p_notas,''))
  THEN RAISE EXCEPTION 'El identificador ya corresponde a otra solicitud.' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('ok',true,'id',v_old.id,'estado',v_old.estado,'duplicada',true);
 END IF;
 -- Serializa reservas simultáneas para la misma fecha/área.
 PERFORM pg_advisory_xact_lock(hashtextextended('ia_porton|'||p_fecha::text,0));
 IF EXISTS(
  SELECT 1 FROM public.reservaciones r WHERE r.fecha=p_fecha
    AND r.area='Portón' AND r.estado IN ('pendiente','aprobada')
    AND r.hora_inicio<p_fin AND p_inicio<r.hora_fin
 ) THEN RAISE EXCEPTION 'Ese horario se cruza con una reservación existente. Elige otro.' USING ERRCODE='23505';END IF;
 INSERT INTO public.reservaciones(
  casa_id,residente_id,unidad,area,fecha,hora_inicio,hora_fin,notas,
  estado,creado_por,ia_solicitud_id)
 VALUES(v_casa,v_uid,v_numero,'Portón',p_fecha,p_inicio,p_fin,
  nullif(btrim(coalesce(p_notas,'')),''),'pendiente',v_uid,p_solicitud_id)
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'id',v_id,'estado','pendiente','duplicada',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ia_residente_cancelar_reservacion(p_reservacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_uid uuid:=auth.uid(); v_casa uuid; v_r public.reservaciones%rowtype;
BEGIN
 SELECT p.casa_id INTO v_casa FROM public.profiles p JOIN public.casas c ON c.id=p.casa_id
 WHERE p.id=v_uid AND p.rol='residente' AND p.activo=true
  AND p.estado_registro='aprobado' AND c.activo=true;
 IF v_uid IS NULL OR v_casa IS NULL THEN
  RAISE EXCEPTION 'Solo el residente autorizado puede cancelar su reservación.' USING ERRCODE='42501';END IF;
 SELECT * INTO v_r FROM public.reservaciones WHERE id=p_reservacion_id FOR UPDATE;
 IF NOT FOUND OR v_r.casa_id<>v_casa OR v_r.creado_por<>v_uid
   OR (v_r.residente_id IS NOT NULL AND v_r.residente_id<>v_uid)
 THEN RAISE EXCEPTION 'No se encontró una reservación propia.' USING ERRCODE='42501';END IF;
 IF v_r.estado NOT IN ('pendiente','aprobada') THEN
  RAISE EXCEPTION 'La reservación ya fue cancelada, rechazada o finalizada.' USING ERRCODE='22023';END IF;
 IF v_r.estado='aprobada' AND now()>=((v_r.fecha+v_r.hora_inicio) AT TIME ZONE 'America/Mexico_City') THEN
  RAISE EXCEPTION 'El evento aprobado ya comenzó. Contacta a Administración para cancelarlo de forma segura.' USING ERRCODE='22023';END IF;
 UPDATE public.reservaciones
  SET estado='cancelada',cancelado_por=v_uid,cancelado_en=now()
  WHERE id=v_r.id;
 RETURN jsonb_build_object('ok',true,'id',v_r.id,'estado','cancelada');
END;
$$;

REVOKE ALL ON FUNCTION public.ia_reservaciones_ocupadas(date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ia_residente_reservar(date,time without time zone,time without time zone,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ia_residente_cancelar_reservacion(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ia_reservaciones_ocupadas(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_residente_reservar(date,time without time zone,time without time zone,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ia_residente_cancelar_reservacion(uuid) TO authenticated;
