// node tests/actualizar_cuadros.test.mjs
// Autoactualización cada 5 s: únicamente lecturas y apartado visible.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html=read("index.html"), js=read("actualizar-cuadros.js");
const css=read("actualizar-cuadros.css");
const cuotas=read("cuotas-secciones.js"), solicitudes=read("solicitudes-unificadas.js");
new Function(js);
new Function(cuotas);
new Function(solicitudes);
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(script[1].trim())new Function(script[1]);
}
const sections=[...html.matchAll(/<section\s+id="([^"]+)"/g)].map(x=>x[1]);
assert.equal(sections.length,32,"todos los apartados existentes siguen visibles en el HTML");
assert.match(html,/actualizar-cuadros\.js\?v=3/);
assert.match(html,/actualizar-cuadros\.css\?v=2/);
assert.ok(html.indexOf("actualizar-cuadros.js?v=3")>html.indexOf("cuotas-secciones.js?v=1"));
assert.ok(html.indexOf("actualizar-cuadros.css?v=2")>html.indexOf("cuotas-secciones.css?v=1"));
assert.match(css,/\.actualizar-cuadro-barra/);
assert.match(css,/display:none!important/);
assert.doesNotMatch(js,/makeToolbar|createElement\("button"\)/);
assert.match(js,/const INTERVALO=5000/);
assert.match(js,/setInterval\(\(\)=>\{void tick\(\);\},INTERVALO\)/);
assert.match(js,/document\.hidden/);
assert.match(js,/navigator\.onLine===false/);
assert.match(js,/if\(busy\|\|!id\|\|!user\|\|!profile/);
assert.match(js,/if\(userIsEditing\(section\)\)return/);
assert.match(js,/collectDrafts/);
assert.match(js,/restoreDrafts/);
assert.match(js,/Promise\.allSettled/);
assert.match(js,/if\(changed&&typeof render==="function"\)/);
assert.match(js,/models\[keys\[i\]\]\.save\(data\)/);
assert.match(js,/currentSection\(\)!==section/);
assert.match(js,/requestedSources\(id\)/);
assert.match(js,/cargarSolicitudesBajaCuotas/);
assert.match(js,/#cuotas \.cu-panel:not\(\[hidden\]\)/);
assert.match(js,/#solicitudes \.su-panel:not\(\[hidden\]\)/);
for(const id of sections){
 assert.ok(js.includes(id+":")||js.includes('case "'+id+'"'),
  "Falta actualizar el apartado "+id);
}
assert.doesNotMatch(html,/setInterval\(actualizarVistaActiva,3000\)/);
assert.doesNotMatch(js,/digital_access_request|portero_owner_autorizar|garbage_window_manage|\.insert\(|\.update\(|\.delete\(/);
assert.match(js,/Video en vivo: no reiniciar el iframe cada 5 segundos/);
console.log("PASS: 32 apartados actualizan cada 5 s sin botones, con lectura selectiva.");
