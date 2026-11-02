// node tests/chat_autoabrir_sin_respuesta.test.mjs
// No crea mensajes ni llama a Supabase ni al portón.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const ia=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
const source=readFileSync(new URL("../pendientes-residente.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../chat-destinos.css",import.meta.url),"utf8");
new Function(ia);new Function(source);
for(const [,js] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(js);
const enter=html.slice(html.indexOf("async function enter(){"),html.indexOf("async function loadAll(){"));
assert(enter.indexOf("await cargarChatDatos()")<enter.indexOf("residentePendientesAbrirChatInicial"));
assert(enter.indexOf("residentePendientesAbrirChatInicial")<enter.indexOf("show('controlDigital')"));
assert.match(html,/id="chatRespuestaPendiente"/);
assert.match(html,/chat-destinos\.css\?v=2/);
assert.match(html,/asistente-ia\.js\?v=6/);
assert.match(html,/pendientes-residente\.js\?v=2/);
assert.match(css,/#chatRespuestaPendienteTexto/);
const start=source.indexOf("function obtenerPendientesResidente(");
const end=source.indexOf("\nfunction isResident()",start);
const compute=new Function(source.slice(start,end)+";return obtenerPendientesResidente;")();
function context(messages,uid="resident-a"){
 return {uid,rol:"residente",conversaciones:[
   {id:"c1",residente_id:"resident-a",destinatario_rol:"admin"},
   {id:"c2",residente_id:"resident-a",destinatario_rol:"owner"},
   {id:"other",residente_id:"resident-b",destinatario_rol:"admin"},
   {id:"legacy",residente_id:"resident-a",destinatario_rol:"general"}],
   mensajes:messages,notificaciones:[],lecturas:[]};
}
const staffMsg={id:"m1",conversacion_id:"c1",autor_id:"admin",mensaje:"Contesta esta solicitud",
 created_at:"2026-11-02T11:00:00Z"};
const reply={id:"m2",conversacion_id:"c1",autor_id:"resident-a",mensaje:"Recibido",
 created_at:"2026-11-02T11:01:00Z"};
assert.deepEqual(compute(context([staffMsg])).chats.map(x=>x.id),["c1"]);
assert.equal(compute(context([staffMsg,reply])).chats.length,0,"Reply clears pending chat");
assert.equal(compute(context([{...staffMsg,conversacion_id:"legacy"}])).chats.length,0);
assert.equal(compute(context([{...staffMsg,conversacion_id:"other"}])).chats.length,0);
class E{
 constructor(){this.children=[];this.hidden=false;this.textContent="";this.attributes={};this.className="";}
 appendChild(x){this.children.push(x);return x}
 replaceChildren(){this.children=[]}
 setAttribute(k,v){this.attributes[k]=v}
 addEventListener(k,f){this["on"+k]=f}
}
function session(messages){
 let inChat=false;const calls=[],shows=[],timers=[];
 const document={hidden:false,body:new E(),createElement:()=>new E(),
  addEventListener(){},getElementById:k=>k==="app"?{classList:{contains:()=>false}}:null};
 document.body.classList={contains:k=>k==="ia-open"&&inChat};
 const window={setTimeout:cb=>(timers.push(cb),timers.length),addEventListener(){},
   iaAbrirChatPendiente:async id=>{calls.push(id);inChat=true;return true;}};
 new Function("window","document","user","profile","chatConversaciones","chatMensajes",
   "notificaciones","notificacionLecturas","show",source)(
   window,document,{id:"resident-a"},{rol:"residente"},context(messages).conversaciones,
   messages,[],[],id=>shows.push(id));
 return {window,calls,shows,leave(){inChat=false},flush(){while(timers.length)timers.shift()();}};
}
const messages=[staffMsg];
const first=session(messages);
first.window.residentePendientesIniciar();first.flush();
assert.equal(await first.window.residentePendientesAbrirChatInicial(),true);
assert.deepEqual(first.calls,["c1"],"Show correct conversation on login");
first.leave();
first.window.residentePendientesAlCerrarChatInicial();
assert.deepEqual(first.shows,["controlDigital"],"Show digital control on closing the chat");
first.window.residentePendientesActualizar();first.flush();
assert.deepEqual(first.calls,["c1"],"No reopening loop on same session after closing");
const relogin=session([{...staffMsg}]);
relogin.window.residentePendientesIniciar();relogin.flush();
assert.equal(await relogin.window.residentePendientesAbrirChatInicial(),true);
assert.deepEqual(relogin.calls,["c1"],"Reopen after new login if unanswered");
const answered=session([staffMsg,reply]);
answered.window.residentePendientesIniciar();answered.flush();
assert.equal(await answered.window.residentePendientesAbrirChatInicial(),false);
assert.equal(answered.calls.length,0,"Never auto-open after reply");
const newer={...staffMsg,id:"m3",created_at:"2026-11-02T12:00:00Z",mensaje:"Segundo mensaje"};
messages.push(newer);
first.window.residentePendientesActualizar();first.flush();
assert.equal(first.calls.length,2,"New message reopens once in existing session");
assert.deepEqual(first.calls,["c1","c1"]);
// Opening a pending chat must not require an AI provider call.
const openCode=ia.slice(ia.indexOf("async function open("),ia.indexOf("function startListening()"));
const callsAI=[];
const refs={panel:{hidden:true},launch:{setAttribute(){},focus(){}}};
const body={classList:{toggle(){}}};
const code="let opened=false;\n"+openCode+"\nreturn open;";
const fastOpen=new Function("refs","document","switchTab","viewport","call","loadHistory",
 "status","restoreChat","chatSelected",code)(
 refs,{body},async(kind,id)=>{callsAI.push({kind,id});return true;},
 ()=>{},async()=>{throw Error("AI network should not be needed");},
 async()=>{throw Error("AI history should not be needed");},
 ()=>{},()=>{},false);
assert.equal(await fastOpen("chat","c1"),true);
assert.deepEqual(callsAI,[{kind:"chat",id:"c1"}]);
console.log("PASS: prioritized chat, correct conversation, reopens next login, clears after reply, no AI provider.");
