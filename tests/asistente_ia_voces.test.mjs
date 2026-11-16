// node tests/asistente_ia_voces.test.mjs
// El selector utiliza voces reales del navegador y guarda preferencias con RLS.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
const html=read("index.html");
const voiceModule=read("asistente-ia-voces.js");
const ai=read("asistente-ia.js");
const styles=read("asistente-ia-voces.css");
const migration=read("database/preferencias_voz_ia_20261115.sql");
new Function(voiceModule);new Function(ai);
for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)){
 if(script[1].trim())new Function(script[1]);
}
assert.match(html,/asistente-ia-voces\.js\?v=1/);
assert.match(html,/asistente-ia-voces\.css\?v=1/);
assert.match(html,/asistente-ia\.js\?v=16/);
assert.ok(html.indexOf("asistente-ia-voces.js?v=1")<html.indexOf("asistente-ia.js?v=16"));
assert.ok(html.indexOf("asistente-ia-voces.css?v=1")>html.indexOf("asistente-ia-moderno.css?v=2"));
assert.equal((styles.match(/\{/g)||[]).length,(styles.match(/\}/g)||[]).length);
assert.match(voiceModule,/getVoices\(\)/);
assert.match(voiceModule,/voiceschanged/);
assert.match(voiceModule,/Neuronal/);
assert.match(voiceModule,/Femeninas/);
assert.match(voiceModule,/Masculinas/);
assert.match(voiceModule,/Escuchar muestra/);
assert.match(voiceModule,/Guardar mi voz/);
assert.match(voiceModule,/ia_preferencias/);
assert.match(voiceModule,/onConflict:"usuario_id"/);
assert.match(voiceModule,/\.eq\("usuario_id",id\)\.maybeSingle\(\)/);
assert.match(voiceModule,/setEnabled/);
assert.match(voiceModule,/configur/);
assert.match(ai,/window\.IAVoces\.configure\(utterance\)/);
assert.match(ai,/window\.IAVoces\?\.loadForUser/);
assert.match(ai,/window\.IAVoces\?\.init/);
assert.match(ai,/window\.IAVoces\?\.setEnabled\(voiceEnabled\)/);
assert.match(ai,/if\(window\.IAVoces\?\.isOpen\(\)\)window\.IAVoces\.close\(\)/);
assert.match(migration,/ALTER TABLE public\.ia_preferencias/);
assert.match(migration,/voz_velocidad numeric\(3,2\)/);
assert.match(migration,/voz_perfil IN \('todas','femeninas','masculinas','naturales'\)/);
assert.doesNotMatch(voiceModule,/service_role|secret_key|sb\.functions\.invoke|digital_access_request/);

const voices=[
 {name:"Microsoft Dalia Online (Natural)",voiceURI:"dalia",lang:"es-MX"},
 {name:"Jorge",voiceURI:"jorge",lang:"es-MX"},
 {name:"Alice",voiceURI:"alice",lang:"en-US"}
];
const mockWindow={speechSynthesis:{getVoices:()=>voices},SpeechSynthesisUtterance:class {}};
const api=new Function("window",voiceModule+"\nreturn window.IAVoces;")(mockWindow);
const utterance={};
api.configure(utterance,{
 voz_id:"dalia",voz_nombre:"Microsoft Dalia Online (Natural)",
 voz_velocidad:1.15,voz_tono:.95,voz_volumen:.75
});
assert.equal(utterance.voice?.voiceURI,"dalia");
assert.equal(utterance.lang,"es-MX");
assert.equal(utterance.rate,1.15);
assert.equal(utterance.pitch,.95);
assert.equal(utterance.volume,.75);
const male={};
api.configure(male,{
 voz_id:"jorge",voz_nombre:"Jorge",voz_velocidad:1,voz_tono:1,voz_volumen:1
});
assert.equal(male.voice?.voiceURI,"jorge");
assert.equal(typeof api.loadForUser,"function");
assert.equal(typeof api.setEnabled,"function");
console.log("PASS: selector de voces reales, muestras, preferencias RLS e integración con IA.");
