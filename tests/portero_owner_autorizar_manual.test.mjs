// node tests/portero_owner_autorizar_manual.test.mjs
// Verifica contrato sin ejecutar comandos de motor ni llamar a Supabase.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../database/portero_owner_aprobar_acceso_20261105.sql",import.meta.url),"utf8");
const ia=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
const qr=readFileSync(new URL("../repartidor.html",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/delivery-owner-chat/index.ts",import.meta.url),"utf8");
const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");

assert.match(sql,/v_owner\.rol<>'owner'/);
assert.match(sql,/v_chat\.owner_id IS DISTINCT FROM auth\.uid\(\)/);
assert.match(sql,/v_chat\.access_command_id IS NOT NULL/);
assert.match(sql,/v_chat\.expires_at<=v_ahora/);
assert.match(sql,/v_entrega\.estado<>'esperando'/);
assert.match(sql,/access_private\.request\('porton'\)/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.portero_owner_autorizar\(uuid\)/);
assert.doesNotMatch(sql,/UPDATE access_private\.device|UPDATE access_private\.event_mode|CREATE EXTENSION/);

assert.match(ia,/text:"🔓 Autorizar entrada"/);
assert.match(ia,/window\.confirm\(aviso\)/);
assert.match(ia,/sb\.rpc\("portero_owner_autorizar",\{p_chat_id:current\}\)/);
assert.match(ia,/if\(!ownerSession\(\)\|\|!specialCurrent\|\|specialAuthorizing\)return/);
assert.match(qr,/id="ownerDeliveryExitArea"/);
assert.match(qr,/action:'report_exit'/);
assert.match(qr,/start\+7\*60\*1000/);
assert.match(qr,/NO permanece abierto durante ese tiempo/);
assert.match(edge,/action==="report_exit"/);
assert.match(edge,/if\(!chat\.autorizado_at\)/);
assert.match(edge,/autorizado_at:chat\.autorizado_at/);
assert.match(edge,/admin\.auth\.getUser\(token\)/);

new Function(ia);
for(const match of qr.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new Function(match[1]);
for(const match of index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new Function(match[1]);
assert.match(index,/asistente-ia\.js\?v=11/);
console.log("PASS: Owner autoriza una vez con verificaciones, QR muestra 7 min, sin reten físico del portón.");
