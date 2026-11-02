// node tests/chat_destinatarios.test.mjs
// Pruebas sin conexión ni credenciales: creación segura de canales e integración DOM.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/asistente-residencial-ia/index.ts",import.meta.url),"utf8");
assert.match(html,/id="chatDestinoRol"/);
assert.match(html,/<option value="admin">Administración<\/option>/);
assert.match(html,/<option value="owner">Sistema Admin<\/option>/);
assert.match(html,/Historial general \(anterior\)/);
assert.match(html,/asistente-ia\.js\?v=4/);
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for(const [,script] of scripts)new Function(script);
new Function(edge.replace(/^import.*\n/,""));
const start=html.indexOf("async function obtenerOCrearConversacionChat(){");
const stop=html.indexOf("\nasync function enviarChatMensaje(",start);
assert(start>=0&&stop>start);
const fnText=html.slice(start,stop);
async function tryCreate(rol,chosen,old=[],allowedResident=true){
 const inserted=[],sent=[],conversations=[...old];
 const field=rol==="residente"?"chatDestinoRol":"chatResidentSelect";
 const document={getElementById:id=>id===field?{value:chosen}:null};
 const p={rol},u={id:rol==="residente"?"user1":"user-staff"};
 const query={insert(x){inserted.push(x);return this;},select(){return this;},single(){
  return Promise.resolve({data:{id:"chatN",...inserted[0]},error:null});}};
 const sb={from(table){assert.equal(table,"chat_conversaciones");return query;}};
 const make=new Function("profile","user","chatConversaciones","sb","document",
 "isAdminProfileRole","residentesDisponiblesChat","alert",fnText+";return obtenerOCrearConversacionChat;");
 const result=await make(p,u,conversations,sb,document,x=>["admin","owner"].includes(x),
  ()=>allowedResident?[{id:"resident2"}]:[],x=>sent.push(x))();
 return {result,inserted};
}
assert.equal((await tryCreate("residente","admin")).inserted[0].destinatario_rol,"admin");
assert.equal((await tryCreate("residente","owner")).inserted[0].destinatario_rol,"owner");
const old=await tryCreate("residente","general",[{id:"chatLegacy",residente_id:"user1",destinatario_rol:"general"}]);
assert.equal(old.result,"chatLegacy");assert.equal(old.inserted.length,0);
assert.equal((await tryCreate("residente","general")).result,null);
assert.equal((await tryCreate("owner","new:resident2")).inserted[0].destinatario_rol,"owner");
assert.equal((await tryCreate("admin","new:resident2")).inserted[0].destinatario_rol,"admin");
assert.equal((await tryCreate("owner","new:resident2",[],false)).result,null);
assert.match(edge,/destinatario_rol,updated_at/);
assert.match(edge,/labelChannel/);
console.log("PASS: 7 channel tests, HTML controls, JavaScript syntax, AI channel labels.");
