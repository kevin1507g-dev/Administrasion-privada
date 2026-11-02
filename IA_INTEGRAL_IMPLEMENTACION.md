# Asistente Residencial IA — Implementación 2026-11-02

## Estado y alcance
Implementación en rama aislada feature/asistente-residencial-ia-20261102. No fusionar automáticamente a main sin pruebas con cuenta real y revisión de credenciales. Los recursos independientes de Supabase (migraciones, Edge Function, cron) sí están instalados. GitHub Pages sigue sirviendo main.

**El modelo generativo requiere OPENAI_API_KEY como secreto de Edge Functions**. En ausencia de ese secreto, existe un modo degradado de consulta por reglas que se identifica expresamente como limitado; no se presenta como IA generativa. La función antigua bety-asistente sigue sin modificaciones.

## Archivos
- database/ia_integral.sql: conversaciones, mensajes, operaciones con confirmación, preferencias y alertas; RLS.
- database/ia_alertas_cron.sql: detección diaria (08:05 Ciudad de México) y resúmenes informativos.
- database/ia_configuracion.sql: nombre e icono modificables por owner.
- supabase/functions/asistente-residencial-ia/index.ts: JWT, RLS, clasificación de intenciones, herramientas seguras, confirmación e historial.
- asistente-ia.js: botón flotante, conversación, tablas, confirmación, alertas, micrófono, lectura hablada.
- asistente-ia.css: interfaz responsive y adaptada a la zona segura de iOS.
- index.html: carga de assets e inicialización tras autenticación.

## Roles
| Función | Residente | Administrador | Sistema Admin |
|---|---|---|---|
| Deuda y pagos | Su propia casa | Casas autorizadas | Toda la privada |
| Eventos | Consultar | Consultar | Consultar |
| Reservaciones | Su propia casa | Consultar | Consultar y cancelar aprobadas |
| Controles/ESP32 | Consultar lo permitido | Consultar | Consultar |
| Huellas | Consultar y solicitar captura propia | Consultar solicitudes | Consultar solicitudes |
| Avisos y multas | Sus expedientes | Consultar | Consultar y eliminar expediente con confirmación |
| Ranking de adeudos, egresos y pendientes | No | Sí | Sí |
| Cancelar evento de calendario | No | No | Sí |
| Personalización del nombre/icono IA | No | No | Sí |

## Herramientas realmente implementadas
Consultas: ayuda, adeudos, ranking, pagos, finanzas, eventos, reservaciones, controles, esp32, huellas, disciplina y pendientes. Son consultas con selecciones de columnas predeterminadas, no SQL generado por el modelo.

Operaciones confirmables: **cancelar_evento**, **cancelar_reservacion**, **eliminar_reporte**, **solicitar_huella**. En el servidor se crea un identificador UUID y estado pendiente; se revisan rol, destino y caducidad antes de confirmar. La misma operación ejecutada dos veces devuelve el resultado ya registrado; sin duplicar el efecto.

La IA NO abre físicamente el portón, NO evita el bloqueo del Modo Evento, NO modifica firmware, NO registra pagos, NO asigna roles, NO crea multas ni suspende controles. Estas acciones requieren revisión posterior con flujo transaccional y confirmación. Las solicitudes de huella son prerregistros: la captura real R503Pro está pendiente de integrar.

## Requisitos de configuración
En Supabase Dashboard > Edge Functions > Secrets, establecer:
- OPENAI_API_KEY: clave secreta propia del proveedor de IA; nunca en GitHub Pages o JavaScript público.
- AI_MODEL: opcional; por defecto gpt-4.1-mini, configurable según modelos disponibles y presupuesto.

En Edge Functions Supabase inyecta SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY. Nunca copiar SUPABASE_SERVICE_ROLE_KEY al navegador. La función está desplegada como asistente-residencial-ia con verify_jwt=true.

La voz usa SpeechRecognition/webkitSpeechRecognition si el navegador lo ofrece y autoriza, y SpeechSynthesis para lectura opcional. La disponibilidad y el procesamiento de voz dependen del navegador y sistema operativo.

## Despliegue controlado
1. Revisar el PR y verificar los recursos nuevos de Supabase.
2. Establecer OPENAI_API_KEY únicamente en secretos de Supabase. Revisar costo/tokens. Límite inicial: 30 consultas por usuario/hora, 900 caracteres por consulta y tope de salida para el planificador.
3. Probar autenticación y funcionalidad con **tres cuentas de prueba** reales: owner, admin, residente. No probar aperturas ni registros de pagos reales.
4. Verificar aislamiento entre casas, confirmaciones y reintentos de la misma operación.
5. Fusionar el PR a main solo después de pruebas de UI en Windows, Android e iPhone. GitHub Pages publicará el frontend según la configuración del repositorio.
6. Validar la página publicada. La rama por sí sola no actualiza GitHub Pages.

## Automatizaciones
Un trabajo Supabase Cron llamado asistente_residencial_alertas_diarias ejecuta la función SQL una vez al día, a las 14:05 UTC (08:05 Ciudad de México). Crea alertas en ia_alertas por usuario, sin mandar comandos físicos ni modificar dinero, cuotas o multas. Detecta vencimientos pendientes (por cuota), solicitudes pendientes, eventos próximos, pérdida de comunicación del ESP32 y resumen financiero del mes anterior el día 1. Las alertas se ven desde la ventana IA. La generación mensual es informativa y no envía correos automáticamente.

## Pruebas realizadas
- SQL de ia_integral.sql y ia_alertas_cron.sql validado con BEGIN/ROLLBACK antes de aplicar: correcto.
- Migraciones aplicadas con éxito y revisados objetos/tablas existentes.
- Edge Function nueva desplegada y reportada ACTIVE, verify_jwt=true.
- Código JavaScript de frontend y de Edge analizado con parser de JavaScript: sintaxis válida.
- Trabajo cron encontrado como active y función de alertas ejecutada dentro de transacción con ROLLBACK.
- Sin pruebas autenticadas end-to-end por falta de JWT de cuenta de prueba y verificación de proveedor OpenAI en producción.
- No se cambiaron firmware ni funciones anteriores.

## Seguridad pendiente (hallazgo previo)
El asesor de Supabase identifica 7 tablas de access_private con RLS deshabilitado: event_mode, visitor_code_attempts, visitor_vault_key, visitor_code_vault, visitor_code_views, owner_action_log y owner_finance_deletion_log. No se cambian automáticamente porque podrían afectar RPC existentes. Deben revisarse privilegios, schema exposure y policies antes de habilitar RLS; consulta los asesores de Supabase.

## Límites pendientes
No afirmar que la IA generativa está lista hasta configurar una clave de proveedor y completar pruebas autorizadas con sesión de prueba. El historial conversacional es privado y limitado a cada usuario; no se ajustan pesos del modelo, ni se entrena con datos residenciales. El "aprendizaje" consiste en contexto/historial y preferencias. Las tablas de memoria futura admiten ampliación, pero la experiencia de guardar preferencias adicionales aún no está incluida. La conciliación de cuotas y pagos se presenta como cálculo por cuota, nunca como saldo bancario definitivo. La página pública no cambia hasta fusionar.
