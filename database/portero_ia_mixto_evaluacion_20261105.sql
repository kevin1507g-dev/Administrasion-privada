-- Portero Inteligente: evaluación ORIENTATIVA de solicitudes sin código.
-- No autoriza accesos, no altera controles físicos ni modifica autorizaciones.
ALTER TABLE public.entregas_contacto
  ADD COLUMN IF NOT EXISTS portero_ia_indicador text,
  ADD COLUMN IF NOT EXISTS portero_ia_nota text;

ALTER TABLE public.entregas_contacto
  ADD CONSTRAINT portero_ia_indicador_valido
  CHECK (portero_ia_indicador IS NULL OR portero_ia_indicador IN ('normal','revisar'));

ALTER TABLE public.entregas_contacto
  ADD CONSTRAINT portero_ia_nota_breve
  CHECK (portero_ia_nota IS NULL OR length(portero_ia_nota)<=220);

COMMENT ON COLUMN public.entregas_contacto.portero_ia_indicador IS
  'Orientación informativa, no autoriza apertura. Las solicitudes sin código siempre requieren residente.';
COMMENT ON COLUMN public.entregas_contacto.portero_ia_nota IS
  'Nota de IA; no verificó identidad ni empresa y no decide accesos.';
