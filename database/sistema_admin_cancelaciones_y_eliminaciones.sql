-- Sistema Admin: cancelación de eventos publicados, reservaciones aprobadas
-- y eliminación transaccional de expedientes de Avisos y multas.
-- Nunca borra registros existentes durante esta migración.

ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'programado',
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelado_en timestamptz;

ALTER TABLE public.eventos
  ADD CONSTRAINT eventos_estado_programado_cancelado
  CHECK (estado IN ('programado','cancelado'));

ALTER TABLE public.reservaciones
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelado_en timestamptz;

-- La cancelación conserva el evento en el calendario para consulta.
CREATE OR REPLACE FUNCTION public.sistema_admin_cancelar_evento(p_evento_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE v_evento public.eventos%rowtype;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR public.current_user_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Solo Sistema Admin puede cancelar eventos programados.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_evento FROM public.eventos WHERE id=p_evento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El evento ya no existe.'; END IF;
  IF v_evento.estado<>'programado' THEN RAISE EXCEPTION 'El evento ya fue cancelado.'; END IF;
  IF v_evento.fecha < (now() AT TIME ZONE 'America/Mexico_City')::date THEN
    RAISE EXCEPTION 'Solo se pueden cancelar eventos del día o futuros.';
  END IF;
  UPDATE public.eventos
    SET estado='cancelado',cancelado_por=auth.uid(),cancelado_en=now()
    WHERE id=p_evento_id AND estado='programado';
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo cancelar el evento.'; END IF;
  RETURN pg_catalog.jsonb_build_object('ok',true,'id',p_evento_id,'estado','cancelado');
END;
$$;

-- El ESP32 consulta solo reservaciones 'aprobada'. Una cancelación
-- retira la activación en su próxima sincronización; no manda pulsos.
CREATE OR REPLACE FUNCTION public.sistema_admin_cancelar_reservacion(p_reservacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE v_reserva public.reservaciones%rowtype;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR public.current_user_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Solo Sistema Admin puede cancelar reservaciones aprobadas.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_reserva FROM public.reservaciones WHERE id=p_reservacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La reservación ya no existe.'; END IF;
  IF v_reserva.estado<>'aprobada' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar reservaciones aprobadas.';
  END IF;
  IF now() >= ((v_reserva.fecha+v_reserva.hora_fin) AT TIME ZONE 'America/Mexico_City') THEN
    RAISE EXCEPTION 'La reservación ya terminó.';
  END IF;
  UPDATE public.reservaciones
    SET estado='cancelada',cancelado_por=auth.uid(),cancelado_en=now()
    WHERE id=p_reservacion_id AND estado='aprobada';
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo cancelar la reservación.'; END IF;
  RETURN pg_catalog.jsonb_build_object('ok',true,'id',p_reservacion_id,'estado','cancelada');
END;
$$;

-- Auditoría privada persistente de las eliminaciones de expedientes.
CREATE TABLE IF NOT EXISTS access_private.disciplina_eliminaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  caso_id uuid NOT NULL,
  casa_id uuid NOT NULL,
  motivo text NOT NULL,
  actor_id uuid NOT NULL,
  avisos_eliminados integer NOT NULL,
  multas_eliminadas integer NOT NULL,
  aclaraciones_eliminadas integer NOT NULL,
  eliminado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE access_private.disciplina_eliminaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON access_private.disciplina_eliminaciones FROM PUBLIC, anon, authenticated;

-- SECURITY DEFINER es necesario porque ninguna tabla disciplinaria
-- permite borrado directo mediante RLS; autorización fuerte en el servidor.
-- Borra primero los registros hijos (sin cascada implícita).
CREATE OR REPLACE FUNCTION public.sistema_admin_eliminar_reporte_disciplina(p_caso_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_caso public.disciplina_casos%rowtype;
        v_avisos integer:=0;v_multas integer:=0;v_aclaraciones integer:=0;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Solo Sistema Admin puede eliminar reportes de Avisos y multas.' USING ERRCODE='42501';
  END IF;
  IF p_caso_id IS NULL THEN RAISE EXCEPTION 'Selecciona un reporte válido.'; END IF;
  SELECT * INTO v_caso FROM public.disciplina_casos WHERE id=p_caso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este reporte ya no existe.'; END IF;

  DELETE FROM public.disciplina_aclaraciones WHERE caso_id=p_caso_id;
  GET DIAGNOSTICS v_aclaraciones = ROW_COUNT;
  DELETE FROM public.disciplina_multas WHERE caso_id=p_caso_id;
  GET DIAGNOSTICS v_multas = ROW_COUNT;
  DELETE FROM public.disciplina_avisos WHERE caso_id=p_caso_id;
  GET DIAGNOSTICS v_avisos = ROW_COUNT;
  DELETE FROM public.disciplina_casos WHERE id=p_caso_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No fue posible eliminar el reporte.'; END IF;

  INSERT INTO access_private.disciplina_eliminaciones
    (caso_id,casa_id,motivo,actor_id,avisos_eliminados,multas_eliminadas,aclaraciones_eliminadas)
  VALUES
    (v_caso.id,v_caso.casa_id,left(v_caso.motivo,500),auth.uid(),v_avisos,v_multas,v_aclaraciones);
  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'caso_id',p_caso_id,
    'avisos_eliminados',v_avisos,'multas_eliminadas',v_multas,
    'aclaraciones_eliminadas',v_aclaraciones);
END;
$$;

REVOKE ALL ON FUNCTION public.sistema_admin_cancelar_evento(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sistema_admin_cancelar_reservacion(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sistema_admin_eliminar_reporte_disciplina(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sistema_admin_cancelar_evento(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_admin_cancelar_reservacion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_admin_eliminar_reporte_disciplina(uuid) TO authenticated;