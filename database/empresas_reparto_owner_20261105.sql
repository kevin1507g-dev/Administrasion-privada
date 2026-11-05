-- Empresas de reparto autorizadas por Sistema Admin.
-- El catálogo por sí solo NO autoriza un pulso al ESP32.
-- El acceso automático requerirá un comprobante verificable de la empresa, no su nombre declarado.
CREATE TABLE IF NOT EXISTS public.empresas_reparto_autorizadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 2 AND 80),
  activa boolean NOT NULL DEFAULT false,
  hora_inicio time NOT NULL DEFAULT '08:00',
  hora_fin time NOT NULL DEFAULT '20:00',
  creado_por uuid REFERENCES public.profiles(id),
  creada_at timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_reparto_horario CHECK (hora_inicio < hora_fin)
);
CREATE UNIQUE INDEX IF NOT EXISTS empresas_reparto_nombre_unico
  ON public.empresas_reparto_autorizadas (lower(btrim(nombre)));
ALTER TABLE public.empresas_reparto_autorizadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY empresas_reparto_owner_select ON public.empresas_reparto_autorizadas
 FOR SELECT TO authenticated USING (public.current_user_role()='owner');
CREATE POLICY empresas_reparto_owner_insert ON public.empresas_reparto_autorizadas
 FOR INSERT TO authenticated WITH CHECK (public.current_user_role()='owner' AND creado_por=auth.uid());
CREATE POLICY empresas_reparto_owner_update ON public.empresas_reparto_autorizadas
 FOR UPDATE TO authenticated USING (public.current_user_role()='owner')
 WITH CHECK (public.current_user_role()='owner');
CREATE POLICY empresas_reparto_owner_delete ON public.empresas_reparto_autorizadas
 FOR DELETE TO authenticated USING (public.current_user_role()='owner');
