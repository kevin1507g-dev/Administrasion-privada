// node tests/asistente_ia_moderno.test.mjs
// Regresión de diseño: no altera acceso, pagos ni funciones del asistente.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html");
const js=read("asistente-ia.js");
const original=read("asistente-ia.css");
const theme=read("asistente-ia-moderno.css");
const knowledge=read("centro-conocimientos-ia.css");
const knowledgeJs=read("centro-conocimientos-ia.js");

new Function(js);new Function(knowledgeJs);
for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)){
 if(script[1].trim())new Function(script[1]);
}
assert.match(html,/asistente-ia\.css\?v=9/);
assert.match(html,/asistente-ia-moderno\.css\?v=2/);
assert.match(html,/asistente-ia\.js\?v=15/);
assert.match(html,/centro-conocimientos-ia\.css\?v=2/);
assert.ok(html.indexOf("asistente-ia-moderno.css?v=2")>html.indexOf("asistente-ia.css?v=9"));
assert.equal((theme.match(/\{/g)||[]).length,(theme.match(/\}/g)||[]).length);
assert.equal((knowledge.match(/\{/g)||[]).length,(knowledge.match(/\}/g)||[]).length);

for(const selector of [
 ".ia-root .ia-panel", ".ia-root .ia-head", ".ia-root .ia-tabs",
 ".ia-root .ia-message", ".ia-root .ia-user", ".ia-root .ia-assistant",
 ".ia-root .ia-compose", ".ia-root .ia-chat-host",
 ".ia-root .ia-special-messages", ".ia-root .ia-special-entry",
 ".ia-root .ia-starters", ".ia-root .ia-launch"
]){
 assert.ok(theme.includes(selector),selector+" no tiene diseño moderno");
}
assert.match(theme,/safe-area-inset-top/);
assert.match(theme,/--ia-visual-height,100dvh/);
assert.match(theme,/@media\(max-width:700px\)/);
assert.match(theme,/prefers-reduced-motion:reduce/);
assert.match(theme,/:focus-visible/);
assert.match(js,/ia-welcome-title/);
assert.match(js,/CONSULTAS RÁPIDAS/);
assert.match(js,/function reservationWizard\(/);
assert.match(js,/async function openSpecialGate\(/);
assert.match(js,/digital_access_request/);
assert.match(js,/window\.iaAbrirChatPendiente/);
assert.match(js,/window\.iaAbrirChatEspecial/);
assert.match(js,/async function switchTab\(/);
assert.match(js,/async function loadHistory\(/);
assert.match(js,/refs\.mic\.onclick=startListening/);

assert.match(js,/function setAudioIcon\(button,kind,active=false\)/);
assert.match(js,/document\.createElementNS\("http:\/\/www\.w3\.org\/2000\/svg","svg"\)/);
assert.match(js,/setAudioIcon\(refs\.mic,"mic",false\)/);
assert.match(js,/setAudioIcon\(speak,"speaker",false\)/);
assert.match(js,/setAudioIcon\(speak,"speaker",voiceEnabled\)/);
assert.match(js,/aria-pressed/);
assert.match(theme,/\.ia-root \.ia-actions \.ia-audio-control svg/);
assert.match(theme,/\.ia-root \.ia-actions \.ia-microphone\[aria-pressed="true"\]/);
assert.doesNotMatch(js,/refs\.mic\.textContent="🎤"/);
assert.doesNotMatch(js,/speak\.textContent=voiceEnabled\?"🔊":"🔇"/);

assert.match(js,/refs\.send\.onclick=send/);
assert.match(js,/refs\.config\.hidden=st\.role!=="owner"/);
assert.match(original,/\.ia-panel\[hidden\],\.ia-root \[hidden\]\{display:none!important\}/);
assert.match(knowledge,/#conocimientosIA \.ia-kb-buttons button/);

// Smoke test de los botones de bienvenida y sus mensajes originales.
const snippet=js.slice(js.indexOf("function starters(){"),js.indexOf("function loading(){"));
for(const [role,expected] of [
 ["residente","Quiero reservar el portón"],
 ["owner","¿De qué casa soy?"]
]){
 const entries=[];
 function node(tag,opts={},parent){
  const el={tag,opts,children:[],onclick:null,setAttribute(){}};
  if(parent)parent.children.push(el);
  entries.push(el);return el;
 }
 const refs={messages:{children:[]},text:{value:""}};
 let sends=0;
 const fn=new Function("node","refs","profile","send",snippet+"\nreturn starters;")(
  node,refs,{rol:role},()=>sends++
 );
 fn();
 const buttons=entries.filter(e=>e.tag==="button");
 assert.equal(buttons.length,4);
 assert.ok(entries.some(e=>e.opts.className==="ia-welcome"));
 buttons[0].onclick();
 assert.equal(refs.text.value,expected);
 assert.equal(sends,1);
}
console.log("PASS: diseño moderno, iPhone, chat y funciones del asistente preservadas.");
