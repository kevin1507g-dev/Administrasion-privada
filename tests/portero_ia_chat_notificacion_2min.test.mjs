// node tests/portero_ia_chat_notificacion_2min.test.mjs
// Prueba estática sin crear visitas, sin red y sin emitir órdenes al ESP32.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../database/portero_chat_automatico_2min_20261105.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/delivery-owner-chat/index.ts",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const ia=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
const portal=readFileSync(new URL("../repartidor.html",import.meta.url),"utf8");

assert.match(sql,/CREATE OR REPLACE FUNCTION access_private\.portero_chat_escalar\(/);
assert.match(sql,/INSERT INTO public\.portero_owner_chats/);
assert.match(sql,/d\.created_at<=now\(\)-interval '2 minutes'/);
assert.match(sql,/v\.estado<>'esperando'/);
assert.match(sql,/encode\(extensions\.digest\(v\.public_token::text,'sha256'\),'hex'\)/);
assert.match(sql,/portero_chat_owner/);
assert.match(sql,/portero_owner_chat'/);
assert.match(sql,/REVOKE ALL ON FUNCTION access_private\.portero_chat_escalar/);
assert.doesNotMatch(sql,/INSERT INTO access_private\.commands|UPDATE access_private\.device/);

assert.match(edge,/const token=escalacion\?solicitudToken:secretToken\(\)/);
assert.match(edge,/!uuid\(token\)/);
assert.match(edge,/eq\("entrega_id",entregaId\)/);
assert.match(edge,/\.select\("id,entrega_id,casa_numero/);
assert.match(edge,/admin\.auth\.getUser\(token\)/);

assert.match(html,/seccion==='portero_owner_chat'\|\|tipo==='portero_chat_owner'\|\|tipo==='portero_ia_intervencion'/);
assert.match(html,/await window\.iaAbrirChatEspecial\(id\)/);
assert.match(html,/c\.entrega_id===entregaId/);
assert.match(ia,/m\.autor==="sistema"\?"Portero IA"/);
assert.match(ia,/profile\?\.rol==="owner"/);
assert.match(portal,/solicitud_token:token/);
new Function(ia);
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new Function(match[1]);
console.log("PASS: cron crea chat, notificación abre IA, propietario exclusivo y sin órdenes al portón.");
