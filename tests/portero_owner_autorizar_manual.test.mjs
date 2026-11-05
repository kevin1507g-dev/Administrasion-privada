// node tests/portero_owner_autorizar_manual.test.mjs
// Regresión: no debe existir autorización individual dentro del chat de IA.
// Se conserva el chat especial, pero no puede emitir órdenes por el texto.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ia=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
const qr=readFileSync(new URL("../repartidor.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../asistente-ia.css",import.meta.url),"utf8");
const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const sql=readFileSync(new URL("../database/desactivar_autorizacion_personal_portero_20261105.sql",import.meta.url),"utf8");

new Function(ia);
for(const match of qr.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new Function(match[1]);
assert.doesNotMatch(ia,/portero_owner_autorizar|authorizeSpecialConversation|🔓 Autorizar entrada/);
assert.match(ia,/async function replySpecialConversation/);
assert.match(ia,/async function closeSpecialConversation/);
assert.match(ia,/profile\?\.rol==="owner"/);
assert.match(ia,/text:"🚚 Especiales"/);
assert.doesNotMatch(css,/Acción manual de Sistema Admin/);
assert.match(index,/asistente-ia\.js\?v=12/);
assert.match(sql,/REVOKE EXECUTE ON FUNCTION public\.portero_owner_autorizar\(uuid\) FROM authenticated/);
assert.match(qr,/action:'poll'/);
assert.match(qr,/action:'send'/);
console.log("PASS: sin autorización individual, chat especial Owner y comunicación QR conservados.");
