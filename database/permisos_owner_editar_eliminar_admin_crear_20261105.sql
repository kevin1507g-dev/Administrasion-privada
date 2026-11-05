-- Regla de Administración Residencial: Admin solo consulta/crea; Sistema Admin puede consultar/crear/editar/borrar.
-- Se conservan las políticas específicas para acciones propias de residentes y guardias.
-- Aplicar como migración transaccional, sin modificar registros de negocio.

-- accesos
DROP POLICY "admin full access accesos" ON public.accesos;
CREATE POLICY role_managers_select ON public.accesos FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.accesos FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.accesos FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.accesos FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- avisos_condominio
DROP POLICY "admin full access avisos" ON public.avisos_condominio;
CREATE POLICY role_managers_select ON public.avisos_condominio FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.avisos_condominio FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.avisos_condominio FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.avisos_condominio FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- casas
DROP POLICY "casas_admin_all" ON public.casas;
CREATE POLICY role_managers_select ON public.casas FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.casas FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.casas FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.casas FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- contactos_emergencia
DROP POLICY "admin full access contactos emergencia" ON public.contactos_emergencia;
CREATE POLICY role_managers_select ON public.contactos_emergencia FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.contactos_emergencia FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.contactos_emergencia FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.contactos_emergencia FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- controles_residenciales
DROP POLICY "admin full access controles residenciales" ON public.controles_residenciales;
CREATE POLICY role_managers_select ON public.controles_residenciales FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.controles_residenciales FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.controles_residenciales FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.controles_residenciales FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- cuotas
DROP POLICY "admin full access cuotas" ON public.cuotas;
CREATE POLICY role_managers_select ON public.cuotas FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.cuotas FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.cuotas FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.cuotas FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- documentos_condominio
DROP POLICY "admin full access documentos" ON public.documentos_condominio;
CREATE POLICY role_managers_select ON public.documentos_condominio FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.documentos_condominio FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.documentos_condominio FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.documentos_condominio FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- gastos
DROP POLICY "admin full access gastos" ON public.gastos;
CREATE POLICY role_managers_select ON public.gastos FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.gastos FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.gastos FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.gastos FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- incidente_mensajes
DROP POLICY "admin full access incidente mensajes" ON public.incidente_mensajes;
CREATE POLICY role_managers_select ON public.incidente_mensajes FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.incidente_mensajes FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.incidente_mensajes FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.incidente_mensajes FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- incidentes
DROP POLICY "admin full access incidentes" ON public.incidentes;
CREATE POLICY role_managers_select ON public.incidentes FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.incidentes FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.incidentes FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.incidentes FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- metodos_pago
DROP POLICY "admin full access metodos pago" ON public.metodos_pago;
CREATE POLICY role_managers_select ON public.metodos_pago FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.metodos_pago FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.metodos_pago FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.metodos_pago FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- notificaciones_push
DROP POLICY "admin full access notificaciones push" ON public.notificaciones_push;
CREATE POLICY role_managers_select ON public.notificaciones_push FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.notificaciones_push FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.notificaciones_push FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.notificaciones_push FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- pagos
DROP POLICY "admin full access pagos" ON public.pagos;
CREATE POLICY role_managers_select ON public.pagos FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.pagos FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.pagos FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.pagos FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- paquetes
DROP POLICY "admin full access paquetes" ON public.paquetes;
CREATE POLICY role_managers_select ON public.paquetes FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.paquetes FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.paquetes FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.paquetes FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- profiles
DROP POLICY "admin full access profiles" ON public.profiles;
CREATE POLICY role_managers_select ON public.profiles FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.profiles FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.profiles FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- reportes_mantenimiento
DROP POLICY "admin full access reportes" ON public.reportes_mantenimiento;
CREATE POLICY role_managers_select ON public.reportes_mantenimiento FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.reportes_mantenimiento FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.reportes_mantenimiento FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.reportes_mantenimiento FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- reservaciones
DROP POLICY "admin full access reservaciones" ON public.reservaciones;
CREATE POLICY role_managers_select ON public.reservaciones FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.reservaciones FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.reservaciones FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.reservaciones FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- visitas
DROP POLICY "admin full access visitas" ON public.visitas;
CREATE POLICY role_managers_select ON public.visitas FOR SELECT TO authenticated USING (current_user_role() IN ('admin','owner'));
CREATE POLICY role_managers_insert ON public.visitas FOR INSERT TO authenticated WITH CHECK (current_user_role() IN ('admin','owner'));
CREATE POLICY role_owner_update ON public.visitas FOR UPDATE TO authenticated USING (current_user_role() = 'owner') WITH CHECK (current_user_role() = 'owner');
CREATE POLICY role_owner_delete ON public.visitas FOR DELETE TO authenticated USING (current_user_role() = 'owner');

-- config_cobro_automatico: admin update config cobro automatico
ALTER POLICY "admin update config cobro automatico" ON public.config_cobro_automatico USING (current_user_role() = ANY (ARRAY['owner'::text])) WITH CHECK (current_user_role() = ANY (ARRAY['owner'::text]));

-- disciplina_aclaraciones: disciplina_aclaraciones_update
ALTER POLICY "disciplina_aclaraciones_update" ON public.disciplina_aclaraciones USING (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rol = ANY (ARRAY['owner'::text])) AND p.activo AND (p.estado_registro = 'aprobado'::text)))) WITH CHECK (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rol = ANY (ARRAY['owner'::text])) AND p.activo AND (p.estado_registro = 'aprobado'::text))));

-- disciplina_casos: disciplina_casos_update
ALTER POLICY "disciplina_casos_update" ON public.disciplina_casos USING (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rol = ANY (ARRAY['owner'::text])) AND p.activo AND (p.estado_registro = 'aprobado'::text)))) WITH CHECK (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rol = ANY (ARRAY['owner'::text])) AND p.activo AND (p.estado_registro = 'aprobado'::text))));

-- eventos: admin delete eventos
ALTER POLICY "admin delete eventos" ON public.eventos USING (current_user_role() = ANY (ARRAY['owner'::text]));

-- eventos: admin update eventos
ALTER POLICY "admin update eventos" ON public.eventos USING (current_user_role() = ANY (ARRAY['owner'::text])) WITH CHECK (current_user_role() = ANY (ARRAY['owner'::text]));

-- solicitudes_huella: huella_delete_pendiente_titular_o_admin
ALTER POLICY "huella_delete_pendiente_titular_o_admin" ON public.solicitudes_huella USING ((estado = 'pendiente_captura'::text) AND ((current_user_role() = ANY (ARRAY['owner'::text])) OR ((residente_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (profiles p
     JOIN casas c ON ((c.id = p.casa_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rol = 'residente'::text) AND (p.activo IS TRUE) AND (p.estado_registro = 'aprobado'::text) AND (c.activo IS TRUE) AND (p.casa_id = solicitudes_huella.casa_id)))))));

