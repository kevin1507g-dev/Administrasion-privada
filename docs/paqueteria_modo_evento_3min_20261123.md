# Paquetería · Modo Evento de tres minutos

## Implementación
- Botón **📦 Paquetería** en Control Digital. Solo aparece a **Administrador** y **Sistema Admin**. La selección de rol visual no autoriza operaciones por sí misma.
- Nueva RPC `parcel_window_status()` y `parcel_window_manage('start'|'stop')`. Ambas verifican en Supabase que la cuenta esté activa, aprobada, con rol `admin` u `owner`.
- Tabla privada `parcel_window` con caducidad estricta de **tres minutos** y `parcel_window_audit` para registrar el autor de cada activación/cancelación.
- `access_private.event_schedule()` integra `parcel` como fuente, sin modificar la salida de pulso del portón ni el programa del ESP32.
- Se conservan las funciones de **Camión de basura (20 minutos)**. No se permite que se activen simultáneamente ambas ventanas ni que Paquetería se superponga a reservaciones aprobadas que comiencen dentro de los tres minutos.
- `garbage_window_manage()` se protege contra activar basura durante una ventana de Paquetería.
- Desactivación manual disponible mientras esté activa. El firmware usa el reloj local y apaga la salida Evento al expirar, perder Wi-Fi o no recibir confirmaciones en 15 segundos.
- Se requiere Modo Evento habilitado y ESP32 conectado. No se permite iniciar la ventana durante pruebas de mantenimiento.

## Límites
- Una llamada a la RPC **solicita el Modo Evento**. Ni el temporizador ni la respuesta del servidor certifican que el portón se haya abierto, permanezca abierto o esté libre de obstáculos.
- La electrónica existente usa **GPIO 25 para la salida mantenida**, y GPIO 26 para pulsos ordinarios. Esta implementación no genera pulsos adicionales a GPIO 26, no cambia firmware y no anula fotoceldas.
- No se verificó la instalación física ni se enviaron aperturas reales. Antes de confiar en una apertura de 3 minutos, un instalador debe comprobar la conexión del Modo Evento, fotoceldas, cierre y comportamiento ante interrupción de Internet y corte eléctrico.
- El Modo Evento por sí solo **no garantiza** una apertura física del portón. La automatización del motor necesita ser verificada presencialmente.
- No se ha modificado el comportamiento de «Puerta peatonal · Próximamente».

## Pruebas no invasivas verificadas
- Migración SQL aplicada en Supabase.
- Ventana inicial inactiva, auditoría sin movimientos y sin orden física.
- `anon` no puede ejecutar la RPC de gestión.
- Rol `owner`: permiso true; `admin`: true; `residente`: false (solo lectura simulando contexto JWT).
- RLS habilitado en tablas nuevas. Los datos de ventanas y auditoría no están expuestos directamente.
- Validación estática de JS e index.html; probar físicamente la apertura sigue pendiente.

## Reversión
Si se desea apagar esta función, volver a la versión previa de `index.html` y eliminar o deshabilitar el flujo de Paquetería. No deshacer mediante `DROP` de funciones o tablas usadas por otras ventanas sin evaluación previa.
