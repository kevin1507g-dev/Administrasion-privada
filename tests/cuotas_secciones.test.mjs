// node tests/cuotas_secciones.test.mjs
// Comprobaciones estáticas: las pestañas no ejecutan operaciones de cobro.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../cuotas-secciones.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../cuotas-secciones.css',import.meta.url),'utf8');

new Function(script);
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(m[1].trim())new Function(m[1]);
}
assert.match(html,/cuotas-secciones\.css\?v=1/);
assert.match(html,/cuotas-secciones\.js\?v=1/);
assert.match(html,/window\.cuotasSeccionesAbrir\?\.\(\)/);
assert.match(html,/window\.cuotasSeccionesActualizar\?\.\(\)/);
assert.ok(html.indexOf('cuotas-secciones.css?v=1')>html.indexOf('panel-organizado.css?v=2'));
assert.match(script,/role","tablist"/);
assert.match(script,/role","tab"/);
assert.match(script,/role","tabpanel"/);
assert.match(script,/aria-selected/);
assert.match(script,/ArrowRight/);
assert.match(script,/ArrowLeft/);
for(const [id,anchor] of Object.entries({
 misCuotas:'residentPaidUntil',historial:'cuotasRows',automatico:'autoCobroMonto',
 adelantos:'paidUntilCasa',crear:'crearCuotaBtn',duplicados:'duplicatedDuesWarning'
})){
 assert.ok(script.includes('id:"'+id+'"'),id+' no tiene pestaña');
 assert.ok(script.includes('anchor:"'+anchor+'"'),anchor+' no se reutiliza');
 assert.ok(html.includes('id="'+anchor+'"'),anchor+' debe seguir en el HTML');
}
assert.match(script,/panelForAnchor/);
assert.match(script,/appendChild\(card\)/);
assert.match(script,/roles:\["residente"\]/);
assert.match(script,/roles:\["residente","admin","owner"\]/);
assert.match(script,/roles:\["admin","owner"\]/);
assert.doesNotMatch(script,/sb\.rpc|sb\.from|digital_access_request|service_role/);
assert.match(style,/#cuotas \.cu-panel\[hidden\]/);
assert.match(style,/@media\(max-width:560px\)/);
assert.equal((style.match(/\{/g)||[]).length,(style.match(/\}/g)||[]).length);
console.log('PASS: Cuotas con pestañas por rol y acciones originales intactas.');
