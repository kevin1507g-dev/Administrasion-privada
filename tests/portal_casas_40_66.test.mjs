// node tests/portal_casas_40_66.test.mjs
// Verificación estática sin crear entregas, visitas ni órdenes de portón.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../repartidor.html",import.meta.url),"utf8");
const backend=readFileSync(new URL("../supabase/functions/delivery-contact/index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../database/portal_repartidores_rango_casas_40_66.sql",import.meta.url),"utf8");
const houseRange=/^(4[0-9]|5[0-9]|6[0-6])$/;
for(const house of ["39","67","0","99","040",""]){
 assert.equal(houseRange.test(house),false,house+" must be rejected");
}
for(const house of ["40","41","50","65","66"]){
 assert.equal(houseRange.test(house),true,house+" must be accepted");
}
assert.match(html,/<input id="casa"[^>]*pattern="\((?:4\[0-9\])\|5\[0-9\]\|6\[0-6\]\)"/);
assert.match(html,/<input id="vpCasa"[^>]*pattern="\((?:4\[0-9\])\|5\[0-9\]\|6\[0-6\]\)"/);
assert.match(backend,/if \(!\/\^\(4\[0-9\]\|5\[0-9\]\|6\[0-6\]\)\$\/.test\(casaIngresada\)\)/);
assert.match(migration,/BETWEEN 40 AND 66/);
assert.match(migration,/visitor_pass_request/);
assert.match(migration,/Solo se aceptan solicitudes para las casas de la 40 a la 66/);
assert.doesNotMatch(backend,/casa_id:\s*casa\?\.id\s*\|\|\s*null/);
for(const [,code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(code);
console.log("PASS: límites de casas 40 y 66, ambas entradas del portal y backend.");
