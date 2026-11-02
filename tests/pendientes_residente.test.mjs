// node tests/pendientes_residente.test.mjs
// Verifica el recordatorio sin tocar la base de datos ni enviar mensajes.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const code=readFileSync(new URL("../pendientes-residente.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../pendientes-residente.css",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const ia=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
new Function(code);new Function(ia);
for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(script);
assert.match(html,/pendientes-residente\.js\?v=1/);
assert.match(html,/pendientes-residente\.css\?v=1/);
assert.match(html,/window\.residentePendientesIniciar\?\.\(\)/);
assert.match(html,/window\.residentePendientesActualizar\?\.\(\)/);
assert.match(ia,/iaAbrirChatPendiente/);
assert.match(css,/pointer-events:none/);
assert.doesNotMatch(code,/\.from\(|\.rpc\(/);

const a=code.indexOf("function obtenerPendientesResidente("),b=code.indexOf("\nfunction isResident()",a);
assert(a>=0&&b>a);
const compute=new Function(code.slice(a,b)+";return obtenerPendientesResidente;")();
const base={
 uid:"resident-1",rol:"residente",
 conversaciones:[
  {id:"admin-chat",residente_id:"resident-1",destinatario_rol:"admin"},
  {id:"owner-chat",residente_id:"resident-1",destinatario_rol:"owner"},
  {id:"history",residente_id:"resident-1",destinatario_rol:"general"},
  {id:"other-house",residente_id:"resident-2",destinatario_rol:"admin"}],
 mensajes:[
  {id:"a1",conversacion_id:"admin-chat",autor_id:"admin-1",created_at:"2026-11-02T11:00:00Z"},
  {id:"a2",conversacion_id:"admin-chat",autor_id:"resident-1",created_at:"2026-11-02T11:10:00Z"},
  {id:"o1",conversacion_id:"owner-chat",autor_id:"owner-1",mensaje:"Por favor contesta",created_at:"2026-11-02T11:12:00Z"},
  {id:"h1",conversacion_id:"history",autor_id:"admin-1",created_at:"2026-11-01T11:00:00Z"},
  {id:"x1",conversacion_id:"other-house",autor_id:"admin-1",created_at:"2026-11-01T11:00:00Z"}],
 notificaciones:[
  {id:"notice-1",user_id:"resident-1"},
  {id:"notice-general",user_id:null},
  {id:"notice-other",user_id:"resident-2"}],
 lecturas:[{notificacion_id:"notice-general"}]
};
const first=compute(base);
assert.deepEqual(first.chats.map(x=>x.id),["owner-chat"],"Only unanswered conversations, not general history");
assert.deepEqual(first.avisos.map(x=>x.id),["notice-1"],"Only unread notices intended for this account");
assert.equal(first.chats[0].de,"Sistema Admin");
assert.deepEqual(compute({...base,rol:"owner"}).chats,[],"Owner does not receive resident reminder");
assert.equal(compute({...base,mensajes:[
 ...base.mensajes,{id:"o2",conversacion_id:"owner-chat",autor_id:"resident-1",created_at:"2026-11-02T11:20:00Z"}
]}).chats.length,0,"Reply clears pending chat");
assert.equal(compute({...base,lecturas:[...base.lecturas,{notificacion_id:"notice-1"}]}).avisos.length,0,"Viewing notice clears unread");
assert.equal(compute({...base,uid:"resident-2"}).chats.length,1,
 "Other resident sees only their conversation");
console.log("PASS: automatic reminder data, unanswered chats, read notifications, account isolation, assets and scripts.");
