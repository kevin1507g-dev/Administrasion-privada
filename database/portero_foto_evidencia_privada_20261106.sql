-- Evidencia visual voluntaria de entrega: INE o rostro (no lectura de datos).
-- No es acreditación de identidad ni autoriza órdenes al ESP32.
-- La función Edge solo podrá usar este recurso tras publicar aviso de privacidad.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('portero-evidencia','portero-evidencia',false,3145728,
 ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT(id) DO UPDATE SET
 public=false, file_size_limit=3145728,
 allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp']::text[];

CREATE TABLE IF NOT EXISTS public.portero_fotos_evidencia (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 origen text NOT NULL CHECK (origen IN ('entrega','chat')),
 entrega_id uuid UNIQUE REFERENCES public.entregas_contacto(id) ON DELETE SET NULL,
 chat_id uuid UNIQUE REFERENCES public.portero_owner_chats(id) ON DELETE SET NULL,
 casa_numero text NOT NULL CHECK (casa_numero ~ '^(4[0-9]|5[0-9]|6[0-6])$'),
 tipo text NOT NULL CHECK (tipo IN ('ine','rostro')),
 ruta text NOT NULL UNIQUE,
 mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
 bytes integer NOT NULL CHECK (bytes BETWEEN 1024 AND 3145728),
 consentimiento_at timestamptz NOT NULL,
 creado_at timestamptz NOT NULL DEFAULT now(),
 vence_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
 CHECK ((origen='entrega' AND entrega_id IS NOT NULL AND chat_id IS NULL)
   OR (origen='chat' AND chat_id IS NOT NULL AND entrega_id IS NULL))
);
CREATE INDEX IF NOT EXISTS portero_fotos_evidencia_caducidad
 ON public.portero_fotos_evidencia(vence_at);
ALTER TABLE public.portero_fotos_evidencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portero_fotos_evidencia FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.portero_fotos_evidencia IS
 'Foto de evidencia privada con consentimiento; no se leen datos ni se comparan rostros. El proveedor captura solo si está configurado el aviso. Conservación inicial 7 días.';
-- Nadie recibe acceso directo al Storage desde el QR.
-- La Edge Function usa service_role tras validar el token de entrega
-- o la sesión de Sistema Admin. Prohibido crear políticas públicas.

-- Solo borra elementos caducados; si se requiere conservar un expediente,
-- se debe establecer un procedimiento legal independiente antes del vencimiento.
-- El cron de borrado se activa cuando el servicio esté configurado.
