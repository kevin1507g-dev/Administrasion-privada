// node tests/solicitudes_unificadas.test.mjs
// Prueba estática: no genera órdenes ni autorizaciones al ESP32.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const hub=readFileSync(new URL('../solicitudes-unificadas.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../solicitudes-unificadas.css',import.meta.url),'utf8');
const bio=readFileSync(new URL('../biometrico.js',import.meta.url),'utf8');
new Function(hub);
new Function(bio);
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(m[1].trim())new Function(m[1]);
}
assert.match(html,/<section id="solicitudes" class="residentAdminOnly">/);
assert.match(html,/solicitudes-unificadas\.js\?v=3/);
assert.match(html,/solicitudes-unificadas\.css\?v=1/);
assert.match(html,/window\.solicitudesUnificadasAbrir\?\.\(\)/);
assert.match(hub,/roles\[id\]\.includes\(rol\)/);
assert.match(hub,/ownerPanelMode!=="owner"/);
assert.match(hub,/rolesCard\.classList\.toggle\("hidden"/);
for(const id of ['registros','cuotas','reservaciones','permanentes','huellas','entradas','comunicacion','empresas']){
 assert.ok(hub.includes(id+':['),id+' debe ser una categoría');
}
assert.ok(html.includes('id="solicitudesRows"'),'el listado original de registros debe permanecer en la sección');
assert.ok(html.includes('id="solicitudesBajaCuotasRows"'));
assert.match(hub,/move\("cuotas",document\.getElementById\("solicitudesBajaCuotasCard"\)\)/);
for(const id of ['reservasRows','vpPermanentAdminList','vpPermanentList',
 'bioAdminSolicitudes','bioMisSolicitudes','entregasPendientes','contactoSolicitudesEntrantes',
 'contactoChatPanel','ownerChatEspecialListaCard','ownerEmpresasReparto','ownerRolesRows']){
 assert.ok(hub.includes(id),id+' debe trasladarse sin duplicarse');
}
assert.match(html,/const puedeAutorizar=profile\?\.rol==='owner'&&ownerPanelMode==='owner'/);
assert.match(html,/aprobarRegistro\(/);
assert.match(html,/setReservaEstado\(/);
assert.match(html,/responderEntrega\(/);
assert.match(html,/revisarCodigoPermanente\(/);
assert.match(html,/responderSolicitudContacto\(/);
assert.match(hub,/ninguna solicitud abre el portón por sí sola/);
assert.doesNotMatch(hub,/digital_access_request|portero_owner_autorizar|service_role/);
assert.match(css,/\.su-panel\[hidden\]/);
console.log('PASS: solicitudes unificadas, roles originales y sin privilegios nuevos.');
