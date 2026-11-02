// Ejecutar: node tests/notificaciones_auto_leidas.test.mjs
// No escribe en Supabase: simula el comportamiento de la interfaz.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.match(html,/if\(id==='notificaciones' && target\)void marcarNotificacionesAlAbrirPanel\(\)/);
for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(script);
const start=html.indexOf("let notificacionesMarcandoAlAbrir=false;");
const single=html.indexOf("async function marcarNotificacionLeida(id){",start);
const batch=html.indexOf("async function marcarTodasNotificacionesLeidas(",single);
const end=html.indexOf("async function abrirNotificacion(id){",batch);
assert(start>0&&single>start&&batch>single&&end>batch);
const code=html.slice(start,single)+"\n"+html.slice(batch,end);
const factory=new Function("sb","user","profile","document","renderNotificaciones","console","alert",
 "let notificaciones=[],notificacionLecturas=[];\n"+code+
 "\nreturn {open:marcarNotificacionesAlAbrirPanel,markAll:marcarTodasNotificacionesLeidas,get:()=>({notificaciones,notificacionLecturas})};"
);
function makeScenario({rows=[{id:"n1"},{id:"n2"}],reads=[{notificacion_id:"n1",user_id:"u1"}],fail=false,active=true}={}){
 const user={id:"u1"},profile={rol:"residente"},panel={classList:{contains:()=>active}};
 const resumen={textContent:""};
 const document={getElementById:id=>id==="notificaciones"?panel:id==="notifResumen"?resumen:null};
 let requests=0,renders=0;
 const writes=[];
 const sb={from(table){
  return {
   select(){return this},or(){return this},order(){return this},
   limit(){requests++;return Promise.resolve({data:[...rows],error:null});},
   eq(){return Promise.resolve({data:[...reads],error:null});},
   upsert(data,options){writes.push({data,options});return Promise.resolve(fail?{error:{message:"error simulado"}}:{error:null});}
  };
 }};
 const app=factory(sb,user,profile,document,()=>{renders++;},{warn(){}},()=>{throw Error("Automatic reading must not show an alert");});
 return {app,user,rows,reads,resumen,writes,get requests(){return requests;},get renders(){return renders;}};
}
const success=makeScenario();
await success.app.open();
assert.equal(success.app.get().notificacionLecturas.length,2);
assert.equal(success.writes.length,1);
assert.deepEqual(success.writes[0].data,[{notificacion_id:"n2",user_id:"u1"}]);
assert.deepEqual(success.writes[0].options,{onConflict:"notificacion_id,user_id",ignoreDuplicates:true});
await success.app.markAll({silencioso:true});
assert.equal(success.writes.length,1,"No duplicate writes");
success.rows.push({id:"n3"});
assert.equal(success.app.get().notificacionLecturas.some(x=>x.notificacion_id==="n3"),false,
 "New notifications arriving later must remain unread");
const failed=makeScenario({fail:true});
await failed.app.open();
assert.equal(failed.app.get().notificacionLecturas.length,1,
 "A failed write must not display notifications as read");
assert.match(failed.resumen.textContent,/No se pudieron marcar/);
const inactive=makeScenario({active:false});
await inactive.app.open();
assert.equal(inactive.requests,0);
assert.equal(inactive.writes.length,0);
console.log("PASS: panel opening, user-specific reads, idempotence, later notifications, errors and inactive panel.");
