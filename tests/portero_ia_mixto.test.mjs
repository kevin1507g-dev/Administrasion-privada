// Pruebas sin acceso a redes, sin escribir en Supabase y SIN enviar pulsos al portón.
// Ejecutar: node tests/portero_ia_mixto.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const portal = readFileSync(new URL("../repartidor.html", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/delivery-contact/index.ts", import.meta.url), "utf8");
const script = [...portal.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).find(s=>s.includes("procesarPortero"));
assert(script, "Falta la ruta del Portero Inteligente");
assert.match(portal, /id="porteroForm"/);
assert.match(portal, /id="porteroCodigo"/);
assert.match(edge, /EdgeRuntime\.waitUntil/);
assert.match(edge, /No identifiques ni valides personas o empresas/);
assert.doesNotMatch(script, /digital_access_request|digital_access_delivery_request|digital_access_exchange/);
new vm.Script(script);

const build=(autorizacion,codigo="",accepted=true)=>{
 const elements={};
 const calls={rpc:[],invoke:[]};
 const el=id=>{
  if(!elements[id]){
   const classes=new Set(["hidden"]);
   elements[id]={
    value:"",textContent:"",disabled:false,required:false,hidden:true,
    classList:{
     add:x=>classes.add(x), remove:x=>classes.delete(x),
     toggle:(x,flag)=>flag?classes.add(x):classes.delete(x),
     contains:x=>classes.has(x)
    },
    focus(){},setAttribute(){},removeAttribute(){},reportValidity(){},scrollIntoView(){}
   };
  }
  return elements[id];
 };
 const context={
  document:{getElementById:el},
  window:{addEventListener(){}},
  setInterval(){return 1},clearInterval(){},
  supabase:{createClient(){return {
   rpc:async(fn,args)=>{calls.rpc.push({fn,args});return {data:{accepted,message:"Autorización comprobada"},error:null};},
   functions:{invoke:async(fn,args)=>{
    calls.invoke.push({fn,args});
    return {data:fn==="delivery-contact"
     ? {ok:true,token:"token-de-prueba",expires_at:new Date(Date.now()+600000).toISOString()}
     : {estado:"esperando",expires_at:new Date(Date.now()+600000).toISOString()},error:null};
   }}
  };}}
 };
 vm.createContext(context);
 vm.runInContext(script,context);
 el("porteroCasa").value="63";
 el("porteroTipo").value="comida";
 el("porteroEmpresa").value="Reparto de prueba";
 el("porteroNombre").value="Prueba";
 el("porteroMensaje").value="Pedido autorizado";
 el("porteroAutorizacion").value=autorizacion;
 el("porteroCodigo").value=codigo;
 el("porteroCard").classList.remove("hidden");
 return {context,el,calls};
};
const event={preventDefault(){}};
const allowed=build("con_codigo","A123456");
await allowed.context.procesarPortero(event);
assert.deepEqual(allowed.calls.rpc.map(x=>x.fn),["visitor_pass_request"]);
assert.equal(allowed.calls.invoke.length,0);
assert.match(allowed.el("porteroEstado").textContent,/Autorización previa válida/);

const invalid=build("con_codigo","INVÁLIDO");
await invalid.context.procesarPortero(event);
assert.equal(invalid.calls.rpc.length,0);
assert.equal(invalid.calls.invoke.length,0);
assert(!invalid.el("porteroPedirConfirmacion").classList.contains("hidden"));

const rejected=build("con_codigo","A123456",false);
await rejected.context.procesarPortero(event);
assert.equal(rejected.calls.rpc.length,1);
assert.equal(rejected.calls.invoke.length,0);
assert(!rejected.el("porteroPedirConfirmacion").classList.contains("hidden"));

const noCode=build("sin_codigo");
await noCode.context.procesarPortero(event);
assert.equal(noCode.calls.rpc.length,0);
assert(noCode.calls.invoke.some(x=>x.fn==="delivery-contact"));
assert(noCode.el("porteroCard").classList.contains("hidden"));
assert(!noCode.el("waitCard").classList.contains("hidden"));
console.log("PASS: código válido, inválido, rechazado y sin código; ningún pulso de prueba.");
