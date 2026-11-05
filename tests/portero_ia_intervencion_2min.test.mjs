// Verificación estática: no envía solicitudes ni comandos físicos.
// Ejecutar con Node: node tests/portero_ia_intervencion_2min.test.mjs
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const portal=readFileSync(new URL("../repartidor.html",import.meta.url),"utf8");
const contact=readFileSync(new URL("../supabase/functions/delivery-contact/index.ts",import.meta.url),"utf8");
const status=readFileSync(new URL("../supabase/functions/delivery-status/index.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../database/portero_ia_intervencion_2_minutos_20261105.sql",import.meta.url),"utf8");

const js=[...portal.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)]
 .map(m=>m[1]).find(x=>x.includes("pedirConfirmacionPortero"));
assert(js,"Falta la lógica del Portero IA");
new vm.Script(js);
assert.match(js,/await enviarSolicitud\(\{porteroMixto:true\}\)/);
assert.match(js,/portero_mixto:opciones\?\.porteroMixto===true/);
assert.match(js,/data\.portero_intervino_at/);
assert.match(js,/Sin acreditación verificable/);
assert.match(contact,/portero_modo_mixto: porteroMixto/);
assert.match(contact,/\+ 120000/);
assert.match(status,/portero_intervino_at,portero_resultado/);
assert.match(sql,/d\.created_at <= now\(\) - interval '2 minutes'/);
assert.match(sql,/d\.estado = 'esperando'/);
assert.match(sql,/d\.expires_at > now\(\)/);
assert.match(sql,/d\.portero_intervino_at IS NULL/);
assert.match(sql,/FOR UPDATE SKIP LOCKED/);
assert.match(sql,/access_private\.notify_owners/);
assert.match(sql,/SELECT access_private\.portero_intervenir_pendientes\(\);/);
assert.doesNotMatch(sql,/INSERT INTO access_private\.commands|UPDATE access_private\.device|digital_access_request|visitor_pass_request/i);
assert.doesNotMatch(contact,/INSERT INTO access_private\.commands|UPDATE access_private\.device/i);
assert.doesNotMatch(status,/INSERT INTO access_private\.commands|UPDATE access_private\.device/i);
console.log("PASS: revisión a los 2 minutos, avisos y ninguna apertura por empresa autodeclarada.");
