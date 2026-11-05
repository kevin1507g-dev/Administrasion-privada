// Sin redes ni pulsos: prueba las rutas del Portero Inteligente.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const portal=readFileSync(new URL("../repartidor.html",import.meta.url),"utf8");
const server=readFileSync(new URL("../supabase/functions/delivery-owner-chat/index.ts",import.meta.url),"utf8");
const delivery=readFileSync(new URL("../supabase/functions/delivery-contact/index.ts",import.meta.url),"utf8");
const js=[...portal.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)]
 .map(m=>m[1]).find(x=>x.includes("procesarPortero"));
assert(js);
new vm.Script(js);
assert.match(server,/action==="owner_reply"/);
assert.match(server,/admin\.auth\.getUser\(token\)/);
assert.match(server,/sha256\(token\)/);
assert.doesNotMatch(server,/access_private\.commands|digital_access_request|visitor_pass_request/);
assert.match(delivery,/portero_modo_mixto: porteroMixto/);

function build(approved,choice,code=""){
 const els={},calls=[];
 function el(id){
  if(!els[id]){
   const c=new Set(["hidden"]);
   els[id]={
    value:"",hidden:false,required:false,disabled:false,textContent:"",
    scrollHeight:100,scrollTop:0,clientHeight:100,
    classList:{add:x=>c.add(x),remove:x=>c.delete(x),
      toggle:(x,v)=>v?c.add(x):c.delete(x),contains:x=>c.has(x)},
    focus(){},setAttribute(){},removeAttribute(){},reportValidity(){},scrollIntoView(){},
    replaceChildren(){},appendChild(){}
   };
  }
  return els[id];
 }
 const context={
  document:{getElementById:el,createElement(){return {className:"",textContent:"",append(){}}}},
  window:{addEventListener(){}},
  setInterval(){return 1},clearInterval(){},
  supabase:{createClient(){return{
   rpc:async(fn,args)=>{calls.push({fn,args});return {data:{accepted:true},error:null}},
   functions:{invoke:async(fn,args)=>{
    calls.push({fn,args});
    if(fn==="delivery-owner-chat"){
     if(args.body.action==="start")
      return {data:approved?{ok:true,autorizada:true}:
       {ok:true,autorizada:false,chat_token:"a".repeat(64),
        expires_at:new Date(Date.now()+3600000).toISOString()},error:null};
     return {data:{ok:true,estado:"abierto",messages:[]},error:null};
    }
    if(fn==="delivery-contact")return {data:{
     ok:true,token:"token-de-prueba",expires_at:new Date(Date.now()+600000).toISOString()
    },error:null};
    return {data:{estado:"esperando"},error:null};
   }}
  };}}
 };
 vm.createContext(context);vm.runInContext(js,context);
 for(const [id,value] of Object.entries({
  porteroCasa:"63",porteroTipo:"comida",porteroEmpresa:"Empresa de prueba",
  porteroNombre:"Prueba",porteroMensaje:"Pedido de prueba",
  porteroAutorizacion:choice,porteroCodigo:code
 }))el(id).value=value;
 return {el,calls,context};
}
const event={preventDefault(){}};
const unauth=build(false,"sin_codigo");
await unauth.context.procesarPortero(event);
assert(unauth.calls.some(c=>c.fn==="delivery-owner-chat"&&c.args.body.action==="start"));
assert(!unauth.calls.some(c=>c.fn==="delivery-contact"));
assert(!unauth.el("ownerDeliveryChatCard").classList.contains("hidden"));

const approved=build(true,"sin_codigo");
await approved.context.procesarPortero(event);
assert(approved.calls.some(c=>c.fn==="delivery-contact"));
assert(approved.el("waitCard").classList.contains("hidden")===false);
assert(!approved.calls.some(c=>c.fn==="visitor_pass_request"));

const coded=build(false,"con_codigo","A123456");
await coded.context.procesarPortero(event);
assert.deepEqual(coded.calls.map(x=>x.fn),["visitor_pass_request"]);
const invalid=build(false,"con_codigo","MAL");
await invalid.context.procesarPortero(event);
assert.equal(invalid.calls.length,0);
const missingName=build(false,"sin_codigo");
missingName.el("porteroNombre").value=" ";
await missingName.context.procesarPortero(event);
assert.equal(missingName.calls.length,0);
console.log("PASS: no autorizado->chat Owner, autorizado->residente, código->RPC; sin pulsos de prueba.");
