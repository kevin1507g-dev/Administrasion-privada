# Repartidores y visitas con ESP32

## Preparación
La pantalla OLED sigue en diagnóstico. Para esta prueba, restaurar el archivo personalizado ESP32_Residencial.ino que ya funcionó. No volver a vincular el equipo: esa acción cambia su credencial.
No se necesita firmware nuevo para este flujo.

## Prueba de mesa
1. Con USB desconectado, retirar solamente los cables de la OLED si se desea. Mantener el puente RY-VCC/VCC retirado en el módulo de relevadores.
2. Cargar el programa personalizado guardado, con WiFi y token existentes.
3. Entrar como administrador a Control digital y verificar equipo conectado. Probar los pulsos peatonal y portón.
4. Habilitar acceso para residentes desde ese panel cuando se vaya a probar.
5. Usar una cuenta de residente activa/aprobada, con casa activa y sin cuotas pendientes con 10 días o más de atraso.
6. Desde el portal repartidor.html o su QR crear una solicitud para esa casa.
7. Como residente abrir Repartidores y visitas y pulsar Dar acceso peatonal. Debe activarse IN1/D25 durante un segundo y luego apagarse.
8. Crear otra solicitud y probar Dar acceso al portón: IN2/D26 durante un segundo.
9. Verificar el aviso de confirmación del pulso. No demuestra que una puerta real se haya movido: no hay sensor de posición.
10. Si se desea volver a pruebas solo administrativas, deshabilitar acceso para residentes.

Habilitar residentes afecta también los botones de Control digital de los residentes elegibles, no solo las visitas.
No conectar todavía los contactos del módulo al motor o a la cerradura para esta prueba.

## Comportamiento
- La autorización y la orden se registran en una sola transacción.
- Solo el residente activo/aprobado de la casa destinataria puede solicitar esta apertura.
- Se reutilizan habilitación de residentes, estado del equipo, bloqueo por 10 días de adeudo y límites de frecuencia existentes.
- Cada solicitud de visita/entrega admite una sola orden. Repetir la misma llamada devuelve la orden original, sin crear otro pulso.
- Una orden vence en un máximo de 12 segundos, o antes si vence la solicitud.
- La página distingue pulso confirmado, vencido, cancelado y sin confirmación.
- Voy por el pedido/Voy a recibirte y No lo espero solo envían respuesta: no accionan relevadores.
- El visitante ve autorización y solicitud de apertura, nunca una afirmación de apertura física confirmada.
- La opción para residentes no se activa automáticamente con esta actualización.

## Verificación
database/verify_delivery_access.sql ejecuta pruebas transaccionales con rollback. No deja órdenes reales ni modifica datos de residentes al terminar.
Probados permisos por casa, solicitud vencida, equipo desconectado, modo administrativo, adeudo, respuesta atómica, deduplicación, ambos destinos y confirmación.
La verificación física de este flujo con el residente queda pendiente.
