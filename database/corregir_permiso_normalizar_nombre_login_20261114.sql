-- Restaurar únicamente la ejecución de la función de normalización necesaria
-- para actualizar el nombre de un residente desde una sesión autenticada.
-- Esta función es SQL IMMUTABLE: procesa una cadena de texto, sin leer
-- tablas ni modificar registros. No concede UPDATE sobre perfiles.
-- La política RLS role_owner_update sigue limitando la edición a Sistema Admin.
REVOKE EXECUTE ON FUNCTION public.normalizar_nombre_login(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_nombre_login(text) TO authenticated;
