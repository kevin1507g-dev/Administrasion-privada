-- El Portero IA ya no autoriza repartidores manualmente por persona.
-- Deshabilitar el privilegio adicional que se había concedido a sesiones autenticadas.
-- No altera apertura de residentes, códigos de visita, ni ESP32.
REVOKE EXECUTE ON FUNCTION public.portero_owner_autorizar(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.portero_owner_autorizar(uuid) FROM PUBLIC, anon;
COMMENT ON FUNCTION public.portero_owner_autorizar(uuid) IS
 'Deshabilitada: el usuario no desea autorizar personal individualmente desde el chat.';
