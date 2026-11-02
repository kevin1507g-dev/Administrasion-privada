// Ejecutar: node tests/ia_chat_integrado.test.mjs
// No toca Supabase ni utiliza credenciales reales.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const backend=readFileSync(new URL("../supabase/functions/asistente-residencial-ia/index.ts",import.meta.url),"utf8");
const client=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../asistente-ia.css",import.meta.url),"utf8");
new Function(backend.replace(/^import.*\n/,""));
new Function(client);
assert.match(css,/\.ia-chat-host \.chatPanel\.ia-embedded-chat/);
assert.match(client,/abrirChatFlotante\(\)/);
assert.match(client,/chatOriginalParent\.appendChild\(panel\)/);
assert.match(client,/switchTab\("chat"\)/);
assert.match(client,/aria-selected/);
assert.match(client,/chatOriginalParent=panel\.parentNode/);
assert.doesNotMatch(backend,/ctx\.db\.from\("chat_mensajes"\)\.insert/);
const begin=backend.indexOf("function consultaDirecta(");
const end=backend.indexOf("async function propose(",begin);
assert(begin>=0&&end>begin);
const {consultaDirecta,runQuery}=new Function(
 "const ok=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data||[];};"+
 "const num=x=>Number(x)||0;const mexico=()=>'';const corto=(x,n)=>String(x).slice(0,n);const mx=x=>x;"+
 "const targetHouse=(ctx,n)=>Promise.resolve(ctx.p.rol==='residente'?'houseA':null);"+
 backend.slice(begin,end)+"\nreturn {consultaDirecta,runQuery};"
)();
for(const str of ["Mis mensajes","¿Tengo mensajes nuevos?","Abre el chat","¿Hay conversaciones?"])assert.equal(consultaDirecta(str),"chat",str);
const data={
 chat_conversaciones:[{id:"ca",residente_id:"resA",updated_at:"2026-11-02"},{id:"cb",residente_id:"resB",updated_at:"2026-11-02"}],
 chat_mensajes:[
  {id:"m1",conversacion_id:"ca",autor_id:"resA",mensaje:"mensaje casa A",created_at:"2026-11-02"},
  {id:"m2",conversacion_id:"ca",autor_id:"adm",mensaje:"respuesta para A",created_at:"2026-11-02"},
  {id:"m3",conversacion_id:"cb",autor_id:"resB",mensaje:"mensaje privado casa B",created_at:"2026-11-02"}],
 chat_lecturas:[{user_id:"resA",mensaje_id:"m2"}],
 profiles:[{id:"resA",rol:"residente",nombre:"Residente A",unidad:"1",casa_id:"houseA"},
           {id:"resB",rol:"residente",nombre:"Residente B",unidad:"2",casa_id:"houseB"}]
};
function fakeDb(){
 return {from(t){
  let rows=[...(data[t]||[])];let take=Infinity;
  const q={
   select(){return this},
   eq(k,v){rows=rows.filter(x=>String(x[k])===String(v));return this},
   in(k,vals){rows=rows.filter(x=>vals.includes(x[k]));return this},
   order(){return this},
   limit(n){take=n;return this},
   then(ok,bad){return Promise.resolve({data:rows.slice(0,take),error:null}).then(ok,bad)}
  };return q;
 }};
}
const residentA={uid:"resA",p:{rol:"residente",casa_id:"houseA"},db:fakeDb()};
const owner={uid:"adm",p:{rol:"owner",casa_id:null},db:fakeDb()};
const a=await runQuery(residentA,"chat","");
assert.equal(a.data.conversaciones,1);
assert.equal(a.data.no_leidos,0);
assert.equal(a.table.length,2);
assert(!a.table.some(m=>m.mensaje.includes("casa B")));
const b=await runQuery(owner,"chat","");
assert.equal(b.data.conversaciones,2);
assert(b.table.some(m=>m.mensaje.includes("casa B")));
assert.equal(a.open_chat,true);
console.log("PASS: consulta de chat por rol, pestaña incrustada, reutilización y sintaxis.");
