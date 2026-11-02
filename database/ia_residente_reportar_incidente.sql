-- Reutilizar el módulo privado de incidentes desde la IA residencial.
-- El reporte se crea a nombre del usuario autenticado y su casa activa.
-- Los disparadores existentes notifican a Admin y Sistema Admin.
ALTER TABLE public.incidentes
 ADD COLUMN IF NOT EXISTS ia_solicitud_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS incidentes_ia_solicitud_unique
 ON public.incidentes(ia_solicitud_id) WHERE ia_solicitud_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ia_residente_crear_incidente(
 p_categoria text,p_prioridad text,p_persona text,
 p_titulo text,p_descripcion text,p_solicitud_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 v_uid uuid:=auth.uid();
 v_casa uuid;
 v_id uuid;
 v_anterior public.incidentes%rowtype;
 v_titulo text:=btrim(coalesce(p_titulo,''));
 v_descripcion text:=btrim(coalesce(p_descripcion,''));
 v_persona text:=nullif(btrim(coalesce(p_persona,'')),'');
BEGIN
 SELECT p.casa_id INTO v_casa
 FROM public.profiles p JOIN public.casas c ON c.id=p.casa_id
 WHERE p.id=v_uid AND p.rol='residente' AND p.activo IS TRUE
   AND p.estado_registro='aprobado' AND c.activo IS TRUE;
 IF v_uid IS NULL OR v_casa IS NULL THEN
  RAISE EXCEPTION 'Solo residentes aprobados con una casa activa pueden reportar incidentes.' USING ERRCODE='42501';
 END IF;
 IF p_solicitud_id IS NULL OR p_categoria NOT IN
  ('Convivencia','Ruido','Estacionamiento','Mascotas','Seguridad','Daños','Reglamento','Otro')
  OR p_prioridad NOT IN ('normal','alta','urgente')
  OR char_length(v_titulo) NOT BETWEEN 6 AND 160
  OR char_length(v_descripcion) NOT BETWEEN 15 AND 3000
  OR char_length(coalesce(v_persona,''))>120
 THEN
  RAISE EXCEPTION 'Revisa categoría, prioridad, asunto (6-160 caracteres) y descripción (15-3000 caracteres).' USING ERRCODE='22023';
 END IF;

 -- Un reintento por caída de red nunca crea un segundo reporte.
 SELECT * INTO v_anterior FROM public.incidentes
 WHERE ia_solicitud_id=p_solicitud_id FOR UPDATE;
 IF FOUND THEN
  IF v_anterior.reportado_por<>v_uid OR v_anterior.casa_id<>v_casa
    OR v_anterior.categoria<>p_categoria OR v_anterior.prioridad<>p_prioridad
    OR v_anterior.titulo<>v_titulo OR v_anterior.descripcion<>v_descripcion
    OR coalesce(v_anterior.persona_involucrada,'')<>coalesce(v_persona,'')
  THEN
   RAISE EXCEPTION 'Este identificador ya corresponde a otro reporte.' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('ok',true,'id',v_anterior.id,'estado',v_anterior.estado,'duplicado',true);
 END IF;

 -- Evitar envíos automáticos repetitivos o abuso sin bloquear seguimientos.
 IF (SELECT count(*) FROM public.incidentes i
     WHERE i.reportado_por=v_uid AND i.created_at>now()-interval '1 hour')>=8 THEN
  RAISE EXCEPTION 'Se alcanzó el límite de 8 reportes por hora. Puedes añadir información en el seguimiento de tus reportes.' USING ERRCODE='22023';
 END IF;

 INSERT INTO public.incidentes(
  casa_id,reportado_por,categoria,prioridad,persona_involucrada,titulo,
  descripcion,estado,ia_solicitud_id)
 VALUES(v_casa,v_uid,p_categoria,p_prioridad,v_persona,v_titulo,
  v_descripcion,'nuevo',p_solicitud_id)
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'id',v_id,'estado','nuevo','duplicado',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ia_residente_crear_incidente(text,text,text,text,text,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ia_residente_crear_incidente(text,text,text,text,text,uuid)
 TO authenticated;
