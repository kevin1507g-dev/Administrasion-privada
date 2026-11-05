// Regresión sin conectarse al ESP32 o a Supabase.
// Ejecutar con Node: node tests/portero_escalacion_chat_owner.test.mjs
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const portal=readFileSync(new URL("../repartidor.html",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/delivery-owner-chat/index.ts",import.meta.url),"utf8");
const js=[...portal.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes("procesarPortero"));
assert(js);
new Function(js);
assert.match(portal,/id="ownerChatRetryBtn"/);
assert.match(js,/async function conectarChatSistemaAdmin/);
assert.match(js,/solicitud_token:token/);
assert.match(js,/await conectarChatSistemaAdmin\(\)/);
assert.match(js,/Date\.now\(\)>=new Date\(porteroIntervencionAt\)\.getTime\(\)/);
assert.match(js,/abrirChatPortero\(data\.chat_token,data\.expires_at\)/);
assert.match(edge,/if\(autorizada&&!escalacion\)return reply/);
assert.match(edge,/const escalacion=autorizada&&solicitudToken\.length>0/);
assert.match(edge,/delivery\.estado==="esperando"/);
assert.match(edge,/delivery\.portero_modo_mixto===true/);
assert.match(edge,/delivery\.created_at\)\.getTime\(\)\+120000/);
assert.match(edge,/delivery\.casa_id===house\.id/);
assert.match(edge,/admin\.auth\.getUser\(token\)/);
assert.doesNotMatch(edge,/digital_access_request|visitor_pass_request/);
console.log("PASS: empresa no autorizada -> chat directo; autorizada -> chat después de 2min sin respuesta, sin abrir portón.");
