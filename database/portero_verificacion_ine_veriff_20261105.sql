-- Verificación externa de identidad para el Portero IA (proveedor Veriff).
-- No se almacenan fotografías, CURP, CIC, dirección, OCR ni datos biométricos.
-- El resultado no concede autorización física al portón.
CREATE TABLE IF NOT EXISTS public.portero_identidad_verificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor text NOT NULL DEFAULT 'veriff' CHECK (proveedor='veriff'),
  sesion_proveedor uuid UNIQUE,
  consulta_hash text NOT NULL UNIQUE CHECK (consulta_hash ~ '^[a-f0-9]{64}$'),
  casa_numero text NOT NULL CHECK (casa_numero ~ '^(4[0-9]|5[0-9]|6[0-6])$'),
  empresa text NOT NULL CHECK (char_length(btrim(empresa)) BETWEEN 1 AND 80),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','reintentar','revision','vencida')),
  consentimiento_at timestamptz NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  vence_at timestamptz NOT NULL DEFAULT (now()+interval '15 minutes'),
  decision_at timestamptz,
  verificada_at timestamptz,
  limite_hash text NOT NULL CHECK (limite_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS portero_idv_limite_fecha_idx
 ON public.portero_identidad_verificaciones(limite_hash,creado_at DESC);
CREATE INDEX IF NOT EXISTS portero_idv_estado_fecha_idx
 ON public.portero_identidad_verificaciones(estado,vence_at);

ALTER TABLE public.portero_identidad_verificaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portero_identidad_verificaciones FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.portero_identidad_verificaciones IS
 'Estado mínimo de validación externa de identidad. No contiene copias de INE, selfies, CURP, domicilios ni datos de credencial. No autoriza portón.';
