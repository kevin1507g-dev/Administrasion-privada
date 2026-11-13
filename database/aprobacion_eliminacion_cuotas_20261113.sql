-- Administración Residencial | Eliminación de cuotas con aprobación de Sistema Admin.
-- Las solicitudes de admin NO borran nada; únicamente owner activo/aprobado
-- puede resolverlas. Los pagos y referencias externas quedan protegidos.

CREATE TABLE IF NOT EXISTS public.solicitudes_baja_cuota (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cuota_id bigint NOT NULL,
 solicitante_id uuid NOT NULL,
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 5 AND 500),
 casa_numero text,
 concepto text NOT NULL,
 monto numeric NOT NULL,
 vencimiento date NOT NULL,
 estado text NOT NULL DEFAULT 'pendiente'
   CHECK (estado IN ('pendiente','aprobada','rechazada')),
 resultado text CHECK (resultado IS NULL OR resultado IN ('eliminada','archivada','rechazada')),
 resuelto_por uuid,
 resuelto_el timestamptz,
 creado_el timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_baja_cuota_pendiente_unica
 ON public.solicitudes_baja_cuota (cuota_id) WHERE estado='pendiente';
CREATE INDEX IF NOT EXISTS idx_solicitudes_baja_cuota_fecha
 ON public.solicitudes_baja_cuota (creado_el DESC);

ALTER TABLE public.solicitudes_baja_cuota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.solicitudes_baja_cuota FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.solicitudes_baja_cuota TO authenticated;
DROP POLICY IF EXISTS "solicitudes_baja_cuota_lectura" ON public.solicitudes_baja_cuota;
CREATE POLICY "solicitudes_baja_cuota_lectura"
 ON public.solicitudes_baja_cuota FOR SELECT TO authenticated
 USING (
  EXISTS (
   SELECT 1 FROM public.profiles p
   WHERE p.id=(SELECT auth.uid())
    AND p.activo IS TRUE
    AND p.estado_registro='aprobado'
    AND (
      p.rol='owner'
      OR (p.rol='admin' AND solicitudes_baja_cuota.solicitante_id=p.id)
    )
  )
 );

-- Ningún usuario autenticado puede borrar cuotas directamente, ni owner.
-- La única ruta del frontend es la aprobación transaccional de abajo.
DROP POLICY IF EXISTS "role_owner_delete" ON public.cuotas;
REVOKE DELETE ON TABLE public.cuotas FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.solicitar_baja_cuota(
 p_cuota_id bigint, p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_cuota public.cuotas%ROWTYPE;
 v_id uuid;
 v_motivo text:=btrim(coalesce(p_motivo,''));
 v_casa text;
BEGIN
 SELECT * INTO v_actor FROM public.profiles
  WHERE id=auth.uid();
 IF v_actor.id IS NULL OR v_actor.activo IS DISTINCT FROM true
    OR v_actor.estado_registro IS DISTINCT FROM 'aprobado'
    OR v_actor.rol NOT IN ('admin','owner') THEN
  RAISE EXCEPTION 'Solo Administración autorizada puede solicitar bajas de cuotas'
   USING ERRCODE='42501';
 END IF;
 IF char_length(v_motivo)<5 OR char_length(v_motivo)>500 THEN
  RETURN jsonb_build_object('ok',false,'reason','motivo_invalido');
 END IF;
 SELECT * INTO v_cuota FROM public.cuotas
  WHERE id=p_cuota_id FOR UPDATE;
 IF v_cuota.id IS NULL OR v_cuota.archivada IS TRUE THEN
  RETURN jsonb_build_object('ok',false,'reason','cuota_no_disponible');
 END IF;
 SELECT id INTO v_id FROM public.solicitudes_baja_cuota
  WHERE cuota_id=p_cuota_id AND estado='pendiente' LIMIT 1;
 IF v_id IS NOT NULL THEN
  RETURN jsonb_build_object('ok',true,'ya_solicitada',true,'solicitud_id',v_id);
 END IF;
 SELECT numero::text INTO v_casa FROM public.casas
  WHERE id=v_cuota.casa_id;
 INSERT INTO public.solicitudes_baja_cuota
   (cuota_id,solicitante_id,motivo,casa_numero,concepto,monto,vencimiento)
 VALUES
   (v_cuota.id,v_actor.id,v_motivo,v_casa,v_cuota.concepto,v_cuota.monto,v_cuota.vencimiento)
 ON CONFLICT (cuota_id) WHERE estado='pendiente' DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  RETURN jsonb_build_object('ok',true,'ya_solicitada',true);
 END IF;
 INSERT INTO public.notificaciones_push (user_id,titulo,mensaje,tipo,referencia,destino)
 SELECT p.id,'🧾 Aprobación de eliminación de cuota',
  'Se solicita eliminar una cuota de Casa '||coalesce(v_casa,'?')||
  ' ('||v_cuota.concepto||'). Revisa Solicitudes y permisos.',
  'solicitud_eliminacion_cuota',
  'cuota_baja:pendiente:'||v_id::text||':'||p.id::text,
  'solicitudes'
 FROM public.profiles p
 WHERE p.rol='owner' AND p.activo IS TRUE AND p.estado_registro='aprobado'
 ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('ok',true,'ya_solicitada',false,'solicitud_id',v_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.resolver_baja_cuota(
 p_solicitud_id uuid, p_aprobar boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_sol public.solicitudes_baja_cuota%ROWTYPE;
 v_cuota public.cuotas%ROWTYPE;
 v_pagos boolean;
 v_intents boolean;
 v_resultado text;
BEGIN
 SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
 IF v_actor.id IS NULL OR v_actor.rol <> 'owner'
    OR v_actor.activo IS DISTINCT FROM true
    OR v_actor.estado_registro IS DISTINCT FROM 'aprobado' THEN
  RAISE EXCEPTION 'Sólo Sistema Admin puede aprobar o rechazar la eliminación'
   USING ERRCODE='42501';
 END IF;
 IF p_aprobar IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','accion_invalida');
 END IF;
 SELECT * INTO v_sol FROM public.solicitudes_baja_cuota
  WHERE id=p_solicitud_id FOR UPDATE;
 IF v_sol.id IS NULL OR v_sol.estado <> 'pendiente' THEN
  RETURN jsonb_build_object('ok',false,'reason','solicitud_no_pendiente');
 END IF;
 IF p_aprobar THEN
  SELECT * INTO v_cuota FROM public.cuotas
   WHERE id=v_sol.cuota_id FOR UPDATE;
  IF v_cuota.id IS NULL OR v_cuota.archivada IS TRUE THEN
   RETURN jsonb_build_object('ok',false,'reason','cuota_no_disponible');
  END IF;
  IF v_cuota.concepto IS DISTINCT FROM v_sol.concepto
     OR v_cuota.monto IS DISTINCT FROM v_sol.monto
     OR v_cuota.vencimiento IS DISTINCT FROM v_sol.vencimiento THEN
   RETURN jsonb_build_object('ok',false,'reason','cuota_modificada');
  END IF;
  IF EXISTS (SELECT 1 FROM mp_private.intents i
              WHERE i.cuota_id=v_cuota.id AND i.status='review') THEN
   RETURN jsonb_build_object('ok',false,'reason','cobro_externo_en_revision');
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.pagos p WHERE p.cuota_id=v_cuota.id)
   INTO v_pagos;
  SELECT EXISTS(SELECT 1 FROM mp_private.intents i WHERE i.cuota_id=v_cuota.id)
   INTO v_intents;
  IF v_pagos OR v_intents THEN
   -- No borrar cuotas con pagos ni operaciones externas: archivar para auditoría.
   UPDATE public.cuotas
    SET archivada=true,archivada_el=now(),archivada_por=v_actor.id
    WHERE id=v_cuota.id;
   v_resultado:='archivada';
  ELSE
   DELETE FROM public.cuotas WHERE id=v_cuota.id;
   v_resultado:='eliminada';
  END IF;
 ELSE
  v_resultado:='rechazada';
 END IF;
 UPDATE public.solicitudes_baja_cuota
  SET estado=CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
      resultado=v_resultado,resuelto_por=v_actor.id,resuelto_el=now()
  WHERE id=v_sol.id;
 INSERT INTO public.notificaciones_push (user_id,titulo,mensaje,tipo,referencia,destino)
 VALUES (
  v_sol.solicitante_id,
  CASE WHEN p_aprobar THEN '✅ Solicitud de cuota aprobada' ELSE '❌ Solicitud de cuota rechazada' END,
  'Casa '||coalesce(v_sol.casa_numero,'?')||' · '||v_sol.concepto||
    CASE WHEN v_resultado='archivada' THEN
     ': la cuota se archivó para conservar el historial de pagos o cobros externos.'
     WHEN v_resultado='eliminada' THEN ': la cuota fue eliminada.'
     ELSE ': Sistema Admin rechazó la solicitud.' END,
  'eliminacion_cuota_resuelta',
  'cuota_baja:resuelta:'||v_sol.id::text||':'||v_sol.solicitante_id::text,
  'solicitudes'
 ) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('ok',true,'resultado',v_resultado);
END;
$fn$;

REVOKE ALL ON FUNCTION public.solicitar_baja_cuota(bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_baja_cuota(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_baja_cuota(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_baja_cuota(uuid,boolean) TO authenticated;
