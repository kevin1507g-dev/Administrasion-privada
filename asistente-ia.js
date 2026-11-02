/* Asistente Residencial IA, interfaz accesible y móvil. Requiere sesión Supabase. */
(function(){
"use strict";
let mount=null,opened=false,busy=false,conversationId=null,voiceEnabled=false,recognizer=null;
const refs={};
function node(tag,opts={},parent){
 const n=document.createElement(tag);
 if(opts.className)n.className=opts.className;
 if(opts.text)n.textContent=opts.text;
 if(opts.title)n.title=opts.title;
 if(opts.type)n.type=opts.type;
 if(opts.aria)n.setAttribute("aria-label",opts.aria);
 if(parent)parent.appendChild(n);
 return n;
}
function clear(el){el.replaceChildren();}
function status(t){if(refs.status)refs.status.textContent=t;}
function viewport(){
 if(!mount||!opened||!window.visualViewport)return;
 const v=window.visualViewport;
 mount.style.setProperty('--ia-visual-height',Math.round(v.height)+'px');
 mount.style.setProperty('--ia-visual-top',Math.max(0,Math.round(v.offsetTop))+'px');
}
function starters(){
 const wrap=node('div',{className:'ia-starters'},refs.messages);
 const own=typeof profile!=='undefined'&&profile?.rol==='residente';
 const questions=own?['¿De qué casa soy?','¿Cuánto debo?','Mis pagos']:
  ['¿De qué casa soy?','Pendientes de toda la privada','Casas con más adeudos'];
 for(const q of questions){const b=node('button',{type:'button',text:q},wrap);b.onclick=()=>{refs.text.value=q;send();};}
}
function loading(){
 const el=node('div',{className:'ia-thinking'},refs.messages);
 el.setAttribute('aria-label','Consultando…');
 for(let i=0;i<3;i++)node('span',{},el);
 refs.messages.scrollTop=refs.messages.scrollHeight;
 return el;
}
function addMessage(role,text,extras={}){
 const container=node("div",{className:"ia-message ia-"+role},refs.messages);
 node("div",{className:"ia-message-text",text:String(text||"")},container);
 if(Array.isArray(extras.table)&&extras.table.length){
  const tableWrap=node("div",{className:"ia-table-wrap"},container);
  const table=node("table",{},tableWrap);
  const keys=Object.keys(extras.table[0]).slice(0,6);
  const head=node("thead",{},table),hrow=node("tr",{},head);
  for(const k of keys)node("th",{text:k},hrow);
  const tbody=node("tbody",{},table);
  for(const item of extras.table.slice(0,25)){
   const r=node("tr",{},tbody);
   for(const k of keys)node("td",{text:String(item?.[k]??"—").slice(0,150)},r);
  }
 }
 if(extras.proposal){
  const p=extras.proposal;
  const box=node("div",{className:"ia-confirm"},container);
  node("strong",{text:"Confirmación necesaria"},box);
  node("p",{text:String(p.description||p.action||"Operación").slice(0,150)},box);
  node("small",{text:"El sistema verificará nuevamente tus permisos. Esta acción puede ser irreversible."},box);
  const btn=node("button",{type:"button",className:"ia-danger",text:"Confirmar operación"},box);
  btn.onclick=async()=>{
   if(busy)return;
   btn.disabled=true;btn.textContent="Confirmando…";
   try{
    const result=await call({kind:"confirm",operationId:p.id});
    if(!result.executed)throw Error("El servidor no confirmó la ejecución.");
    btn.textContent="✓ Confirmada";status("Operación registrada y confirmada.");
    addMessage("assistant","La operación fue ejecutada y confirmada por el servidor.");
   }catch(err){btn.disabled=false;btn.textContent="Reintentar confirmación";status(err.message);addMessage("assistant","No se pudo ejecutar: "+err.message);}
  };
  const cancel=node("button",{type:"button",text:"No ejecutar"},box);
  cancel.onclick=()=>{btn.disabled=true;cancel.disabled=true;cancel.textContent="Descartada";};
 }
 refs.messages.scrollTop=refs.messages.scrollHeight;
}
async function call(payload){
 if(typeof sb==="undefined")throw Error("No existe conexión con Supabase.");
 const {data,error}=await sb.functions.invoke("asistente-residencial-ia",{body:payload});
 if(error)throw Error(error?.context?.error||error.message||"Error de conexión con el asistente.");
 if(!data||data.error)throw Error(data?.error||"Respuesta inválida del servidor.");
 return data;
}
async function send(){
 const text=refs.text.value.trim();
 if(!text||busy)return;
 busy=true;refs.send.disabled=true;refs.text.value="";
 addMessage("user",text);status("Consultando tu pregunta…");
 const wait=loading();
 try{
  const r=await call({kind:"message",message:text,conversationId});
  conversationId=r.conversationId||conversationId;
  wait.remove();
  addMessage("assistant",r.answer||"No encontré una respuesta verificable.",r);
  if(r.scope)refs.messages.setAttribute("data-last-scope",r.scope);
  if(![...refs.history.options].some(x=>x.value===conversationId)){
   const o=node('option',{text:text.slice(0,48)},refs.history);o.value=conversationId;
  }
  refs.history.value=conversationId;
  if(r.mode==="limitado_sin_modelo")status("Consultas por reglas: falta configurar el proveedor de IA.");
  else status("Conectado · "+(r.role==="owner"?"Sistema Admin":r.role));
  if(voiceEnabled&&"speechSynthesis" in window){
   window.speechSynthesis.cancel();
   const utterance=new SpeechSynthesisUtterance(String(r.answer||"").slice(0,600));
   utterance.lang="es-MX";utterance.rate=1;
   window.speechSynthesis.speak(utterance);
  }
 }catch(e){wait.remove();status("Error: "+e.message);addMessage("assistant","No pude consultar esa información: "+e.message);}
 finally{busy=false;refs.send.disabled=false;}
}
async function loadHistory(){
 try{
  const r=await call({kind:"history",conversationId});
  clear(refs.messages);
  if(r.messages?.length){for(const m of r.messages)addMessage(m.rol==="user"?"user":"assistant",m.contenido);}
  else {addMessage("assistant","Hola. ¿Qué necesitas consultar? Puedo revisar los registros de Administración Residencial que tu cuenta tiene autorizados.");starters();}
  clear(refs.history);
  node("option",{text:"Conversaciones recientes"},refs.history).value="";
  for(const c of r.conversations||[]){
   const option=node("option",{text:String(c.titulo||"Conversación").slice(0,60)},refs.history);
   option.value=c.id;
  }
  refs.history.value=conversationId||"";
 }catch(e){status("No se pudo cargar el historial: "+e.message);}
}
async function open(){
 opened=!opened;
 refs.panel.hidden=!opened;
 refs.launch.setAttribute("aria-expanded",String(opened));
 document.body.classList.toggle("ia-open",opened);
 if(opened){
  viewport();
  try{
   const st=await call({kind:"status"});
   const rol=st.role==="owner"?"Sistema Admin":st.role==="admin"?"Administrador":"Residente";
   status((st.model_enabled?"Conectado":"Consultas limitadas")+" · "+rol);
   refs.headTitle.textContent=st.name||"Asistente Residencial IA";
   refs.brandAvatar.textContent=st.icon||"✦";
   refs.headSubtitle.textContent=rol+" · Consultas seguras";
   refs.config.hidden=st.role!=="owner";
  }catch(e){status("Conexión no verificada: "+e.message);}
  await loadHistory();
  if(window.matchMedia("(min-width:701px)").matches)refs.text.focus();
 }else{
  if("speechSynthesis" in window)window.speechSynthesis.cancel();
  try{recognizer?.stop();}catch{}
  refs.launch.focus();
 }
}
function startListening(){
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){status("Este navegador no permite reconocimiento de voz. Puedes escribir tu mensaje.");return;}
 if(recognizer){try{recognizer.stop();}catch{}recognizer=null;return;}
 const rec=new Recognition();recognizer=rec;rec.lang="es-MX";rec.interimResults=false;rec.maxAlternatives=1;
 rec.onresult=e=>{refs.text.value=e.results[0][0].transcript;status("Texto recibido. Revísalo y pulsa Enviar.");};
 rec.onerror=()=>status("Micrófono no disponible o permiso denegado.");
 rec.onend=()=>{recognizer=null;refs.mic.textContent="🎤";};
 refs.mic.textContent="■";rec.start();status("Escuchando con permiso del navegador…");
}
function init(){
 if(mount||document.getElementById("app")?.classList.contains("hidden"))return;
 mount=node("div",{className:"ia-root"},document.body);
 refs.launch=node("button",{className:"ia-launch",type:"button",text:"✦ IA",aria:"Abrir Asistente Residencial IA"},mount);
 refs.launch.setAttribute("aria-expanded","false");
 refs.panel=node("section",{className:"ia-panel"},mount);
 refs.panel.hidden=true;refs.panel.setAttribute("aria-label","Asistente Residencial IA");
 refs.panel.setAttribute("role","dialog");refs.panel.setAttribute("aria-modal","true");
 const head=node("header",{className:"ia-head"},refs.panel);
 const brand=node("div",{className:"ia-brand"},head);
 refs.brandAvatar=node("span",{className:"ia-avatar",text:"✦"},brand);
 const brandText=node("div",{className:"ia-brand-copy"},brand);
 refs.headTitle=node("strong",{className:"ia-head-title",text:"Asistente Residencial IA"},brandText);
 refs.headSubtitle=node("span",{className:"ia-head-subtitle",text:"Consultas seguras"},brandText);
 const close=node("button",{type:"button",className:"ia-close",text:"×",aria:"Cerrar asistente"},head);
 const controls=node("div",{className:"ia-top-controls"},refs.panel);
 refs.history=node("select",{aria:"Historial de conversaciones"},controls);
 const newBtn=node("button",{type:"button",text:"＋",aria:"Nueva conversación"},controls);newBtn.title="Nueva conversación";
 refs.alerts=node("button",{type:"button",text:"🔔",aria:"Alertas de IA"},controls);refs.alerts.title="Ver alertas";
 refs.config=node("button",{type:"button",text:"⚙",aria:"Configurar nombre e icono"},controls);refs.config.hidden=true;refs.config.title="Configurar IA";
 refs.status=node("p",{className:"ia-status",text:"Verificando acceso…"},refs.panel);
 refs.messages=node("div",{className:"ia-messages"},refs.panel);refs.messages.setAttribute("role","log");refs.messages.setAttribute("aria-live","polite");
 const compose=node("div",{className:"ia-compose"},refs.panel);
 refs.text=node("textarea",{aria:"Escribe tu consulta"},compose);refs.text.placeholder="Escribe tu pregunta…";refs.text.rows=2;refs.text.maxLength=900;
 const actionsRow=node("div",{className:"ia-actions"},compose);
 refs.mic=node("button",{type:"button",text:"🎤",aria:"Dictar mensaje"},actionsRow);
 const speak=node("button",{type:"button",text:"🔇",aria:"Activar lectura en voz alta"},actionsRow);
 refs.send=node("button",{type:"button",className:"ia-send",text:"Enviar"},actionsRow);
 refs.launch.onclick=open;close.onclick=open;refs.send.onclick=send;refs.mic.onclick=startListening;
 refs.alerts.onclick=async()=>{
  try{
   const a=await call({kind:"alerts"});
   addMessage("assistant",a.alerts?.length?"Alertas recientes de la plataforma:":"No tienes alertas registradas.");
   for(const item of (a.alerts||[]).slice(0,15))addMessage("assistant",String(item.titulo||"Alerta")+": "+String(item.detalle||""));
  }catch(e){status("No se pudieron consultar las alertas: "+e.message);}
 };
 refs.config.onclick=async()=>{
  if(refs.config.hidden)return;
  const name=prompt("Nombre del asistente (5 a 45 caracteres):",refs.headTitle.textContent.replace(/^[✦🤖🏠🛡️]+\\s*/u,""));
  if(name===null)return;
  const icon=prompt("Icono del asistente: ✦, 🤖, 🏠 o 🛡️","✦");
  if(icon===null)return;
  if(!confirm("¿Guardar este nombre e icono para toda la plataforma?"))return;
  try{
   const c=await call({kind:"configure",name:name.trim(),icon:icon.trim()});
   refs.headTitle.textContent=c.config.icono+" "+c.config.nombre;status("Configuración guardada.");
  }catch(e){status("No se guardó la configuración: "+e.message);}
 };
 speak.onclick=()=>{voiceEnabled=!voiceEnabled;speak.textContent=voiceEnabled?"🔊":"🔇";speak.setAttribute("aria-label",voiceEnabled?"Desactivar voz":"Activar voz");if(!voiceEnabled&&"speechSynthesis" in window)window.speechSynthesis.cancel();};
 refs.text.onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}};
 newBtn.onclick=async()=>{conversationId=null;await loadHistory();if(window.matchMedia("(min-width:701px)").matches)refs.text.focus();};
 refs.history.onchange=async()=>{conversationId=refs.history.value||null;await loadHistory();};
 window.visualViewport?.addEventListener("resize",viewport,{passive:true});
 window.visualViewport?.addEventListener("scroll",viewport,{passive:true});
 document.addEventListener("keydown",e=>{if(opened&&e.key==="Escape"){e.preventDefault();open();}});
}
window.aiInitialize=init;
if(!document.getElementById("app")?.classList.contains("hidden"))init();
})();