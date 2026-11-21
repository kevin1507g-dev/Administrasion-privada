# Verificación SMS del teléfono de Sistema Admin — Twilio Verify

Estado: integración preparada para Sistema Admin, sin llamadas ni apertura del portón. Solo la autoverificación del celular registrado en el panel privado.

## Antes de usar
- La cuenta de Twilio debe tener un Verify Service real y permisos para enviar SMS al destino (en prueba gratuita, las restricciones del proveedor siguen vigentes).
- Una persona adulta autorizada por la administración debe encargarse de cualquier contratación, facturación y cumplimiento legal.
- La verificación completada directamente en «Try out Verify» de Twilio **no actualiza automáticamente** la ficha telefónica en Supabase. Se debe ejecutar de nuevo desde los botones del panel al terminar la configuración.

## Configuración privada en Supabase

Ir a **Supabase Dashboard → Project nndlfkuelwpwklldvtfo → Edge Functions → Secrets**. Configurar:

| Nombre secreto | Dato |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Account SID real de Twilio (empieza con `AC`) |
| `TWILIO_AUTH_TOKEN` | Auth Token privado |
| `TWILIO_VERIFY_SERVICE_SID` | Verify Service SID real (empieza con `VA`) |

No introducir estos valores en GitHub, HTML, scripts públicos, capturas o chats. Los secretos solo deben permanecer en Supabase. Si se expusieron, rotarlos en Twilio.

## Uso desde Administración Residencial

1. Iniciar sesión como **Sistema Admin** y abrir **Teléfono de Sistema Admin**.
2. Guardar el propio celular en el formato de diez dígitos. El servidor lo cifra con una clave almacenada en Supabase Vault.
3. En su tarjeta, pulsar **Enviar código**. La función de servidor llama a Twilio Verify con el teléfono guardado, nunca con un número proporcionado por la página.
4. Introducir personalmente el código recibido en **Verificar código**.
5. Solo una respuesta `approved` de Twilio permite marcar `verificado_at` en el servidor, y únicamente si el número cifrado continúa siendo el mismo.

Si aún no están los secretos, el panel muestra que faltan configurar y mantiene el botón deshabilitado. La integración **no envía SMS al cargar la página**.

## Protección y alcance

- Cada solicitud requiere sesión válida de Supabase, perfil de **owner** activo y aprobado, y teléfono propio de Sistema Admin.
- La función tiene un contador de intentos en una tabla privada: máximo 5 envíos y 12 comprobaciones en 24 horas, y espera al menos 60 segundos entre envíos.
- El directorio telefónico solo muestra los últimos cuatro dígitos.
- El usuario no puede verificar teléfonos de terceros ni iniciar verificaciones para residentes; los residentes permanecen bloqueados para captura.
- Los números cambiados vuelven a estado **pendiente**.
- La verificación SMS es únicamente validación de contacto: **no habilita llamadas de interfonía, consentimiento general, ni acciones sobre los relés/portón**.

## Despliegue
- Base de datos: `database/interfon_twilio_verify_owner_20261121.sql`.
- Función Edge: `supabase/functions/interfon-verify/index.ts`, desplegada como `interfon-verify` con verificación JWT obligatoria.
- Interfaz: `interfon-telefonos.js` y `index.html`; versión del caché en `sw.js`.

Es necesario verificar que el código llegue y que el panel cambie a «Verificado» con credenciales funcionales. Las pruebas no deben revelar el código recibido ni el token de Twilio.
