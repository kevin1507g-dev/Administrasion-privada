// node tests/aviso_cuotas_residente.test.mjs
// Sin conexiones externas, pagos reales ni acciones sobre el portón.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const js=readFileSync(new URL("../aviso-cuotas-residente.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../aviso-cuotas-residente.css",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const previous=readFileSync(new URL("../pendientes-residente.js",import.meta.url),"utf8");
new Function(js);new Function(previous);
for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(script);
assert.match(html,/aviso-cuotas-residente\.js\?v=1/);
assert.match(html,/aviso-cuotas-residente\.css\?v=1/);
assert.match(css,/\.rcu-root\[hidden\]/);
assert.match(previous,/residenteCuotasPendientesAbrir/);
const login=html.slice(html.indexOf("async function enter(){"),html.indexOf("async function loadAll(){"));
assert(login.indexOf("chatInicialAbierto=await window.residentePendientesAbrirChatInicial")<
       login.indexOf("cuotaInicialAbierta=window.residenteCuotasPendientesAbrir"));
assert(login.indexOf("cuotaInicialAbierta=window.residenteCuotasPendientesAbrir")<
       login.indexOf("if(!cuotaInicialAbierta)show('controlDigital')"));
const start=js.indexOf("function modeloAvisoCuotas("),end=js.indexOf("\nfunction esResidente()",start);
const calc=new Function(js.slice(start,end)+"\nreturn modeloAvisoCuotas;")();
const input={uid:"r",rol:"residente",casaId:"h45",numero:"45",resumen:{detalle:[
 {id:"c1",concepto:"Noviembre",saldo:60,estado:"Pendiente",vencimiento:"2026-11-20"},
 {id:"c2",concepto:"Octubre",saldo:35,estado:"Vencida",vencimiento:"2026-10-20"},
 {id:"c3",concepto:"Pagada",saldo:0,estado:"Pagada"}]},errorCarga:false};
const unpaid=calc(input);
assert.equal(unpaid.casa,"45");
assert.equal(unpaid.saldo,95);
assert.equal(unpaid.numeroCuotas,2);
assert.equal(unpaid.vencidas,1);
assert.equal(calc({...input,rol:"owner"}),null,"Only residents see the popup");
assert.equal(calc({...input,casaId:null}),null,"No house, no popup");
assert.equal(calc({...input,errorCarga:true}),null,"No banner if financial data not loaded");
assert.equal(calc({...input,resumen:{detalle:input.resumen.detalle.map(q=>({...q,saldo:0}))}}),null);
const partial=calc({...input,resumen:{detalle:[{...input.resumen.detalle[0],saldo:10},input.resumen.detalle[1]]}});
assert.equal(partial.saldo,45);
assert.equal(partial.firma,unpaid.firma,"Partial payment cannot reopen a dismissed popup");
class El{
 constructor(tag){this.tag=tag;this.children=[];this.textContent="";this.hidden=false;this.className="";}
 appendChild(x){this.children.push(x);return x;}
 replaceChildren(){this.children=[];}
 setAttribute(){}
}
const dom={hidden:false,body:new El("body"),createElement:t=>new El(t),
 getElementById:k=>k==="app"?{classList:{contains:()=>false}}:null,
 addEventListener(){}};
dom.body.classList={contains:()=>false};
const nav=[],window={addEventListener(){}};
let details=[{...input.resumen.detalle[0]}];
new Function("window","document","user","profile","resumenDeudaCasa","casaNumero",
 "ownerAnalyticsFinanceError","show",js)(window,dom,{id:"r"},{rol:"residente",casa_id:"h45"},
 ()=>({detalle:details}),()=>45,false,p=>nav.push(p));
assert.equal(window.residenteCuotasPendientesAbrir(),true);
const popup=dom.body.children[0];assert.equal(popup.hidden,false);
const visit=node=>[node,...node.children.flatMap(visit)];
const getBtn=label=>visit(popup).find(x=>x.tag==="button"&&x.textContent===label);
getBtn("Continuar a Control Digital").onclick();
assert.deepEqual(nav,["controlDigital"]);
assert.equal(popup.hidden,true);
assert.equal(window.residenteCuotasPendientesAbrir(),false,"One popup per unchanged debt/session");
details=[{...details[0],saldo:30}];
window.residenteCuotasPendientesActualizar();
assert.equal(popup.hidden,true,"Partial payment should not pop up repeatedly");
details.push({id:"c4",concepto:"Nueva cuota",saldo:60,estado:"Pendiente"});
window.residenteCuotasPendientesActualizar();
assert.equal(popup.hidden,false,"Newly issued quota appears once");
details=[];
window.residenteCuotasPendientesActualizar();
assert.equal(popup.hidden,true,"Paid balance clears popup");
assert.doesNotMatch(js,/\.insert\(|\.update\(|\.rpc\(/,"Reminder never writes payment data");
console.log("PASS: real debt and partial payments, overdue label, reopening policy, safe navigation and role isolation.");
