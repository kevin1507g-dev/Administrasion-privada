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
Ambas funciones exigen una habilitación administrativa deliberada. No existe botón de cobro real en el portal. La configuración de las credenciales de producción y las notificaciones corresponde al **titular adulto autorizado** de Mercado Pago. Nunca deben almacenarse secretos en GitHub ni compartirse por chat.

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
