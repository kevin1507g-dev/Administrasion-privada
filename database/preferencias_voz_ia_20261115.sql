-- Extender preferencias personales del asistente: sólo se puede leer/escribir
-- la fila del usuario autenticado gracias a las políticas RLS existentes.
-- No introduce permisos administrativos ni claves secretas.
ALTER TABLE public.ia_preferencias
 ADD COLUMN IF NOT EXISTS voz_id text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS voz_nombre text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS voz_perfil text NOT NULL DEFAULT 'todas',
 ADD COLUMN IF NOT EXISTS voz_velocidad numeric(3,2) NOT NULL DEFAULT 1.00,
 ADD COLUMN IF NOT EXISTS voz_tono numeric(3,2) NOT NULL DEFAULT 1.00,
 ADD COLUMN IF NOT EXISTS voz_volumen numeric(3,2) NOT NULL DEFAULT 1.00;
ALTER TABLE public.ia_preferencias
 DROP CONSTRAINT IF EXISTS ia_preferencias_voz_perfil_chk,
 DROP CONSTRAINT IF EXISTS ia_preferencias_voz_valores_chk;
ALTER TABLE public.ia_preferencias
 ADD CONSTRAINT ia_preferencias_voz_perfil_chk
 CHECK (voz_perfil IN ('todas','femeninas','masculinas','naturales')),
 ADD CONSTRAINT ia_preferencias_voz_valores_chk
 CHECK (
  char_length(voz_id) <= 500 AND char_length(voz_nombre) <= 200
  AND voz_velocidad BETWEEN 0.70 AND 1.40
  AND voz_tono BETWEEN 0.70 AND 1.40
  AND voz_volumen BETWEEN 0.00 AND 1.00
 );
-- La tabla ia_preferencias ya tiene SELECT/INSERT/UPDATE para authenticated
-- y tres políticas que exigen usuario_id = auth.uid() en SELECT/INSERT/UPDATE.
