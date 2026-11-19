# Acceso anticipadamente autorizado para proveedores

## Objetivo
Permitir a un proveedor identificado y aprobado solicitar el acceso al portón sin esperar una autorización **en ese momento**, porque la persona residente ya autorizó previamente el ingreso para su propia casa, dentro de un horario y una vigencia limitados.

**Estado actual: arquitectura preparada, no activada.** Esta fase incorpora la estructura de permisos anticipados, pero todavía no existe una ruta que active automáticamente el relé del portón ni se cambia la programación del ESP32.

**Requisito actualizado: la propia llave `PR-...` es de un solo uso.** No se genera una segunda clave de acceso. Tras la aprobación administrativa, la llave PR solo puede vincularse a **una** solicitud de entrada para una casa. La reserva se realiza atómicamente para evitar duplicados y, cuando el ESP32 confirma su pulso, se registra `codigo_usado_at`. La llave permanece bloqueada incluso si el primer intento expira o falla; un nuevo ingreso necesita emitir otra llave aprobada. El uso de PR no elimina el permiso de la casa ni activa por sí solo el relé.

## Separación indispensable de autorizaciones

1. **Alta del proveedor:** nombre, ambos apellidos, casa de destino y empresa declarada, con aviso de privacidad completo. Datos de la empresa e identidad no verificados no deben considerarse acreditación para un acceso sin intervención.
2. **Revisión de identidad:** procedimiento real y proporcional definido por la administración, con protección de datos y alternativa de visita tradicional. La videovigilancia ofrece trazabilidad pero no prueba que el código pertenece a la persona que lo presenta.
3. **Permiso anticipado por casa:** residente identificado y activo crea y puede revocar una autorización limitada; no es un permiso general del condominio. Sistema Admin puede suspender o revocar.
4. **Uso autorizado:** la llave `PR-...` solo puede crear una solicitud vinculada (reserva atómica). Una apertura confirmada por ESP32 marca el uso definitivo, y la llave nunca puede solicitar otra apertura. La base de datos conserva la reserva aun si la solicitud falla para evitar un segundo pulso accidental. El flujo futuro de autorización anticipada debe comprobar casa, horario, identidad, sensores y límites antes de permitir órdenes físicas; por ahora sigue sin activarse automáticamente.
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
`database/proveedores_permisos_anticipados_20261118.sql` crea una tabla con RLS, sin permisos directos para usuarios web y sin RPC que pueda accionar dispositivos. Cada permiso tiene proveedor, casa, periodo (máximo 30 días), horario, **una sola apertura permitida**, uso acumulado de 0 o 1, estado inicial `pendiente` y persona que autoriza. La migración `database/proveedores_codigos_un_solo_uso_20261118.sql` obliga a `max_aperturas = 1` en los permisos anticipados. La nueva migración `database/proveedor_pr_llave_unica_20261118.sql` convierte la llave PR en el **único código necesario**: un índice único impide más de una solicitud vinculada a un proveedor y una función protegida reserva el primer uso en una sola transacción. El hash original del PR permanece en `proveedores_registrados` y jamás se almacena el código en claro. Ningún permiso nuevo se considera activo por defecto ni se han emitido códigos de entrada.

## Comportamiento de la plataforma vigente
`access_private.request_delivery` exige un residente autenticado y aprobado de la casa, una entrega vigente, equipo disponible y las verificaciones del control digital. `public.digital_access_delivery_request` limita el objetivo al portón. **No se modifican estas funciones.**
