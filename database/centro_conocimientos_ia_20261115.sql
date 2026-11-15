-- Centro de conocimientos aprobado por Sistema Admin.
-- No concede ninguna acción de control: únicamente consulta documental.
CREATE TABLE IF NOT EXISTS public.ia_conocimientos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tipo text NOT NULL CHECK (tipo IN ('regla','pregunta','documento')),
 categoria text NOT NULL DEFAULT 'General' CHECK (char_length(btrim(categoria)) BETWEEN 2 AND 70),
 titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 4 AND 160),
 pregunta text NOT NULL DEFAULT '' CHECK (char_length(pregunta) <= 500),
 respuesta text NOT NULL DEFAULT '' CHECK (char_length(respuesta) <= 6000),
 contenido text NOT NULL DEFAULT '' CHECK (char_length(contenido) <= 16000),
 roles text[] NOT NULL DEFAULT ARRAY['owner','admin','residente']::text[],
 activo boolean NOT NULL DEFAULT true,
 creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ia_conocimientos_roles CHECK (
  cardinality(roles) BETWEEN 1 AND 3
  AND roles <@ ARRAY['owner','admin','residente']::text[]
  AND 'owner'=ANY(roles)
 ),
 CONSTRAINT ia_conocimientos_texto CHECK (
  char_length(btrim(concat(pregunta,' ',respuesta,' ',contenido))) >= 8
 )
);
CREATE INDEX IF NOT EXISTS ia_conocimientos_fecha_idx
 ON public.ia_conocimientos (updated_at DESC);
CREATE INDEX IF NOT EXISTS ia_conocimientos_fts_idx ON public.ia_conocimientos
 USING gin (to_tsvector('spanish',
   coalesce(titulo,'')||' '||coalesce(categoria,'')||' '||
   coalesce(pregunta,'')||' '||coalesce(respuesta,'')||' '||coalesce(contenido,'')));

ALTER TABLE public.ia_conocimientos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ia_conocimientos FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ia_conocimientos TO authenticated;

DROP POLICY IF EXISTS "ia_conocimientos_ver_autorizados" ON public.ia_conocimientos;
CREATE POLICY "ia_conocimientos_ver_autorizados"
 ON public.ia_conocimientos FOR SELECT TO authenticated
 USING (
  (SELECT public.current_user_role()) = 'owner'
  OR (
   activo IS TRUE
   AND (SELECT public.current_user_role()) = ANY(roles)
  )
 );

DROP POLICY IF EXISTS "ia_conocimientos_crear_owner" ON public.ia_conocimientos;
CREATE POLICY "ia_conocimientos_crear_owner"
 ON public.ia_conocimientos FOR INSERT TO authenticated
 WITH CHECK (
  (SELECT public.current_user_role())='owner'
  AND creado_por=(SELECT auth.uid())
  AND actualizado_por=(SELECT auth.uid())
 );

DROP POLICY IF EXISTS "ia_conocimientos_modificar_owner" ON public.ia_conocimientos;
CREATE POLICY "ia_conocimientos_modificar_owner"
 ON public.ia_conocimientos FOR UPDATE TO authenticated
 USING ((SELECT public.current_user_role())='owner')
 WITH CHECK (
  (SELECT public.current_user_role())='owner'
  AND actualizado_por=(SELECT auth.uid())
 );

DROP POLICY IF EXISTS "ia_conocimientos_borrar_owner" ON public.ia_conocimientos;
CREATE POLICY "ia_conocimientos_borrar_owner"
 ON public.ia_conocimientos FOR DELETE TO authenticated
 USING ((SELECT public.current_user_role())='owner');

-- Búsqueda SQL bajo las mismas políticas RLS de la sesión autenticada.
-- SECURITY INVOKER preserva el acceso limitado a cada rol.
CREATE OR REPLACE FUNCTION public.ia_buscar_conocimientos(
 p_consulta text, p_limite integer DEFAULT 3
)
RETURNS TABLE (
 id uuid,
 titulo text,
 tipo text,
 categoria text,
 pregunta text,
 respuesta text,
 contenido text,
 puntaje real
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=''
AS $function$
 WITH term AS (
  SELECT websearch_to_tsquery('spanish', left(btrim(coalesce(p_consulta,'')),300)) AS q
 ),
 coincidencias AS (
  SELECT k.id,k.titulo,k.tipo,k.categoria,k.pregunta,k.respuesta,k.contenido,
   ts_rank(
    to_tsvector('spanish',
     coalesce(k.titulo,'')||' '||coalesce(k.categoria,'')||' '||
     coalesce(k.pregunta,'')||' '||coalesce(k.respuesta,'')||' '||coalesce(k.contenido,'')),
    term.q
   )::real AS puntaje
  FROM public.ia_conocimientos k CROSS JOIN term
  WHERE k.activo IS TRUE
   AND numnode(term.q)>0
   AND to_tsvector('spanish',
    coalesce(k.titulo,'')||' '||coalesce(k.categoria,'')||' '||
    coalesce(k.pregunta,'')||' '||coalesce(k.respuesta,'')||' '||coalesce(k.contenido,'')) @@ term.q
 )
 SELECT c.id,c.titulo,c.tipo,c.categoria,c.pregunta,c.respuesta,c.contenido,c.puntaje
 FROM coincidencias c ORDER BY c.puntaje DESC,c.titulo
 LIMIT least(greatest(coalesce(p_limite,3),1),5);
$function$;

REVOKE ALL ON FUNCTION public.ia_buscar_conocimientos(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_buscar_conocimientos(text,integer) TO authenticated;
