-- Portal de repartidores: toda NUEVA solicitud debe tener casa.
-- Conservar 3 entregas históricas sin casa y la FK ON DELETE SET NULL.
-- No cambiar pagos, accesos ni estados de entregas existentes.
CREATE OR REPLACE FUNCTION public.entregas_contacto_validar_casa_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.casa_id IS NULL THEN
    RAISE EXCEPTION 'Número de casa obligatorio para una nueva solicitud de repartidor.'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.casas c
    WHERE c.id=NEW.casa_id AND c.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'La casa indicada no existe o no está activa.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entregas_contacto_exigir_casa_insert ON public.entregas_contacto;
CREATE TRIGGER entregas_contacto_exigir_casa_insert
BEFORE INSERT ON public.entregas_contacto
FOR EACH ROW EXECUTE FUNCTION public.entregas_contacto_validar_casa_insert();

-- Esta regla afecta solo INSERT; no borra registros anteriores ni bloquea
-- respuestas a solicitudes antiguas que ya existen.
