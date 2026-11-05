-- Portero Inteligente: datos obligatorios en toda solicitud NUEVA.
-- Sin alterar entregas históricas, sus respuestas, ni las reglas de acceso al ESP32.
-- Las visitas particulares pueden utilizar 'Particular' como empresa/plataforma.
CREATE OR REPLACE FUNCTION public.entregas_contacto_validar_casa_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF regexp_replace(coalesce(NEW.repartidor,''),'[[:space:]]','','g') = '' THEN
  RAISE EXCEPTION 'El nombre del repartidor o visitante es obligatorio.' USING ERRCODE='23514';
 END IF;
 IF length(btrim(NEW.repartidor))>80 THEN
  RAISE EXCEPTION 'El nombre no puede superar 80 caracteres.' USING ERRCODE='23514';
 END IF;
 IF regexp_replace(coalesce(NEW.empresa,''),'[[:space:]]','','g') = '' THEN
  RAISE EXCEPTION 'La empresa o plataforma es obligatoria.' USING ERRCODE='23514';
 END IF;
 IF length(btrim(NEW.empresa))>80 THEN
  RAISE EXCEPTION 'La empresa o plataforma no puede superar 80 caracteres.' USING ERRCODE='23514';
 END IF;
 IF regexp_replace(coalesce(NEW.mensaje,''),'[[:space:]]','','g') = '' THEN
  RAISE EXCEPTION 'El motivo de la entrega o visita es obligatorio.' USING ERRCODE='23514';
 END IF;
 IF length(btrim(NEW.mensaje))>240 THEN
  RAISE EXCEPTION 'El motivo de la entrega no puede superar 240 caracteres.' USING ERRCODE='23514';
 END IF;
 IF NEW.casa_id IS NULL THEN
  RAISE EXCEPTION 'Número de casa obligatorio para una nueva solicitud de repartidor.' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.casas c WHERE c.id=NEW.casa_id AND c.activo IS TRUE
   AND CASE WHEN c.numero ~ '^[0-9]{1,10}$'
    THEN c.numero::bigint BETWEEN 40 AND 66 ELSE false END
 ) THEN
  RAISE EXCEPTION 'Solo se aceptan entregas para casas activas de la 40 a la 66.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$
;
