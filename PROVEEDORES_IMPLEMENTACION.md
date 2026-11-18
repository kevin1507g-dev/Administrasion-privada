# Registro de proveedores integrado al Portero Virtual

## Estado
Backend y base de datos desplegados en Supabase (18/11/2026), con captura de fotografías deshabilitada.
La interfaz permanece en la rama de revisión PR #46, todavía no fusionada a main/GitHub Pages.
No modifica el firmware ESP32, los relés ni las RPC de apertura existentes.
El código de proveedor **NO** es un código de visita ni emite comandos de apertura.

## Flujo
1. **Portero Virtual > Soy proveedor · Registrarme** abre `proveedores.html`.
2. Proveedor adulto ingresa nombres, apellido paterno y materno, número de casa 40–66,
   INE frontal y trasera con datos innecesarios cubiertos, y foto de rostro.
3. Tras consentimiento y carga en Storage privado `proveedores-identidad`,
   recibe un código aleatorio de 80 bits `PR-<20 caracteres hexadecimales>`.
   Solo se almacena su SHA-256, nunca el código original.
4. Sistema Admin revisa en `proveedores-admin.html` con enlaces de 60 segundos
   y aprueba/rechaza; el servicio elimina las tres fotos al revisar.
5. El proveedor escribe el código en el Portero Virtual; se recuperan nombre,
   apellidos y casa, **solo con registro aprobado**.
6. **Solicitar acceso (3 minutos)** crea una solicitud en `entregas_contacto`
   con vencimiento de 3 minutos y notifica al residente de esa casa.
7. El residente debe autorizar mediante la infraestructura existente. Una orden
   de apertura sigue siendo un PULSO normal al dispositivo, nunca 3 minutos de
   relé energizado; la pantalla de salida usa un reloj de 3 minutos.

## Archivos
- `aviso-privacidad-proveedores.html` (borrador con campos legales obligatorios por completar)
- `database/proveedores_cron_seguro_20261118.sql`
- `database/proveedores_cron_schedule_20261118.sql`
- `database/proveedores_registro_seguro_20261118.sql`
- `supabase/functions/proveedores-registro/index.ts`
- `proveedores.html`
- `proveedores-admin.html`
- `proveedor-acceso.js`
- Enlaces añadidos a `repartidor.html` y al menú de Sistema Admin en `index.html`.

## Estado verificable al 18/11/2026

- Tablas `proveedores_registrados`, `proveedores_solicitudes_acceso`, `proveedores_consultas_rate`: creadas con RLS y acceso directo revocado.
- Bucket `proveedores-identidad`: privado.
- Edge Function `proveedores-registro`: desplegada; acción `capacidades` comprobada por HTTP 200, `registro_habilitado=false`, `apertura_automatica=false`.
- Limpieza `mantenimiento`: probada con secreto privado de Vault, HTTP 200; tareas cron `proveedores-documentos-diaria` (08:00 UTC) y `proveedores-ratelimit-diaria` (08:15 UTC) activas.
- Función de validación del cron: `anon` sin permiso; `service_role` con permiso. Ninguna foto real subida.
- JavaScript de interfaz revisado sintácticamente; pendiente prueba de extremo a extremo y publicación en GitHub Pages.

## Pendientes antes de permitir archivos reales

1. **Completar aviso**: falta nombre legal del responsable, domicilio completo y correo para derechos ARCO. Se encuentran marcados como campos pendientes en el borrador `aviso-privacidad-proveedores.html`. La persona responsable debe revisar el texto antes de publicarlo como definitivo.
2. Colocar el aviso definitivo en una URL HTTPS y configurar `PROVEEDORES_AVISO_PRIVACIDAD_URL`. La función también exige explícitamente `PROVEEDORES_REGISTRO_ACTIVO=true`; **no debe activarse antes de validar el aviso**.
3. Probar toda la interfaz y los permisos con documentos ficticios, incluida aprobación de Sistema Admin, denegación, acceso vencido, revocación y borrado de fotografías. Garantizar que los códigos solo completan datos y solicitan aprobación, sin apertura autónoma.
4. Fusionar PR #46 después de las pruebas para publicar botones y formularios en GitHub Pages.

**Nota de diseño:** los 3 minutos son la caducidad de la solicitud de acceso y el tiempo de confirmación de salida visible para el proveedor. El relé recibe el pulso normal cuando una autorización válida es emitida.
 
**Importante:** las imágenes son evidencia para revisión humana, NO una comprobación
biométrica ni una validación automática de la autenticidad de la INE.
