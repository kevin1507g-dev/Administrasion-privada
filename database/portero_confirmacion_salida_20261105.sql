-- Salida declarada por el visitante, ligada a una autorización real.
-- No modifica el portón, dispositivos, relevadores ni Modo Evento.
CREATE OR REPLACE FUNCTION public.portero_reportar_salida(
 p_origen text, p_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 d public.entregas_contacto%rowtype;
 v public.visitor_pass_access_log%rowtype;
BEGIN
 IF p_token IS NULL OR p_origen NOT IN ('entrega','codigo') THEN
  RETURN jsonb_build_object('ok',false,'mensaje','Datos no válidos.');
 END IF;
 IF p_origen='entrega' THEN
  SELECT * INTO d FROM public.entregas_contacto
   WHERE public_token=p_token FOR UPDATE;
  IF d.id IS NULL OR d.estado<>'respondido' OR
    d.respuesta NOT IN ('acceso_porton','acceso_peatonal') OR
    d.respondido_at IS NULL THEN
   RETURN jsonb_build_object('ok',false,'mensaje','No existe autorización de apertura para esta solicitud.');
  END IF;
  IF d.salida_reportada_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',true,'salida_at',d.salida_reportada_at,'ya_registrada',true);
  END IF;
  IF d.respondido_at>now() OR d.respondido_at<=now()-interval '7 minutes' THEN
   RETURN jsonb_build_object('ok',false,'mensaje','Terminó la ventana de siete minutos.');
  END IF;
  UPDATE public.entregas_contacto SET salida_reportada_at=now() WHERE id=d.id;
  RETURN jsonb_build_object('ok',true,'salida_at',now());
 END IF;
 SELECT * INTO v FROM public.visitor_pass_access_log
  WHERE command_id=p_token FOR UPDATE;
 IF v.id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'mensaje','No existe autorización para este código.');
 END IF;
 IF v.salida_reportada_at IS NOT NULL THEN
  RETURN jsonb_build_object('ok',true,'salida_at',v.salida_reportada_at,'ya_registrada',true);
 END IF;
 IF v.created_at>now() OR v.created_at<=now()-interval '7 minutes' THEN
  RETURN jsonb_build_object('ok',false,'mensaje','Terminó la ventana de siete minutos.');
 END IF;
 UPDATE public.visitor_pass_access_log SET salida_reportada_at=now() WHERE id=v.id;
 RETURN jsonb_build_object('ok',true,'salida_at',now());
END $$;
REVOKE ALL ON FUNCTION public.portero_reportar_salida(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portero_reportar_salida(text,uuid) TO anon,authenticated;
