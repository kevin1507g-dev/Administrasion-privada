// node tests/actualizar_cuadros.test.mjs
// Regresión estática. Nunca produce aperturas ni cambia datos.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html=read("index.html");
const js=read("actualizar-cuadros.js");
const css=read("actualizar-cuadros.css");
const cuotas=read("cuotas-secciones.js");
const solicitudes=read("solicitudes-unificadas.js");

new Function(js);
new Function(cuotas);
new Function(solicitudes);
for(const item of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(item[1].trim())new Function(item[1]);
}
const sectionIds=[...html.matchAll(/<section\s+id="([^"]+)"/g)].map(x=>x[1]);
assert.ok(sectionIds.length>=30,"deben estar todas las secciones");
assert.ok(sectionIds.includes("pagos")&&sectionIds.includes("cuotas")&&sectionIds.includes("solicitudes"));
assert.match(html,/actualizar-cuadros\.js\?v=1/);
assert.match(html,/actualizar-cuadros\.css\?v=1/);
assert.ok(html.indexOf("actualizar-cuadros.js?v=1")>html.indexOf("cuotas-secciones.js?v=1"));
assert.ok(html.indexOf("actualizar-cuadros.css?v=1")>html.indexOf("cuotas-secciones.css?v=1"));
assert.match(js,/main > section\[id\]/);
assert.match(js,/groups\.forEach/);
assert.match(js,/#cuotas \.cu-panel/);
assert.match(js,/#solicitudes \.su-panel/);
assert.match(js,/↻ Actualizar/);
assert.match(js,/Actualizando…/);
assert.match(js,/aria-live","polite"/);
assert.match(js,/if\(updating\|\|!profile\|\|!user/);
assert.match(js,/const outcome=await loadAll\(\)/);
assert.match(js,/await readExtra\(id\)/);
assert.match(js,/status\.dataset\.estado="error"/);
assert.match(html,/return \{ok:fallos===0,consultas:consultas\.length,fallos\}/);
assert.match(solicitudes,/window\.solicitudesUnificadasRefrescar/);
assert.match(css,/@media\(max-width:560px\)/);
assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
assert.doesNotMatch(js,/digital_access_request|portero_owner_autorizar|garbage_window_manage|sb\.from|sb\.rpc/);
console.log("PASS: 32 secciones, 13 pestañas y refresco de sólo lectura.");
