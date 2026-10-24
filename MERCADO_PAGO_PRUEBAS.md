# Mercado Pago · laboratorio de pagos (sin dinero real)

**Estado:** fase 1. Simulador interno de Administración Residencial: Mercado Pago **todavía NO está conectado** ni recibe transacciones. No se han configurado credenciales y no existe checkout con tarjeta real. Solo la cuenta `owner` puede usar este laboratorio.

## Lo que ya funciona
- Consulta de cuotas existentes con saldo pendiente en el panel Pagos (Owner).
- Intentos de prueba con método Tarjeta o SPEI y monto calculado desde el saldo real.
- Estados de prueba: pendiente, aprobado o rechazado, guardados en `public.mp_sandbox_attempts`.
- Idempotencia por `request_id`: repetir la misma solicitud o confirmar dos veces devuelve el movimiento previo.
- **Nunca** escribe en `public.pagos`, `public.cuotas` ni `public.casas`; tampoco contacta al proveedor.
- Historial Owner. Roles admin/residente/anon no pueden ejecutar estas RPC.

## Antes de hacer pruebas reales con Mercado Pago (sin dinero real)
1. El titular habilitado de la cuenta debe crear/seleccionar una aplicación de Checkout Pro en [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/es).
2. Seleccionar el entorno **Prueba** y obtener allí el Access Token de prueba; no compartirlo por chat ni subirlo a GitHub. Guardarlo en **Supabase > Edge Functions > Secrets**, administrado por el titular autorizado.
3. Registrar cuentas de prueba de vendedor/comprador y seguir el flujo oficial, sin tarjetas, saldo ni credenciales reales.
4. Implementar Edge Function autenticada para crear preferencias de Checkout Pro usando *exclusivamente* las credenciales de prueba. Crear referencias que identifiquen cada casa y cuota sin confiar en el precio enviado desde el navegador.
5. Implementar webhook con validación HMAC de `x-signature`, consulta del pago por API al proveedor y conciliación idempotente en la base aislada.
6. Probar aprobados, pendientes, rechazados, reintentos, importes incorrectos, órdenes de otra casa y webhook duplicado.
7. **No habilitar producción ni sincronizar con `pagos` reales** hasta obtener autorización del propietario, probar conciliación, cargos y comisiones, y establecer proceso de devoluciones.

Referencia: https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases

## Seguridad
- `mp_sandbox_start`, `mp_sandbox_simulate` y `mp_sandbox_history` comprueban `auth.uid()`, Owner activo y aprobado, desde Supabase.
- La tabla de laboratorio tiene RLS y sin permisos de acceso directo para `anon` / `authenticated`.
- Las simulaciones no habilitan cobros ni aceptan transferencias.
- No deben añadirse Access Tokens, secretos de webhook ni números de tarjeta al HTML o repositorio público.
