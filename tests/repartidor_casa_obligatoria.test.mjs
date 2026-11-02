// Ejecutar: node tests/repartidor_casa_obligatoria.test.mjs
// Prueba de formulario y contrato del backend, sin enviar solicitudes reales.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../repartidor.html",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/delivery-contact/index.ts",import.meta.url),"utf8");
assert.match(html, /<input id="casa"[^>]*required/);
assert.match(html, /Número de casa[\s\S]{0,160}obligatorio/);
assert.match(edge, /const casaIngresada = String\(body\?\.casa \?\? ""\)\.trim\(\)/);
assert.match(edge, /if \(!casa\?\.id\)/);
assert.match(edge, /casa_id: casa\.id/);
assert.doesNotMatch(edge, /casa_id:\s*casa\?\.id\s*\|\|\s*null/);

const parts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
for(const x of parts)new Function(x[1]);
const begin=html.indexOf("async function enviarSolicitud(){");
const end=html.indexOf("\nasync function consultarEstado(",begin);
assert(begin>=0&&end>begin);
const fnSource=html.slice(begin,end);
async function trySend(house){
 const error={textContent:""};
 const button={disabled:false,textContent:"🔔 Contactar residente"};
 const casa={value:house,focused:false,
  setAttribute(){},removeAttribute(){},
  focus(){this.focused=true;},reportValidity(){}};
 const fields={casa,tipo:{value:"comida"},empresa:{value:""},
  repartidor:{value:""},mensaje:{value:""},error,sendBtn:button};
 const document={getElementById(id){if(!(id in fields))throw Error("Unexpected field "+id);return fields[id];}};
 let calls=0;
 const sb={functions:{invoke:async()=>{calls++;return {data:{error:"SIMULATED backend response"},error:null};}}};
 const create=new Function("document","sb",fnSource+";return enviarSolicitud;");
 await create(document,sb)();
 return {error:error.textContent,calls,focused:casa.focused,buttonDisabled:button.disabled};
}
for(const value of ["","0","abc","20 abc"]){
 const r=await trySend(value);
 assert.equal(r.calls,0,value);
 assert.equal(r.focused,true,value);
 assert.match(r.error,/obligatorio/);
}
const valid=await trySend("45");
assert.equal(valid.calls,1);
assert.equal(valid.error,"SIMULATED backend response");
assert.equal(valid.buttonDisabled,false);
for(const input of ["","0","45abc","12345678901","45"]){
 const validInput=/^[0-9]{1,10}$/.test(input)&&Number(input)>0;
 assert.equal(validInput,input==="45",input);
}
console.log("PASS: 4 formularios inválidos, 1 válido, contrato de Edge y JS.");
