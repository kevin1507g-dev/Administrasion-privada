# Mercado Pago: piloto real de $15, Casa 63

**Estado al 23 de octubre de 2026: PREPARADO, DESACTIVADO. NO COBRAR.**

La plataforma conserva su laboratorio existente, separado del flujo real.

## Preparado en Supabase
- Función **mp-real-create-checkout**, protegida con inicio de sesión Owner, que solo permite una cuota real con saldo exacto de **$15 MXN** en **Casa 63**.
- Función **mp-real-webhook**, que verifica la firma HMAC, consulta el pago a Mercado Pago y comprueba vendedor, referencia, importe, moneda y estatus antes de conciliar.
- Esquema privado `mp_private.intents` y funciones de conciliación para evitar registros duplicados mediante referencias únicas, transacciones y bloqueo de cuota.
- Solo el servidor puede registrar el pago tras consultar al proveedor. No basta con regresar a la página de éxito.
- No se han creado intentos reales ni alterado las cuotas o los pagos existentes.

## Por qué NO está activo
Ambas funciones exigen una habilitación administrativa deliberada. El portal Owner ahora incluye el botón **Preparar pago real de $15**, pero aparece bloqueado hasta que el diagnóstico confirme al vendedor, haya una cuota de $15 seleccionada y el titular habilite expresamente el piloto. El botón solo abre el checkout; no carga ningún dinero automáticamente. La configuración de las credenciales de producción y las notificaciones corresponde al **titular adulto autorizado** de Mercado Pago. Nunca deben almacenarse secretos en GitHub ni compartirse por chat.

## Antes de activar el piloto
1. El titular autorizado debe validar la cuenta de producción y revisar comisiones y condiciones.
2. Guardar de forma privada en Supabase las configuraciones de producción necesarias para las funciones: `MP_PROD_ACCESS_TOKEN`, `MP_PROD_SELLER_ID`, `MP_PROD_WEBHOOK_SECRET`.
3. Configurar en Mercado Pago el webhook de **producción** `https://nndlfkuelwpwklldvtfo.supabase.co/functions/v1/mp-real-webhook` para el evento **payment**, comprobando la firma secreta.
4. Probar primero el flujo firmado (notificación válida, falsificada, repetida, importe equivocado, pago rechazado, cuota ya cubierta, reembolso), con pruebas controladas.
5. Verificar el procedimiento de devoluciones y conciliación, y que el titular sepa resolver un pago recibido que quede en estado `review`.
6. Solo después de esas verificaciones y de la aprobación explícita del titular, habilitar `MP_PROD_PILOT_ENABLED` con el valor controlado previsto para el piloto, y publicar un botón restringido a Owner.
7. Realizar únicamente entonces el cobro real de prueba de $15, con consentimiento expreso del pagador. No usar el botón de laboratorio para mover dinero.

**IMPORTANTE:** No activar anticipadamente ninguna opción de producción. El hecho de que las funciones aparezcan como 'Active' en Supabase solo significa que están desplegadas, no que los cobros reales estén habilitados.

Documentación:
- [Checkout Pro](https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-pro-preferences/overview)
- [Webhooks y firma](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks)

## Estado más reciente de preparación
- El simulador de notificaciones Mercado Pago respondió **HTTP 200** y el servidor confirmó la firma en modo lectura.
- Se ejecutó una prueba reversible del registro aprobado y el rechazo de un webhook duplicado/incongruente; no quedaron cargos, pagos ni cambios en cuotas.
- Checkout Pro productivo devuelve a la página de Administración de Privada mediante `back_urls`; esa vuelta **no** es comprobante de pago.
- Los cobros reales todavía están **desactivados**. Solo el adulto titular de la cuenta debe decidir y habilitar el secreto `MP_PROD_PILOT_ENABLED`, tras revisar comisiones y condiciones; su valor previsto para el piloto es `authorized-owner-pilot-63`.
- Para preparar el enlace, tras ese paso, el Owner debe entrar a Pagos, seleccionar la cuota de $15 de la Casa 63, ejecutar **Verificar conexión (sin cobros)** y utilizar el botón del piloto. El dinero solo se mueve si el adulto completa el checkout oficial.
- Si el enlace o el checkout muestra error, antes de reintentar revisa el historial de Mercado Pago y el estado de Supabase para evitar duplicados.


## Integración de cuotas desde cuentas de residentes (fase preparada)
- La sección **Métodos de pago** incluye Mercado Pago, selección de la cuota pendiente de la propia casa, total adeudado y botón de checkout.
- `mp-resident-create-checkout` valida la sesión JWT, residente activo/aprobado y casa asignada antes de aceptar solicitudes.
- `public.mp_resident_create_intent` verifica en Postgres que la cuota pertenece a esa casa, que tiene saldo y que no existe otro checkout abierto. No confía en montos ni casas enviados por el navegador.
- Las solicitudes llevan la referencia `beteles-res-<uuid>`; el Webhook de Mercado Pago concilia esas referencias solo después de validar la firma, el pago en la API del proveedor y el identificador de vendedor.
- El registro automático conserva el monto íntegro de la cuota y lleva por separado los cargos de procesamiento verificados.
- **Estado:** `MP_RESIDENT_PAYMENTS_ENABLED` todavía no se ha establecido. El valor de habilitación, reservado al titular adulto después de revisión operativa, es `adult-owner-reviewed`. Sin esa autorización, el botón de los residentes permanece desactivado.
- No se han iniciado ni aprobado nuevos cobros de residentes durante la instalación. Las pruebas de preparación en Postgres se efectuaron dentro de transacciones con ROLLBACK.
- Antes de habilitar pagos generales, comprobar una cuota de un residente autorizado y confirmar que la conciliación, notificaciones y gastos funcionan. Registrar una política acordada de comisiones, sin recargos inesperados.
- Observación histórica: el checkout piloto de Casa 63 figura aprobado, pero el registro que hoy abona su cuota aparece como `Tarjeta` y no mantiene la referencia vinculada en `mp_private.intents`. **No** se debe recrear automáticamente ese abono: conciliar manualmente el comprobante de Mercado Pago con la edición de pagos antes de hacer ajustes en ese movimiento.
