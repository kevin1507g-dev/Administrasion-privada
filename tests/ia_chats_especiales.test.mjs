// Ejecutar: node tests/ia_chats_especiales.test.mjs
// Comprobaciones estáticas y sintácticas, sin llamadas a Supabase ni a ESP32.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const ia=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../asistente-ia.css",import.meta.url),"utf8");
const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const backend=readFileSync(new URL("../supabase/functions/delivery-owner-chat/index.ts",import.meta.url),"utf8");
new Function(ia);

assert.match(ia,/window\.iaAbrirChatEspecial=async/);
assert.match(ia,/text:"🚚 Especiales"/);
assert.match(ia,/async function specialApi\(/);
assert.match(ia,/async function showSpecialConversation\(/);
assert.match(ia,/async function replySpecialConversation\(/);
assert.match(ia,/async function closeSpecialConversation\(/);
assert.match(ia,/function ownerSession\(\)/);
assert.match(ia,/profile\?\.rol==="owner"/);
assert.match(ia,/refs\.specialTab\.hidden=!ownerSession\(\)/);
assert.match(ia,/ownerSession\(\)\)return false/);
assert.match(ia,/invoke\("delivery-owner-chat"/);
assert.doesNotMatch(ia,/digital_access_request|digital_access_delivery_request|visitor_pass_request/);

assert.match(index,/window\.iaAbrirChatEspecial\(chat\.id\)/);
assert.match(index,/portero-owner-chat-unread/);
assert.doesNotMatch(index,/id="ownerChatEspecialBoton"/);
assert.match(index,/asistente-ia\.js\?v=9/);
assert.match(index,/asistente-ia\.css\?v=6/);
assert.match(css,/\.ia-tabs\.ia-tabs-three/);
assert.match(css,/\.ia-special-host/);
assert.match(css,/\.ia-special-messages/);

assert.match(backend,/admin\.auth\.getUser\(token\)/);
assert.match(backend,/\.eq\("rol","owner"\)/);
assert.match(backend,/action==="owner_reply"/);
assert.match(backend,/action==="owner_close"/);
assert.doesNotMatch(backend,/digital_access_request|digital_access_delivery_request/);
console.log("PASS: botón IA integrado, exclusiva Owner, chats y notificaciones sin comandos al portón.");
