# Acceso anticipadamente autorizado para proveedores

## Objetivo
Permitir a un proveedor identificado y aprobado solicitar el acceso al portón sin esperar una autorización **en ese momento**, porque la persona residente ya autorizó previamente el ingreso para su propia casa, dentro de un horario y una vigencia limitados.

**Estado actual: arquitectura preparada, no activada.** Esta fase solo incorpora una tabla privada de permisos anticipados; no ofrece un botón de apertura automática ni modifica el ESP32 o sus comandos.

## Separación indispensable de autorizaciones

1. **Alta del proveedor:** nombre, ambos apellidos, casa de destino y empresa declarada, con aviso de privacidad completo. Datos de la empresa e identidad no verificados no deben considerarse acreditación para un acceso sin intervención.
2. **Revisión de identidad:** procedimiento real y proporcional definido por la administración, con protección de datos y alternativa de visita tradicional. La videovigilancia ofrece trazabilidad pero no prueba que el código pertenece a la persona que lo presenta.
3. **Permiso anticipado por casa:** residente identificado y activo crea y puede revocar una autorización limitada; no es un permiso general del condominio. Sistema Admin puede suspender o revocar.
4. **Uso autorizado:** la plataforma comprueba nuevamente permiso, casa, ventana horaria, vigencia y límites; un código compartido o reproducido no puede sustituir controles de identidad/autenticidad adicionales.
5. **Seguridad de portón:** requiere revisión presencial por adulto responsable o instalador cualificado de las fotoceldas, sensores antiatrapamiento, paro/reversión, estado del área y cumplimiento normativo aplicable. Ante fallas del dispositivo, red, sensores o condiciones inseguras, denegar apertura. El sistema jamás debe mantener el relé energizado durante la ventana de acceso.
6. **Auditoría:** registrar aprobación, revocación e intentos y aperturas, y usar videovigilancia bajo aviso apropiado y controles de acceso. Mantener bloqueo por deuda, controles suspendidos y modo evento, y límites del equipo existente.
7. **Pruebas:** primero con operador desconectado y órdenes simuladas; luego supervisadas y autorizadas por un adulto responsable. No habilitar apertura automática por registro/empresa autodeclarados, tarjeta de visitante reutilizable o solo por presencia de una cámara.

## Requisitos previos para activar
- Completar domicilio del responsable y validar aviso de privacidad, bases de tratamiento, retención, medidas de seguridad e información sobre cámaras.
- Validar el estado de los registros y permisos con el residente titular de cada casa.
- Verificar físicamente protecciones del portón y el integrador ESP32; preparar control de emergencia y revocación.
- Implementar comprobación de identidad del proveedor sin exponer INE ni fotografías innecesarias.
- Evaluación de seguridad y pruebas completas del servicio real antes de activar relés.

## Fase de base de datos preparada
`database/proveedores_permisos_anticipados_20261118.sql` crea una tabla con RLS, sin permisos directos para usuarios web y sin RPC que pueda accionar dispositivos. Cada permiso tiene proveedor, casa, periodo (máximo 30 días), horario, máximo de 1 a 30 aperturas, uso acumulado, estado inicial `pendiente` y persona que autoriza. Ningún permiso nuevo se considera activo por defecto.

## Comportamiento de la plataforma vigente
`access_private.request_delivery` exige un residente autenticado y aprobado de la casa, una entrega vigente, equipo disponible y las verificaciones del control digital. `public.digital_access_delivery_request` limita el objetivo al portón. **No se modifican estas funciones.**
