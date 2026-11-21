# Piloto WebRTC de voz para Portero Virtual · Privada Valle de los Beteles

Estado: backend desplegado y esquema creado; interfaz en rama feature/webrtc-interfon-piloto hasta integrar a GitHub Pages.
No sustituye el código de visitas ni permite apertura de relés o ESP32.

## Flujo
1. Visitante abre repartidor.html, completa datos obligatorios y solicita permiso mediante el Portero Virtual. La solicitud y su token opaco se crean por delivery-contact (límite existente: 5 solicitudes/10 min por IP/cliente).
2. Solo mientras la solicitud sigue vigente aparece «Iniciar llamada de voz». El visitante pulsa y acepta el micrófono.
3. Solo residentes activos y aprobados vinculados a esa casa reciben aviso de llamada al tener abierto el panel web. El primero que acepta queda ligado a la llamada.
4. Ambos hablan por WebRTC (audio). La señalización ICE/SDP pasa por una Edge Function con autorización por solicitud o sesión, nunca por tablas públicas accesibles a clientes.
5. El visitante o residente puede terminar; las conversaciones vencen como máximo a los 3 minutos. No hay grabación, SMS, llamada telefónica de la compañía, ni acceso físico.
6. Si el QR está desactivado, los endpoints de llamada rechazan peticiones.

## Archivo y seguridad
- Frontend: interfon-webrtc.js, cargado en index.html y repartidor.html.
- Backend: supabase/functions/interfon-webrtc/index.ts, verify_jwt=false porque el visitante no inicia sesión; el servidor exige un token de solicitud difícil de adivinar para el visitante y un JWT Supabase real de residente para el otro extremo.
- Esquema: database/interfon_webrtc_piloto_20261121.sql, dos tablas con RLS activo y permisos de lectura/escritura solo para service_role.
- El servidor comprueba casa, solicitud vigente, QR habilitado, tipo de señal y miembro autorizado. Una llamada por solicitud y una llamada simultánea por casa.
- SDP/ICE puede contener IP; se elimina al terminar y mediante pg_cron para señales de más de 10 minutos (cada 15 min).
- No guardar audio ni números personales. No exponer service_role en GitHub Pages.

## Restricciones del piloto
- Ambos celulares deben tener internet, HTTPS, permiso para micrófono y la página abierta; no puede sonar como llamada convencional si la pestaña está cerrada.
- Solo STUN (stun.l.google.com:19302). En redes celulares o NAT restrictivo puede fallar; para producción contratar/configurar TURN con credenciales efímeras.
- Audio autoplay en iPhone puede requerir pulsar «Escuchar audio».
- Los avisos son visibles con panel abierto, todavía no hay notificación push para llamadas en segundo plano.
- No se ha completado una prueba real extremo a extremo con dos teléfonos. Requiere pruebas de micrófono/sonido, tiempo de espera, expiración y reconexión.

## Prueba manual sin abrir el portón
1. Iniciar sesión en Administración Residencial como residente activo de una casa del 40 al 66 y mantener esa pestaña abierta.
2. En otro celular abrir QR del Portero Virtual, llenar datos y enviar solicitud ordinaria para esa misma casa.
3. Pulsar «Iniciar llamada de voz» y conceder acceso al micrófono.
4. En la pestaña del residente, pulsar «Contestar», aceptar el micrófono y comprobar el audio en ambos sentidos.
5. Probar «Rechazar» y «Terminar» en una solicitud nueva; confirmar que no hay apertura ni comando a equipo.
6. Probar solicitud expirada, casa sin residentes, QR fuera de servicio, otras casas y permisos sin sesión.
7. Para producción, añadir TURN, control de calidad y notificaciones push antes de ofrecer la funcionalidad como fiable.

La llamada WebRTC es distinta de las llamadas telefónicas salientes de Twilio y no debe confundirse con su prueba de voz.
