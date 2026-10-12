# ESP32: control digital de Administración Residencial

## Estado

Integración preparada para pruebas de banco. Los contactos de tornillo deben permanecer desconectados del portón y de la cerradura. La versión local anterior por WiFi es una prueba independiente: no aplica permisos de la plataforma. Este nuevo programa la reemplaza y no expone un servidor local de apertura.

## Vincular desde la computadora

1. Iniciar sesión como administrador y abrir **Control digital**.
2. Pulsar **Vincular ESP32**. El navegador descarga `ESP32_Residencial.ino`, con una credencial exclusiva. No compartir ni subir ese archivo personalizado a GitHub.
3. Abrirlo en Arduino IDE. Sustituir `CAMBIA_NOMBRE_WIFI` y `CAMBIA_CONTRASENA_WIFI`. Si contienen comillas o barras inversas, escaparlas como literales C++.
4. Usar **ESP32 Dev Module**, paquete **esp32 by Espressif Systems 3.3.12**, puerto del equipo. No requiere bibliotecas adicionales: usa cJSON, Preferences, HTTPClient y certificados incluidos en ese paquete.
5. Subir y abrir Monitor serie a **115200**. El ESP32 necesita WiFi de 2.4 GHz, internet, DNS y sincronización NTP. Debe mostrar `ESP32 vinculado. Listo para pruebas desde la plataforma.`
6. Volver a Control digital; el estado se actualiza cada cinco segundos. Probar Peatonal y Portón. Cada salida produce un pulso de un segundo y permanece apagada al iniciar `setup()`.
7. Después de comprobar las pruebas, el administrador puede **Habilitar para residentes**. Por defecto solo puede probar la administración. **Pausar control digital** impide nuevas entregas de órdenes. Un pulso ya iniciado finaliza al cumplirse el segundo.

Volver a vincular cambia la credencial, invalida el programa anterior, cancela órdenes pendientes y vuelve al modo de pruebas de administración. Si se pierde la descarga, volver a vincular y cargar el nuevo programa. La clave se guarda en el servidor solo como SHA-256, y en el archivo/dispositivo como secreto de ese equipo.

## Cableado probado en esta sesión

| ESP32 | Módulo de dos relevadores |
|---|---|
| VIN, alimentado por USB | RY-VCC (aproximadamente 4.90 V) |
| GND | GND |
| 3V3 | VCC (aproximadamente 3.32 V) |
| D25 | IN1, peatonal |
| D26 | IN2, portón |

**Puente RY-VCC–VCC retirado.** No unir las alimentaciones de 5 V y 3.3 V. Desconectar USB antes de mover cables. El módulo observado activa con nivel LOW. El temporizador apaga las dos salidas independientemente de las peticiones HTTP. El software no garantiza ausencia de transitorios antes de `setup()`: para instalación real se debe validar el estado de reposo durante encendido, reset y fallas de alimentación, y la compatibilidad con las entradas del controlador del portón. No conectar motores ni red eléctrica a este prototipo.

## Regla de atraso

- Fecha calculada en `America/Mexico_City`.
- Se bloquean ambos botones para residentes cuando **alguna cuota de su casa conserva más de $0.009 de saldo y lleva 10 días o más vencida**.
- Ejemplo: vencimiento el 1, bloqueo desde el 11. Un pago parcial no elimina el bloqueo si persiste ese saldo.
- Se recalcula al consultar estado, solicitar y entregar la orden. Al liquidar todas las cuotas que causan el bloqueo, se restablece la elegibilidad; siguen siendo necesarios cuenta/casa activas, aprobación y equipo habilitado/conectado.
- Administración activa y aprobada puede probar independientemente de cuotas.
- No se modifican los controles RF ni las funciones anteriores de suspensión de controles. El receptor físico todavía necesita su integración específica.

## Entrega y confirmación

- HTTPS con validación de certificados y reloj sincronizado. No usa `setInsecure`, service-role ni contraseña de administrador en el ESP32.
- La plataforma llama funciones públicas `SECURITY INVOKER`. La lógica con privilegios se mantiene en `access_private`, con permisos de ejecución explícitos y comprobaciones de identidad. Las tablas privadas tienen RLS y ningún permiso directo para clientes; la ausencia deliberada de políticas aplica denegación por defecto.
- La clave del equipo permite únicamente recoger órdenes ya autorizadas y confirmar pulsos. No permite solicitar aperturas ni consultar datos de residentes.
- El equipo consulta cada tres segundos. Se considera desconectado si no hay señal reciente en 15 segundos.
- Las órdenes caducan a los 12 segundos. Una orden entregada no se vuelve a entregar. El arranque del firmware cancela órdenes pendientes. Se guarda el último ID en NVS antes del pulso para impedir repeticiones tras un reinicio.
- Solo se ejecutan las órdenes válidas recibidas a tiempo. Una pérdida de respuesta puede dejar una orden sin ejecutar o sin confirmar: nunca se reintenta automáticamente una apertura.
- Un acuse significa **pulso terminado**, no puerta físicamente abierta. Hace falta un sensor para conocer la posición.
- Límite de tres segundos entre solicitudes globales y cinco por usuario. No se acumulan órdenes pendientes.

## Base de datos y validación

`database/digital_access.sql` corresponde a la migración `digital_access_esp32_ten_day_grace` aplicada al proyecto. No ejecutar encima de las mismas tablas; es la definición inicial.

`database/verify_digital_access.sql` comprueba dentro de una transacción con ROLLBACK: autorización, día 9 frente a día 10, pago parcial y completo, offline, pausa, permiso al entregar, acuse, no repetición, rotación de credencial y permisos de tablas. No deja residentes, cuotas, pagos ni órdenes de prueba persistentes.

La validación física de este nuevo programa debe realizarse al cargarlo; la prueba local anterior no equivale a probar la integración de internet.
