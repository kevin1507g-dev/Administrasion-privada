// node tests/panel_organizado.test.mjs
// Comprobaciones estáticas: el cambio visual no debe ejecutar operaciones.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../panel-organizado.css',import.meta.url),'utf8');
const modern=readFileSync(new URL('../ui-modern.css',import.meta.url),'utf8');

for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(script[1].trim())new Function(script[1]);
}
assert.match(html,/panel-organizado\.css\?v=2/);
assert.ok(html.indexOf('panel-organizado.css?v=2')>html.indexOf('solicitudes-unificadas.css?v=1'));
assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
assert.match(css,/main>section\.active\s*\{/);
assert.match(css,/#inicio\.active>\.grid/);
assert.match(css,/#solicitudes \.su-tabs/);
assert.match(css,/@media \(max-width:560px\)/);
assert.match(css,/overflow-x:auto/);
for(const moduleId of ['pagos','cuotas','deudas','gastos','residentes','casas',
  'metodosPago','eventos','avisos','mantenimiento','incidentes','entregas',
  'paqueteria','documentos','emergencia','historialCasa','accesos','esp32Panel']){
 assert.ok(html.includes('id="'+moduleId+'"'),moduleId+' debe estar disponible');
 assert.ok(css.includes('#'+moduleId),moduleId+' debe recibir estilos de organización');
}
assert.match(css,/#pagos\.active>#residentDebtSummary/);
assert.match(css,/#cuotas\.active>\.card:has\(#autoCobroMonto\)/);
assert.match(css,/#gastos\.active>\.grid:has\(#repIngresos\)/);
assert.match(css,/#metodosPago\.active>#metodosPagoLista/);
assert.match(css,/#notificacionesLista/);
assert.match(css,/@media \(max-width:720px\)/);
assert.match(css,/@media \(max-width:999px\)/);
assert.match(html,/💳 Registrar pago/);
assert.match(html,/📋 Historial de pagos/);
assert.match(html,/📋 Cuotas registradas/);
assert.match(html,/📋 Deudas por casa/);
assert.match(html,/🏘️ Casas registradas/);
assert.match(css,/input\[type="checkbox"\]/);
assert.match(modern,/#ownerPanel \.ownerAnalyticsRing svg\.ownerChartSvg/);
assert.match(html,/onclick="solicitudesIr\('entradas'\)">🛵 Responder a repartidores/);
assert.match(html,/onclick="solicitudesIr\('huellas'\)">🖐️ Solicitar registro de mis huellas/);
assert.doesNotMatch(css,/digital_access_request|sb\.rpc|service_role/);
console.log('PASS: todos los módulos organizados; formularios, tablas y permisos conservados.');
