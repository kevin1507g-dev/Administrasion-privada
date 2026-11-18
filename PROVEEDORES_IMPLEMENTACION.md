# Registro de proveedores integrado al Portero Virtual

## Estado
Preparado como cambio independiente para revisión antes de activación en producción.
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
- `database/proveedores_registro_seguro_20261118.sql`
- `supabase/functions/proveedores-registro/index.ts`
- `proveedores.html`
- `proveedores-admin.html`
- `proveedor-acceso.js`
- Enlaces añadidos a `repartidor.html` y al menú de Sistema Admin en `index.html`.

## Activación segura (requerida antes de datos personales reales)
1. Revisar el tratamiento de INE y fotografías con responsable de datos y publicar
   un **aviso de privacidad válido y completo**, con responsable, finalidades,
   base/consentimiento, derechos ARCO, contacto y plazo de conservación.
   Configurar `PROVEEDORES_AVISO_PRIVACIDAD_URL` en los secretos de la función
   con el enlace HTTPS. Mientras falte, **no se reciben fotografías**.
2. Aplicar la migración de esquema en el proyecto Supabase correcto.
3. Desplegar `proveedores-registro` con `verify_jwt=false` por necesitar registro
   público; la función exige JWT comprobado y rol **owner** para revisión/decisión.
4. Configurar un borrado programado diario de registros pendientes vencidos y
   sus objetos privados. La función intenta eliminarlos cuando se utiliza el
   servicio, pero **eso no garantiza borrado puntual sin visitas**. No activar el
   registro real hasta asegurar la tarea programada.
5. Publicar archivos de la rama en GitHub Pages.
6. Probar con imágenes ficticias y una casa de prueba; verificar los casos:
   - Registro sin aviso: falla cerrado.
   - Código inexistente, pendiente, rechazado, revocado: no obtiene datos ni acceso.
   - Código aprobado: autocompleta nombre/casa, pero NO abre el portón.
   - Solicitud: crea una entrega que expira a los 3 minutos.
   - Residente no autoriza: no se generan comandos en `access_private.commands`.
   - Residente autoriza dentro de plazo: aplica exactamente la lógica ya vigente.
   - Documento: bucket privado, sin acceso directo por anon/authenticated;
     el propietario ve enlaces temporales; se borra al aprobar/rechazar.
   - Rate limits: 3 registros por 24 h por origen y 12 consultas cada 10 minutos.

**Importante:** las imágenes son evidencia para revisión humana, NO una comprobación
biométrica ni una validación automática de la autenticidad de la INE.
