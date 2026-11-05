-- Intervención del Portero IA a los 2 minutos: notificación y validación de acreditación.
-- SEGURIDAD: Nunca envía órdenes al ESP32 ni genera códigos. El nombre de una empresa
-- y la evaluación textual de IA no son pruebas verificables de identidad.
-- Aplica solo a nuevas solicitudes marcadas como modo mixto.
ALTER TABLE public.entregas_contacto
 ADD COLUMN IF NOT EXISTS portero_modo_mixto boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS portero_intervino_at timestamptz,
 ADD COLUMN IF NOT EXISTS portero_resultado text;

ALTER TABLE public.entregas_contacto
 ADD CONSTRAINT portero_resultado_seguro
 CHECK (portero_resultado IS NULL OR portero_resultado IN
    ('empresa_permitida_sin_acreditacion','sin_acreditacion'));

COMMENT ON COLUMN public.entregas_contacto.portero_resultado IS
 'Resultado informativo. Nunca autoriza una apertura de portón.';

CREATE OR REPLACE FUNCTION access_private.portero_intervenir_pendientes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v public.entregas_contacto%rowtype;
 v_numero text;
 v_empresa_permitida boolean;
 v_total integer := 0;
 v_hora time := (now() AT TIME ZONE 'America/Mexico_City')::time;
BEGIN
 FOR v IN
  SELECT d.* FROM public.entregas_contacto d
  WHERE d.portero_modo_mixto IS TRUE
    AND d.estado = 'esperando'
    AND d.portero_intervino_at IS NULL
    AND d.created_at <= now() - interval '2 minutes'
    AND d.expires_at > now()
  ORDER BY d.created_at
  LIMIT 100
  FOR UPDATE SKIP LOCKED
 LOOP
  SELECT c.numero INTO v_numero FROM public.casas c WHERE c.id=v.casa_id;
  SELECT EXISTS(
   SELECT 1 FROM public.empresas_reparto_autorizadas e
   WHERE e.activa IS TRUE
     AND lower(btrim(e.nombre))=lower(btrim(coalesce(v.empresa,'')))
     AND v_hora BETWEEN e.hora_inicio AND e.hora_fin
  ) INTO v_empresa_permitida;

  -- El catálogo NO verifica que quien llegó represente a esa empresa.
  UPDATE public.entregas_contacto
     SET portero_intervino_at = now(),
         portero_resultado = CASE WHEN v_empresa_permitida
          THEN 'empresa_permitida_sin_acreditacion'
          ELSE 'sin_acreditacion' END
   WHERE id=v.id AND estado='esperando' AND portero_intervino_at IS NULL;
  IF NOT FOUND THEN CONTINUE; END IF;

  PERFORM access_private.notify_owners(
   '🤖 Portero IA: revisión a los 2 minutos',
   'Casa '||coalesce(v_numero,'desconocida')||' · Empresa declarada: '||
     left(coalesce(v.empresa,'Sin empresa'),80)||
     '. No hay acreditación verificable del repartidor; el portón permanece cerrado. '||
     'La solicitud puede seguir siendo respondida por el residente.',
   'portero_ia_intervencion',
   'portero_ia:'||v.id::text,
   'entregas'
  );
  v_total:=v_total+1;
 END LOOP;
 RETURN v_total;
END
$function$;

-- No exponer la función privilegiada a clientes externos.
REVOKE ALL ON FUNCTION access_private.portero_intervenir_pendientes()
 FROM PUBLIC, anon, authenticated;
-- Cron de PostgreSQL ejecuta como postgres, no necesita acceso web.
SELECT cron.schedule(
 'portero-ia-intervencion-2-minutos',
 '* * * * *',
 'SELECT access_private.portero_intervenir_pendientes();'
);
