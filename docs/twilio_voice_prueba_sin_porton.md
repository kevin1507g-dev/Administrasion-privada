# Prueba controlada de llamadas Twilio Voice — Interfón

**Objetivo:** realizar una llamada manual al **celular propio, registrado y verificado de Sistema Admin**, reproducir un mensaje en español y probar opciones DTMF por teclado. **No está conectado a aperturas ni a los relés del ESP32**.

## Requisitos
1. En Supabase → Edge Functions → Secrets, mantener configurados los secretos privados existentes:
   - `TWILIO_ACCOUNT_SID` (`AC...`)
   - `TWILIO_AUTH_TOKEN` (no publicar ni compartir).
2. Añadir una variable **nueva**:
   - **Name:** `TWILIO_VOICE_FROM`
   - **Value:** número de origen de Voice autorizado en la cuenta Twilio, en formato internacional E.164, por ejemplo `+1XXXXXXXXXX` si es un número estadounidense real habilitado en esa cuenta.
3. No usar el SID del servicio Verify (`VA...`) en el campo `TWILIO_VOICE_FROM`. Es un **número telefónico**, no una clave ni un identificador de servicio.
4. La cuenta de prueba de Twilio puede exigir un destinatario previamente autorizado para llamadas. La verificación SMS de la plataforma no necesariamente autoriza un destino de Voice en la cuenta de Twilio.
5. Toda contratación o pago del servicio de telefonía debe gestionarlo el titular adulto autorizado. No se compran números ni se realiza actualización de cuenta desde esta función.

Cómo obtener un número de origen autorizado: revisa los números activos de Twilio con capacidad Voice o los números de identificación de llamadas previamente verificados en la consola. La demostración «Try out Voice» puede usar un número de prueba que no esté asignado a tu cuenta para llamadas por API; de ser así, **no inventes un número**. Usa uno que la cuenta permita para llamadas salientes. Documentación: https://www.twilio.com/docs/usage/trials/try-out-voice y https://www.twilio.com/docs/voice/api/call-resource

## Probar desde Administración Residencial
1. Inicia sesión como Sistema Admin.
2. Abre **Teléfono de Sistema Admin → Prueba de llamada del interfón**.
3. Pulsa **Revisar configuración de Voice**; si `TWILIO_VOICE_FROM` está ausente, el botón para llamar permanecerá desactivado.
4. Pulsa **Probar llamada a mi celular**, confirma voluntariamente la operación, y contesta el celular verificado.
5. Durante la llamada, pulsa **1** para escuchar confirmación de comunicación simulada, **2** para escuchar confirmación de autorización simulada o **3** para escuchar rechazo simulado. Las opciones solo devuelven un mensaje y terminan la llamada.

## Seguridad y límites
- Las solicitudes desde la web requieren sesión Supabase real, perfil `owner` activo y aprobado.
- El número de destino **nunca** lo decide el navegador. Se descifra en el servidor a partir del teléfono propio de Sistema Admin, previamente verificado; la respuesta pública solo muestra los últimos cuatro dígitos.
- Máximo **3 intentos de llamada cada 24 horas**, al menos **3 minutos entre intentos**. Sin llamadas automáticas por abrir la página.
- El webhook DTMF usa **X-Twilio-Signature** comprobado con el Auth Token privado; no se dan privilegios ni se realizan actualizaciones de acceso desde esa respuesta.
- El menú de voz y su interpretación son completamente aislados del portón. **No** existe acción de apertura, contacto a residentes, grabación de llamadas, desvío ni comando al ESP32.
- Los intentos pueden consumir créditos/minutos del proveedor, incluso durante pruebas; confirmar antes de llamar.
- El número de origen `TWILIO_VOICE_FROM` es adicional a las tres variables que ya usaste para Twilio Verify.

## Estado técnico
- Migración: `database/interfon_voice_pruebas_owner_20261121.sql`.
- Edge Function: `supabase/functions/interfon-voice-prueba/index.ts`; para recibir webhooks Twilio se despliega con `verify_jwt=false`, **pero el endpoint de inicio exige validar JWT + rol owner en el propio código**, y el webhook se comprueba con firma criptográfica Twilio.
- Interfaz: `interfon-voice-demo.js`, disponible solamente en el panel owner.
- Una llamada solo puede probarse cuando existan credenciales reales, número de origen válido y permisos Voice. La presencia del botón no implica que un servicio de telefonía haya aceptado la llamada.
