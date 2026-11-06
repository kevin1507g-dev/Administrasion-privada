/* Asistente Residencial IA, interfaz accesible y móvil. Requiere sesión Supabase. */
(function(){
"use strict";
let mount=null,opened=false,busy=false,conversationId=null,voiceEnabled=false,recognizer=null,chatOriginalParent=null,chatOriginalNext=null,chatSelected=false,chatLoading=false;
let specialSelected=false,specialCurrent=null,specialChats=[],specialUnread=0,specialPolling=null,specialLoading=false,specialReading=false,specialSending=false,specialAuthorizing=false;
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

function unreadChat(){
 try{return typeof contarChatNoLeidos==="function"?Math.max(0,Number(contarChatNoLeidos())||0):0;}catch{return 0;}
}
function refreshChatTab(){
 if(!refs.chatTab)return;
 const n=unreadChat();
 refs.chatTab.textContent="💬 Mensajes"+(n?" ("+(n>99?"99+":n)+")":"");
 refs.chatTab.setAttribute("aria-label","Chat privado"+(n?", "+n+" mensajes sin leer":""));
}
function ownerSession(){
 return typeof profile!=="undefined" && profile?.rol==="owner";
}
function setSpecialCount(n){
 specialUnread=ownerSession()?Math.max(0,Math.min(99,Number(n)||0)):0;
 if(refs.specialTab){
  refs.specialTab.textContent="🚚 Especiales"+(specialUnread?" ("+specialUnread+")":"");
  refs.specialTab.setAttribute("aria-label","Chats especiales de repartidores"+(specialUnread?", "+specialUnread+" pendientes":""));
 }
 if(refs.specialBadge){
  refs.specialBadge.hidden=!specialUnread;
  refs.specialBadge.textContent=String(specialUnread);
 }
 if(refs.launch){
  refs.launch.setAttribute("aria-label","Abrir Asistente Residencial IA"+(specialUnread?", "+specialUnread+" chats especiales pendientes":""));
 }
}
function countPendingSpecial(items){
 return (items||[]).filter(c=>c.estado==="abierto"&&new Date(c.expires_at).getTime()>Date.now()&&
  (!c.last_owner_read_at||new Date(c.last_visitor_at).getTime()>new Date(c.last_owner_read_at).getTime())).length;
}
async function specialApi(action,extra={}){
 if(!ownerSession())throw Error("Los chats especiales son exclusivos de Sistema Admin.");
 if(typeof sb==="undefined")throw Error("No hay conexión con Supabase.");
 const {data,error}=await sb.functions.invoke("delivery-owner-chat",{body:{action,...extra}});
 if(error||data?.error)throw Error(String(data?.error||error?.message||"No se pudo consultar el chat especial.").slice(0,240));
 return data||{};
}
function renderSpecialMessages(messages){
 if(!refs.specialMessages)return;
 const el=refs.specialMessages;
 const shouldScroll=el.scrollHeight-el.scrollTop-el.clientHeight<90;
 clear(el);
 for(const m of (messages||[])){
  const bubble=node("div",{className:"ia-special-bubble"+(m.autor==="owner"?" owner":"")},el);
  node("small",{text:m.autor==="owner"?"Sistema Admin":m.autor==="sistema"?"Portero IA":"Repartidor"},bubble);
  node("div",{text:String(m.mensaje||"")},bubble);
 }
 if(shouldScroll)el.scrollTop=el.scrollHeight;
}
function renderSpecialList(){
 if(!refs.specialList)return;
 clear(refs.specialList);
 if(!specialChats.length){
  node("p",{className:"ia-special-empty",text:"Todavía no hay chats especiales de repartidores."},refs.specialList);
  return;
 }
 for(const c of specialChats){
  const unread=c.estado==="abierto"&&new Date(c.expires_at).getTime()>Date.now()&&
   (!c.last_owner_read_at||new Date(c.last_visitor_at).getTime()>new Date(c.last_owner_read_at).getTime());
  const b=node("button",{type:"button",className:"ia-special-entry",
   text:(unread?"🔴 Nuevo · ":"")+"Casa "+c.casa_numero+" · "+c.empresa+" · "+c.repartidor+
    (c.estado==="cerrado"?" · Finalizado":"")},refs.specialList);
  b.onclick=()=>showSpecialConversation(c.id);
 }
}
async function loadSpecialChats(){
 if(!ownerSession()||specialLoading)return;
 specialLoading=true;
 if(refs.specialFeedback && !specialChats.length)refs.specialFeedback.textContent="Cargando conversaciones…";
 try{
  const data=await specialApi("owner_list");
  specialChats=Array.isArray(data.items)?data.items:[];
  setSpecialCount(countPendingSpecial(specialChats));
  renderSpecialList();
  if(refs.specialFeedback)refs.specialFeedback.textContent="";
 }catch(e){
  if(refs.specialFeedback)refs.specialFeedback.textContent=e.message||"No se pudieron consultar los chats.";
 }finally{specialLoading=false;}
}
function specialListView(){
 specialCurrent=null;
 refs.specialConversation.hidden=true;
 refs.specialListWrap.hidden=false;
 if(refs.specialFeedback)refs.specialFeedback.textContent="";
}
async function showSpecialConversation(chatId){
 if(!ownerSession()||!chatId||!refs.specialConversation)return false;
 const entry=specialChats.find(x=>x.id===chatId);
 if(!entry){
  if(refs.specialFeedback)refs.specialFeedback.textContent="La conversación no se encontró o ya no está disponible.";
  return false;
 }
 specialCurrent=chatId;
 refs.specialListWrap.hidden=true;
 refs.specialConversation.hidden=false;
 refs.specialTitle.textContent="Casa "+entry.casa_numero+" · "+entry.repartidor;
 refs.specialDetails.textContent=entry.empresa+" · "+entry.motivo+
  " · El botón de apertura requiere tu confirmación y envía un único pulso.";
 refs.specialAuthorize.hidden=true;
 refs.specialAuthorize.disabled=true;
 refs.specialSend.disabled=entry.estado!=="abierto"||new Date(entry.expires_at).getTime()<=Date.now();
 refs.specialInput.disabled=refs.specialSend.disabled;
 refs.specialStatus.textContent="Cargando mensajes…";
 await readSpecialConversation();
 return true;
}
async function readSpecialConversation(){
 const current=specialCurrent;
 if(!ownerSession()||!current||specialReading||!specialSelected||!opened)return;
 specialReading=true;
 try{
  const data=await specialApi("owner_read",{chat_id:current});
  if(current!==specialCurrent)return;
  renderSpecialMessages(data.messages);
  const active=data.estado==="abierto" &&
   specialChats.some(c=>c.id===current&&new Date(c.expires_at).getTime()>Date.now());
  const authorized=!!data.autorizado_at;
  refs.specialAuthorize.hidden=!active||authorized;
  refs.specialAuthorize.disabled=!active||authorized||specialAuthorizing;
  refs.specialInput.disabled=!active;
  refs.specialSend.disabled=!active;
  refs.specialStatus.textContent=authorized?
   "✅ Sistema Admin emitió la orden de apertura. El repartidor tiene 7 minutos para reportar su salida; el portón NO se mantiene abierto. "+
     (data.salida_reportada_at?"Salida declarada registrada.":"Verifica físicamente la apertura y el paso libre."):
    active?"Puedes conversar y, si decides permitir la entrada, pulsar «Abrir portón» después de revisar la solicitud.":"Conversación finalizada.";
  const c=specialChats.find(c=>c.id===current);
  if(c)c.last_owner_read_at=new Date().toISOString();
  setSpecialCount(countPendingSpecial(specialChats));
 }catch(e){
  if(current===specialCurrent)refs.specialStatus.textContent=e.message||"No se pudieron obtener los mensajes.";
 }finally{specialReading=false;}
}
async function replySpecialConversation(event){
 event?.preventDefault();
 if(!ownerSession()||!specialCurrent||specialSending)return;
 const current=specialCurrent,mensaje=refs.specialInput.value.trim();
 if(!mensaje)return;
 specialSending=true;refs.specialSend.disabled=true;
 try{
  const data=await specialApi("owner_reply",{chat_id:current,mensaje});
  if(current!==specialCurrent)return;
  refs.specialInput.value="";
  renderSpecialMessages(data.messages);
  refs.specialStatus.textContent="Mensaje enviado al repartidor.";
 }catch(e){
  refs.specialStatus.textContent=e.message||"No se pudo responder.";
 }finally{
  specialSending=false;
  if(current===specialCurrent && new Date(specialChats.find(c=>c.id===current)?.expires_at).getTime()>Date.now())
   refs.specialSend.disabled=false;
 }
}
async function authorizeSpecialConversation(){
 if(!ownerSession()||!specialCurrent||specialAuthorizing||!refs.specialAuthorize)return;
 const current=specialCurrent;
 const c=specialChats.find(x=>x.id===current);
 if(!c||c.estado!=="abierto"||new Date(c.expires_at).getTime()<=Date.now()||c.autorizado_at){
  refs.specialStatus.textContent="Este chat no admite una nueva apertura. Actualiza la conversación.";
  return;
 }
 const confirmed=window.confirm(
  "¿Enviar una orden de APERTURA del portón vehicular para casa "+c.casa_numero+
  " ("+c.empresa+")?\n\nSolo se enviará un pulso; el portón NO se mantendrá abierto 7 minutos."+
  "\n\nVerifica antes que el paso esté libre y que quieras autorizar esta entrada."
 );
 if(!confirmed)return;
 specialAuthorizing=true;
 refs.specialAuthorize.disabled=true;
 refs.specialStatus.textContent="Solicitando la apertura al ESP32…";
 try{
  if(typeof sb==="undefined")throw Error("No hay conexión con Supabase.");
  const {data,error}=await sb.rpc("portero_owner_autorizar",{p_chat_id:current});
  if(error||!data?.ok)throw Error(error?.message||"No se pudo emitir la orden de apertura.");
  if(current!==specialCurrent)return;
  const found=specialChats.find(x=>x.id===current);
  if(found)found.autorizado_at=data.autorizado_at||new Date().toISOString();
  refs.specialAuthorize.hidden=true;
  refs.specialStatus.textContent="✅ "+(data.ya_autorizado?"Apertura ya autorizada anteriormente.":"Orden de apertura enviada.")+
   " Confirma que el portón haya abierto físicamente. Los 7 minutos son para reportar la salida; no mantiene el portón abierto.";
  await readSpecialConversation();
 }catch(e){
  if(current===specialCurrent)
   refs.specialStatus.textContent="No se completó la apertura: "+(e?.message||"Error de conexión. Revisa el estado del portón.");
 }finally{
  specialAuthorizing=false;
  if(current===specialCurrent&&!refs.specialAuthorize.hidden){
   refs.specialAuthorize.disabled=false;
  }
 }
}
async function closeSpecialConversation(){
 if(!ownerSession()||!specialCurrent)return;
 if(!window.confirm("¿Finalizar este chat? El repartidor ya no podrá enviar mensajes."))return;
 try{
  await specialApi("owner_close",{chat_id:specialCurrent});
  specialListView();
  await loadSpecialChats();
 }catch(e){refs.specialStatus.textContent=e.message||"No se pudo finalizar la conversación.";}
}
function stopSpecialPolling(){
 if(specialPolling)clearInterval(specialPolling);
 specialPolling=null;
}
function startSpecialPolling(){
 stopSpecialPolling();
 specialPolling=setInterval(async()=>{
  if(!opened||!specialSelected||!ownerSession())return;
  if(specialCurrent)await readSpecialConversation();
  else await loadSpecialChats();
 },5000);
}
async function openSpecialTab(chatId=null){
 if(!ownerSession())return false;
 await loadSpecialChats();
 if(chatId)return await showSpecialConversation(chatId);
 specialListView();
 return true;
}

function restoreChat(){
 const panel=document.getElementById("chatPanel");
 if(!panel||!chatOriginalParent)return;
 if(typeof cerrarChatFlotante==="function")cerrarChatFlotante();
 panel.classList.remove("ia-embedded-chat");
 try{
  if(chatOriginalNext?.parentNode===chatOriginalParent)chatOriginalParent.insertBefore(panel,chatOriginalNext);
  else chatOriginalParent.appendChild(panel);
 }finally{chatOriginalParent=null;chatOriginalNext=null;}
}
async function switchTab(target,conversationToOpen=null){
 if(!opened||!refs.chatHost||chatLoading)return false;
 const chat=target==="chat",special=target==="special"&&ownerSession();
 if(target==="special"&&!special)return false;
 chatSelected=chat;specialSelected=special;
 if(!special)stopSpecialPolling();
 refs.aiTab.setAttribute("aria-selected",String(!chat&&!special));
 refs.chatTab.setAttribute("aria-selected",String(chat));
 if(refs.specialTab)refs.specialTab.setAttribute("aria-selected",String(special));
 const standard=!chat&&!special;
 refs.aiToolbar.hidden=!standard;
 refs.status.hidden=!standard;
 refs.messages.hidden=!standard;
 refs.compose.hidden=!standard;
 refs.chatHost.hidden=!chat;
 if(refs.specialHost)refs.specialHost.hidden=!special;
 if(special){
  if(typeof cerrarChatFlotante==="function")cerrarChatFlotante();
  refreshChatTab();
  const ok=await openSpecialTab(conversationToOpen);
  startSpecialPolling();
  return ok;
 }
 if(chat){
  if(typeof abrirChatFlotante!=="function"||typeof cerrarChatFlotante!=="function"){
   refs.chatHost.textContent="El chat privado no está disponible en esta sesión.";
   return false;
  }
  const panel=document.getElementById("chatPanel");
  if(!panel){refs.chatHost.textContent="No se encontró el módulo de mensajes.";return false;}
  if(!chatOriginalParent){chatOriginalParent=panel.parentNode;chatOriginalNext=panel.nextSibling;}
  refs.chatHost.appendChild(panel);
  panel.classList.add("ia-embedded-chat");
  chatLoading=true;
  try{
   await abrirChatFlotante(conversationToOpen);
   return true;
  }catch(err){
   node("p",{className:"ia-chat-error",text:"No se pudo abrir el chat: "+String(err?.message||"inténtalo de nuevo.")},refs.chatHost);
   return false;
  }finally{chatLoading=false;refreshChatTab();}
 }
 if(typeof cerrarChatFlotante==="function")cerrarChatFlotante();
 refreshChatTab();
 return true;
}

function starters(){
 const wrap=node('div',{className:'ia-starters'},refs.messages);
 const own=typeof profile!=='undefined'&&profile?.rol==='residente';
 const questions=own?['Quiero reservar el portón','Cancelar mi reservación','¿Cuánto debo?','Mis pagos']:
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

function reservationWizard(parent,config){
 const mode=config.mode;
 const wrap=node("div",{className:"ia-reserva-wizard"},parent);
 const title=node("strong",{text:mode==="create"?"📅 Solicitar reservación":"🚫 Cancelar mi reservación"},wrap);
 node("p",{text:mode==="create"?
  "Elige fecha y horario del mismo día. Administración debe aprobar tu solicitud.":
  "Selecciona una de tus reservaciones. La cancelación requiere tu confirmación."},wrap);
 const error=node("p",{className:"ia-reserva-feedback",text:""},wrap);
 error.setAttribute("role","status");
 if(mode==="create"){
  const field=(name,type,label,val)=>{
   const holder=node("label",{className:"ia-reserva-field"},wrap);
   node("span",{text:label},holder);
   const input=node("input",{type},holder);
   input.type=type;input.value=val||"";
   input.setAttribute("aria-label",label);
   input.required=true;
   input.addEventListener("change",()=>{requestId=crypto.randomUUID();error.textContent="";});
   return input;
  };
  let requestId=crypto.randomUUID();
  const fecha=field("fecha","date","Fecha",/^\d{4}-\d{2}-\d{2}$/.test(config.suggested_date||"")?config.suggested_date:"");
  const inicio=field("inicio","time","Hora de inicio","");
  const fin=field("fin","time","Hora de fin","");
  const label=node("label",{className:"ia-reserva-field"},wrap);
  node("span",{text:"Evento o motivo (opcional)"},label);
  const notas=node("input",{type:"text"},label);
  notas.maxLength=300;notas.placeholder="Ej. Reunión familiar";
  notas.addEventListener("input",()=>{requestId=crypto.randomUUID();});
  const occupied=node("div",{className:"ia-reserva-occupied"},wrap);
  const actions=node("div",{className:"ia-reserva-actions"},wrap);
  const available=node("button",{type:"button",text:"Revisar disponibilidad"},actions);
  available.onclick=async()=>{
   if(!fecha.value){error.textContent="Selecciona primero una fecha.";return;}
   available.disabled=true;error.textContent="Consultando horarios…";
   try{
    const r=await call({kind:"reservation_availability",fecha:fecha.value});
    const slots=Array.isArray(r.ocupados)?r.ocupados:[];
    occupied.textContent=slots.length?
     "Horarios ocupados o pendientes: "+slots.map(x=>x.inicio+"–"+x.fin).join(", "):
     "Sin horarios ocupados o pendientes registrados para ese día.";
    error.textContent="El servidor comprobará nuevamente la disponibilidad al enviar.";
   }catch(e){error.textContent=e.message;}finally{available.disabled=false;}
  };
  const save=node("button",{type:"button",className:"ia-reserva-primary",text:"Solicitar reservación"},actions);
  save.onclick=async()=>{
   if(!fecha.value||!inicio.value||!fin.value||fin.value<=inicio.value){
    error.textContent="Completa la fecha y el horario. La hora final debe ser posterior a la inicial.";return;
   }
   if(!window.confirm("¿Solicitar el portón para "+fecha.value+" de "+inicio.value+" a "+fin.value+"? Quedará pendiente de aprobación."))return;
   save.disabled=true;available.disabled=true;error.textContent="Guardando solicitud…";
   try{
    const r=await call({kind:"reservation_create",fecha:fecha.value,inicio:inicio.value,
     fin:fin.value,notas:notas.value.trim(),solicitud_id:requestId});
    if(!r.result?.ok)throw Error("No se confirmó la reservación.");
    error.textContent="✓ Solicitud enviada y guardada.";
    addMessage("assistant","Reservación solicitada para "+fecha.value+" de "+inicio.value+" a "+fin.value+
      ". Estado: pendiente de aprobación. Administración revisará la solicitud.");
    wrap.querySelectorAll("input,button").forEach(x=>x.disabled=true);
    if(typeof loadAll==="function")void loadAll();
   }catch(e){error.textContent="No se pudo reservar: "+e.message;save.disabled=false;available.disabled=false;}
  };
  return;
 }
 if(mode==="cancel"){
  if(!Array.isArray(config.items)||!config.items.length){
   node("p",{text:"No tienes reservaciones propias pendientes de cancelación."},wrap);return;
  }
  const label=node("label",{className:"ia-reserva-field"},wrap);
  node("span",{text:"Mis reservaciones"},label);
  const select=node("select",{},label);
  for(const item of config.items){
   const o=node("option",{text:item.fecha+" · "+item.inicio+"–"+item.fin+" · "+item.estado+
    (item.notas?" · "+item.notas:"")},select);
   o.value=item.id;
  }
  const cancel=node("button",{type:"button",className:"ia-reserva-danger",text:"Cancelar reservación elegida"},wrap);
  cancel.onclick=async()=>{
   const item=config.items.find(x=>x.id===select.value);
   if(!item)return;
   if(!window.confirm("¿Cancelar tu reservación del "+item.fecha+" de "+item.inicio+
     " a "+item.fin+"? Esta acción no se puede deshacer."))return;
   cancel.disabled=true;select.disabled=true;error.textContent="Cancelando…";
   try{
    const result=await call({kind:"reservation_cancel",reservacion_id:item.id});
    if(!result.result?.ok)throw Error("No se confirmó la cancelación.");
    error.textContent="✓ Reservación cancelada.";
    addMessage("assistant","Tu reservación del "+item.fecha+" a las "+item.inicio+
      " fue cancelada correctamente. Estado: cancelada.");
    const opt=[...select.options].find(o=>o.value===item.id);
    if(opt)opt.remove();
    config.items=config.items.filter(x=>x.id!==item.id);
    if(!config.items.length){select.disabled=true;cancel.disabled=true;}
    else{select.disabled=false;cancel.disabled=false;}
    if(typeof loadAll==="function")void loadAll();
   }catch(e){error.textContent="No se pudo cancelar: "+e.message;cancel.disabled=false;select.disabled=false;}
  };
 }
}

function addMessage(role,text,extras={}){
 const container=node("div",{className:"ia-message ia-"+role},refs.messages);
 node("div",{className:"ia-message-text",text:String(text||"")},container);
 if(Array.isArray(extras.table)&&extras.table.length){
  const tableWrap=node("div",{className:"ia-table-wrap"},container);
  const table=node("table",{},tableWrap);
  const keys=Object.keys(extras.table[0]).slice(0,6);
  const head=node("thead",{},table),hrow=node("tr",{},head);
  const controlHeaders={numero_control:"Número de control",numero_casa:"Número de casa",
   estado:"Estado",bloqueo_owner:"Bloqueo Sistema Admin"};
  for(const k of keys)node("th",{text:extras.tableType==="controles"?(controlHeaders[k]||k):k},hrow);
  const tbody=node("tbody",{},table);
  for(const item of extras.table.slice(0,extras.tableType==="controles"?100:25)){
   const r=node("tr",{},tbody);
   for(const k of keys)node("td",{text:String(item?.[k]??"—").slice(0,150)},r);
  }
 }
 if(extras.reservation && typeof extras.reservation==="object"){
  reservationWizard(container,extras.reservation);
 }
 if(extras.open_chat){
  const openChat=node("button",{type:"button",className:"ia-open-chat",text:"💬 Abrir chat privado"},container);
  openChat.onclick=()=>switchTab("chat");
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
 if(error){
  let detail=error?.message||"Error de conexión con el asistente.";
  // Mostrar errores JSON de validación de horario/casa enviados por el backend.
  if(error?.context && typeof error.context.json==="function"){
   try{const body=await error.context.clone().json();detail=body?.error||detail;}catch(_){}
  }
  throw Error(String(detail).slice(0,240));
 }
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
async function open(startTab="ia",selectedConversationId=null){
 opened=!opened;
 refs.panel.hidden=!opened;
 refs.launch.setAttribute("aria-expanded",String(opened));
 document.body.classList.toggle("ia-open",opened);
 if(opened){
  viewport();
  // Si existe un chat pendiente, abrirlo directamente, sin cargar la IA
  // ni esperar llamadas al modelo. El mensaje real se muestra primero.
  if(refs.specialTab)refs.specialTab.hidden=!ownerSession();
  if(refs.tabs)refs.tabs.classList.toggle("ia-tabs-three",ownerSession());
  if(startTab==="chat"||startTab==="special")return await switchTab(startTab,selectedConversationId);
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
  await switchTab("ia");
  refreshChatTab();
  if(window.matchMedia("(min-width:701px)").matches)refs.text.focus();
 }else{
  restoreChat();
  stopSpecialPolling();
  specialSelected=false;specialCurrent=null;chatSelected=false;
  if("speechSynthesis" in window)window.speechSynthesis.cancel();
  try{recognizer?.stop();}catch{}
  refs.launch.focus();
  // Al salir del chat inicial se muestra Control Digital, sin quitar el
  // pendiente: volverá a aparecer al iniciar sesión si no respondió.
  window.residentePendientesAlCerrarChatInicial?.();
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
 refs.specialBadge=node("span",{className:"ia-special-badge"},refs.launch);
 refs.specialBadge.hidden=true;
 refs.panel=node("section",{className:"ia-panel"},mount);
 refs.panel.hidden=true;refs.panel.setAttribute("aria-label","Asistente Residencial IA");
 refs.panel.setAttribute("role","dialog");refs.panel.setAttribute("aria-modal","true");
 const originalChatButton=document.getElementById("chatFloatingBtn");
 if(originalChatButton)originalChatButton.classList.add("ia-chat-migrated");
 const head=node("header",{className:"ia-head"},refs.panel);
 const brand=node("div",{className:"ia-brand"},head);
 refs.brandAvatar=node("span",{className:"ia-avatar",text:"✦"},brand);
 const brandText=node("div",{className:"ia-brand-copy"},brand);
 refs.headTitle=node("strong",{className:"ia-head-title",text:"Asistente Residencial IA"},brandText);
 refs.headSubtitle=node("span",{className:"ia-head-subtitle",text:"Consultas seguras"},brandText);
 const close=node("button",{type:"button",className:"ia-close",text:"×",aria:"Cerrar asistente"},head);
 const tabs=node("div",{className:"ia-tabs"},refs.panel);refs.tabs=tabs;tabs.setAttribute("role","tablist");
 refs.aiTab=node("button",{type:"button",className:"ia-tab",text:"✦ Asistente",aria:"Conversar con la IA"},tabs);
 refs.chatTab=node("button",{type:"button",className:"ia-tab",text:"💬 Mensajes",aria:"Abrir chat privado"},tabs);
 refs.specialTab=node("button",{type:"button",className:"ia-tab ia-special-tab",text:"🚚 Especiales",aria:"Chats especiales de repartidores"},tabs);
 refs.specialTab.hidden=!ownerSession();
 tabs.classList.toggle("ia-tabs-three",ownerSession());
 for(const tab of [refs.aiTab,refs.chatTab,refs.specialTab])tab.setAttribute("role","tab");
 refs.aiTab.setAttribute("aria-selected","true");refs.chatTab.setAttribute("aria-selected","false");refs.specialTab.setAttribute("aria-selected","false");
 refs.aiTab.onclick=()=>switchTab("ia");refs.chatTab.onclick=()=>switchTab("chat");refs.specialTab.onclick=()=>switchTab("special");
 refs.aiToolbar=node("div",{className:"ia-top-controls"},refs.panel);
 const controls=refs.aiToolbar;
 refs.history=node("select",{aria:"Historial de conversaciones"},controls);
 const newBtn=node("button",{type:"button",text:"＋",aria:"Nueva conversación"},controls);newBtn.title="Nueva conversación";
 refs.alerts=node("button",{type:"button",text:"🔔",aria:"Alertas de IA"},controls);refs.alerts.title="Ver alertas";
 refs.config=node("button",{type:"button",text:"⚙",aria:"Configurar nombre e icono"},controls);refs.config.hidden=true;refs.config.title="Configurar IA";
 refs.status=node("p",{className:"ia-status",text:"Verificando acceso…"},refs.panel);
 refs.messages=node("div",{className:"ia-messages"},refs.panel);refs.messages.setAttribute("role","log");refs.messages.setAttribute("aria-live","polite");
 refs.chatHost=node("div",{className:"ia-chat-host"},refs.panel);refs.chatHost.hidden=true;
 refs.specialHost=node("div",{className:"ia-special-host"},refs.panel);refs.specialHost.hidden=true;
 const chatListWrap=refs.specialListWrap=node("section",{className:"ia-special-list-wrap"},refs.specialHost);
 const listHeader=node("div",{className:"ia-special-header"},chatListWrap);
 node("strong",{text:"💬 Repartidores sin autorización"},listHeader);
 const refresh=node("button",{type:"button",text:"↻ Actualizar"},listHeader);
 refresh.onclick=loadSpecialChats;
 node("p",{className:"ia-special-hint",text:"Conversaciones exclusivas de Sistema Admin. Puedes autorizar una apertura manual desde cada chat vigente."},chatListWrap);
 refs.specialFeedback=node("p",{className:"ia-special-feedback",text:""},chatListWrap);
 refs.specialList=node("div",{className:"ia-special-list"},chatListWrap);
 refs.specialConversation=node("section",{className:"ia-special-conversation"},refs.specialHost);
 refs.specialConversation.hidden=true;
 const conversationHead=node("div",{className:"ia-special-header"},refs.specialConversation);
 const back=node("button",{type:"button",text:"← Chats"},conversationHead);back.onclick=()=>{specialListView();loadSpecialChats();};
 refs.specialTitle=node("strong",{text:"Repartidor"},conversationHead);
 refs.specialDetails=node("p",{className:"ia-special-hint"},refs.specialConversation);
 refs.specialMessages=node("div",{className:"ia-special-messages"},refs.specialConversation);
 refs.specialMessages.setAttribute("role","log");refs.specialMessages.setAttribute("aria-live","polite");
 const specialForm=node("form",{className:"ia-special-compose"},refs.specialConversation);
 specialForm.onsubmit=replySpecialConversation;
 refs.specialInput=node("textarea",{aria:"Respuesta al repartidor"},specialForm);
 refs.specialInput.maxLength=600;refs.specialInput.rows=2;refs.specialInput.required=true;refs.specialInput.placeholder="Escribe tu respuesta…";
 const specialActions=node("div",{className:"ia-special-actions"},specialForm);
 refs.specialSend=node("button",{type:"submit",text:"Responder"},specialActions);
 refs.specialAuthorize=node("button",{type:"button",className:"ia-special-authorize",text:"🔓 Abrir portón"},specialActions);
 refs.specialAuthorize.hidden=true;
 refs.specialAuthorize.disabled=true;
 refs.specialAuthorize.title="Autorizar manualmente un único pulso de apertura (no 7 minutos abierto)";
 refs.specialAuthorize.onclick=authorizeSpecialConversation;
 const endSpecial=node("button",{type:"button",text:"Finalizar chat"},specialActions);endSpecial.onclick=closeSpecialConversation;
 refs.specialStatus=node("p",{className:"ia-special-feedback"},refs.specialConversation);
 refs.compose=node("div",{className:"ia-compose"},refs.panel);
 const compose=refs.compose;
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
 window.setInterval(()=>{if(opened)refreshChatTab();},4500);
 window.addEventListener("portero-owner-chat-unread",e=>setSpecialCount(e?.detail?.count));
 setSpecialCount(0);
}
window.aiInitialize=init;
window.iaAbrirChatEspecial=async function(chatId=null){
 if(!ownerSession())return false;
 if(!mount)init();
 if(!mount)return false;
 if(!opened)return await open("special",chatId);
 return await switchTab("special",chatId);
};
// Abrir la conversación exacta desde el recordatorio de pendientes.
// Nunca envía mensajes automáticamente: el residente debe pulsar Enviar.
window.iaAbrirChatPendiente=async function(conversationId){
 if(!mount)init();
 if(!opened)return await open("chat",conversationId||null);
 return await switchTab("chat",conversationId||null);
};
if(!document.getElementById("app")?.classList.contains("hidden"))init();
})();