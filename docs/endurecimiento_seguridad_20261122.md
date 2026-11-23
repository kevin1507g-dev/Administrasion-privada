# Endurecimiento de seguridad · Administración Residencial

Fecha: 22 de noviembre de 2026. Proyecto: Supabase `nndlfkuelwpwklldvtfo` y GitHub Pages.

## Cambios aplicados y verificados

1. `database/revocar_ejecucion_disparadores_20261122.sql`: eliminar EXECUTE de PUBLIC, anon y authenticated sobre 9 funciones internas RETURNS trigger (pagos, cuotas, perfiles, chat). Conservar todas las funciones y triggers. Advisor: advertencias anónimas SECURITY DEFINER 13 → 4; autenticadas 67 → 58.
2. `database/registro_residentes_casas_existentes_20261122.sql`: impedir que un alta de Auth cree automáticamente una casa; solo usa una casa existente y activa con número 40–66; mantiene rol residente inactivo pendiente de aprobación. Búsqueda en BD: 27 casas, 0 fuera de rango, trigger activo, código ya no inserta en casas. Cambió search_path a cadena vacía con nombres de tabla calificados.
3. `supabase/functions/register-resident-no-email-confirm/index.ts`: también valida casa activa y rango en Edge, y exige contraseña de al menos 12 caracteres para nuevas altas; versión 24 activa en Supabase. Mantiene sus límites existentes de solicitudes y la aprobación administrativa.
4. `index.html`: validar el mismo rango y longitud mínima en el formulario; no cambia cuentas ya existentes.

## Comportamiento intencional y no modificado

- El portero del QR, códigos de visita y dispositivo ESP32 siguen con sus flujos actuales; no se probaron ni emitieron aperturas.
- Los llamados RPC públicos con token del dispositivo o código de visita no se han deshabilitado: hay que auditar y probar sus mecanismos de autenticación y límites antes de cambiar permisos.
- El registro todavía usa email_confirm=true sin demostrar propiedad del correo. La aprobación manual protege el acceso, pero **no valida la titularidad del correo**. Migrar a un alta con confirmación de correo requiere diseñar y probar un nuevo flujo de correo y aprobación.
- Sigue pendiente activar la protección contra contraseñas filtradas desde el panel de Auth de Supabase. No hay una herramienta conectada que cambie esa configuración.
- Advertencias del advisor `rls_enabled_no_policy` de las tablas privadas siguen siendo intencionales cuando service_role opera la tabla. No añadir políticas abiertas para «eliminarlas».
- `pg_net` en public: revisar dependencias antes de trasladar la extensión.

## Pruebas pendientes

- Registro válido de prueba (sin crear datos reales ahora), rechazo de registro fuera del rango y contraseña corta, inicio de sesión de roles owner/admin/residente, pagos/actualizaciones que disparan triggers, acceso digital y códigos con supervisión de instalador.
- Activar protección contra contraseñas comprometidas en Supabase Auth y probar restablecimiento seguro de contraseñas.
- Revisión específica de las funciones SECURITY DEFINER que todavía son invocables por roles autenticados; las que usan tokens anónimos para portero requieren un diseño diferente, no revocación indiscriminada.

La auditoría y estas correcciones no constituyen una garantía de seguridad absoluta ni sustituyen pruebas de penetración autorizadas y copias de seguridad.
