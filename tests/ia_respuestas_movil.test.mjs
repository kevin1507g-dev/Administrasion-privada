import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const edge=readFileSync(new URL("../supabase/functions/asistente-residencial-ia/index.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../asistente-ia.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../asistente-ia.css",import.meta.url),"utf8");
const start=edge.indexOf("function consultaDirecta("),end=edge.indexOf("async function propose(",start);
assert(start>=0&&end>start);
const {consultaDirecta,runQuery}=new Function(
"const ok=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data||[];};const mx=x=>x;const num=x=>Number(x)||0;const mexico=()=>'';const corto=String;"+
edge.slice(start,end)+";return {consultaDirecta,runQuery};"
)();
for(const [text,expected] of [
 ["¿De qué casa soy?","perfil"],
 ["Cuál es mi casa","perfil"],
 ["¿En qué casa vivo?","perfil"],
 ["¿Cómo me llamo?","perfil"],
 ["¿Cómo te llamas?","identidad"],
 ["¿De qué casa son esos resultados?","alcance"],
 ["¿De qué casa son los pendientes?","alcance"],
 ["¿Cuánto debo?",null],
 ["Suspende los controles de la casa 45",null]
])assert.equal(consultaDirecta(text),expected,text);
const fakeDb=houses=>({from(table){
 if(table!=="casas"&&table!=="ia_configuracion")throw Error("Unexpected table: "+table);
 return {select(){return this},eq(){return this},limit(){return Promise.resolve({data:table==="casas"?houses:[{nombre:"Asistente Residencial IA"}],error:null})}};
}});
const previous=[{rol:"user",contenido:"De que casa soy"},{rol:"assistant",contenido:"Pendientes: 0 cuentas, 0 huellas y 0 reservaciones."}];
const owner={p:{rol:"owner",casa_id:null,nombre:"Cuenta de prueba"},db:fakeDb([])};
const resident={p:{rol:"residente",casa_id:"id45",nombre:"Cuenta de prueba"},db:fakeDb([{numero:"45"}])};
assert.match((await runQuery(owner,"perfil","")).answer,/No tienes una casa asignada/);
assert.match((await runQuery(resident,"perfil","")).answer,/casa 45/);
assert.match((await runQuery(owner,"alcance","",previous)).answer,/TODA la privada/);
assert.match((await runQuery(resident,"alcance","",previous)).answer,/casa 45/);
new Function(ui);
new Function(edge.replace(/^import.*\n/,""));
assert.match(css,/z-index:2147483000/);
assert.match(css,/width:100vw!important/);
assert.match(css,/height:var\(--ia-visual-height,100dvh\)!important/);
assert.match(ui,/window\.visualViewport/);
console.log("PASS: 9 intenciones, 4 respuestas con rol, sintaxis JS y CSS móvil");
