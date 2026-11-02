/* Avisos automáticos para residentes — reutiliza datos protegidos por RLS.
 * Las notificaciones pendientes desaparecen al abrir y leer la bandeja.
 * Los chats siguen pendientes hasta que el residente ENVÍA una respuesta.
 * Nunca se realizan aperturas de portón ni cambios en pagos o accesos.
 */
(function(){
"use strict";
let root=null,card=null,bubble=null,closeButton=null,lastSignature="",minimizedSignature="";
let isExpanded=false,updateTimer=null,openingChat=false;
// Cada mensaje pendiente se abre una sola vez por sesión, evitando un bucle
// si el residente cierra el chat sin responder. Al iniciar de nuevo, se abrirá.
let autoChatReady=false,autoChatOpening=false,initialChatNeedsControl=false;
let currentResidentId=null;
const shownMessagesThisSession=new Set();

function obtenerPendientesResidente({uid,rol,conversaciones,mensajes,notificaciones:avisos,lecturas}){
 const empty={avisos:[],chats:[],signature:""};
 if(!uid||rol!=="residente")return empty;
 const readIds=new Set((lecturas||[]).map(x=>String(x.notificacion_id)));
 const unread=(avisos||[]).filter(x=>x?.id&&!readIds.has(String(x.id)) &&
    (x.user_id==null||String(x.user_id)===String(uid)));
 const lastByConversation=new Map();
 for(const item of mensajes||[]){
  if(!item?.conversacion_id||!item.id)continue;
  const id=String(item.conversacion_id);
  const previous=lastByConversation.get(id);
  const d=Date.parse(item.created_at||"")||0;
  const previousDate=Date.parse(previous?.created_at||"")||0;
  if(!previous||d>previousDate||(d===previousDate&&String(item.id)>String(previous.id))){
    lastByConversation.set(id,item);
  }
 }
 const chats=[];
 for(const conv of conversaciones||[]){
  if(String(conv.residente_id)!==String(uid))continue;
  const destino=conv.destinatario_rol||"general";
  // El historial general antiguo es solo lectura: no exigir una respuesta imposible.
  if(!["owner","admin"].includes(destino))continue;
  const last=lastByConversation.get(String(conv.id));
  if(!last||String(last.autor_id)===String(uid))continue;
  chats.push({id:String(conv.id),mensajeId:String(last.id),
   de:destino==="owner"?"Sistema Admin":"Administración",
   fecha:last.created_at||"",vistaPrevia:String(last.mensaje||"").slice(0,90)});
 }
 chats.sort((a,b)=>(Date.parse(b.fecha)||0)-(Date.parse(a.fecha)||0));
 const signature=[
  ...unread.map(x=>"n:"+String(x.id)).sort(),
  ...chats.map(x=>"c:"+x.id+":"+x.mensajeId).sort()
 ].join("|");
 return {avisos:unread,chats,signature};
}

function isResident(){
 return typeof user!=="undefined" && !!user?.id &&
        typeof profile!=="undefined" && profile?.rol==="residente" &&
        !document.getElementById("app")?.classList.contains("hidden");
}
function pendingState(){
 if(!isResident())return {avisos:[],chats:[],signature:""};
 return obtenerPendientesResidente({
  uid:user.id,rol:profile.rol,
  conversaciones:typeof chatConversaciones!=="undefined"?chatConversaciones:[],
  mensajes:typeof chatMensajes!=="undefined"?chatMensajes:[],
  notificaciones:typeof notificaciones!=="undefined"?notificaciones:[],
  lecturas:typeof notificacionLecturas!=="undefined"?notificacionLecturas:[]
 });
}
function element(tag,cls,text,parent){
 const el=document.createElement(tag);el.className=cls||"";
 if(text!==undefined)el.textContent=text;
 if(parent)parent.appendChild(el);
 return el;
}
function init(){
 if(root||!isResident())return;
 root=element("aside","rp-pending-root","",document.body);
 root.setAttribute("aria-label","Pendientes de comunicación");
 bubble=element("button","rp-pending-bubble","",root);
 bubble.type="button";bubble.setAttribute("aria-label","Ver avisos pendientes");
 bubble.addEventListener("click",()=>{isExpanded=!isExpanded;if(isExpanded)minimizedSignature="";draw(pendingState());});
 card=element("section","rp-pending-card","",root);
 card.setAttribute("role","region");
 card.setAttribute("aria-label","Tienes mensajes o notificaciones pendientes");
 bubble.hidden=true;card.hidden=true;
}
function draw(state){
 if(!root)return;
 const total=state.avisos.length+state.chats.length;
 if(!total){root.hidden=true;isExpanded=false;lastSignature="";minimizedSignature="";return;}
 root.hidden=false;
 const changed=state.signature!==lastSignature;
 if(changed){
  lastSignature=state.signature;
  // El primer aviso y cada nuevo pendiente aparecen automáticamente.
  if(minimizedSignature!==state.signature)isExpanded=true;
 }
 bubble.textContent="🔔 "+total+" pendiente"+(total===1?"":"s");
 bubble.setAttribute("aria-label",total+" pendientes. "+(isExpanded?"Ocultar detalle":"Mostrar detalle"));
 bubble.hidden=isExpanded;
 card.hidden=!isExpanded;
 if(!isExpanded)return;
 card.replaceChildren();
 const header=element("div","rp-pending-header","",card);
 const headerText=element("div","rp-pending-title","",header);
 element("strong","", "🔔 Tienes pendientes",headerText);
 element("small","", "Se mantendrán hasta que los revises o respondas.",headerText);
 closeButton=element("button","rp-pending-close","−",header);
 closeButton.type="button";
 closeButton.setAttribute("aria-label","Minimizar recordatorio");
 closeButton.title="Minimizar (no marca como leído)";
 closeButton.onclick=()=>{
  minimizedSignature=state.signature;isExpanded=false;draw(state);
 };
 if(state.chats.length){
  const block=element("div","rp-pending-group","",card);
  element("strong","rp-pending-group-title","💬 "+state.chats.length+" chat"+(state.chats.length===1?" necesita":"s necesitan")+" respuesta",block);
  for(const chat of state.chats.slice(0,3)){
   const row=element("div","rp-pending-entry","",block);
   const info=element("div","rp-pending-entry-text","",row);
   element("b","",chat.de,info);
   element("span","",chat.vistaPrevia||"Tienes un mensaje pendiente de responder.",info);
   const btn=element("button","rp-pending-action","Responder",row);
   btn.type="button";
   btn.onclick=async()=>{
    if(openingChat)return;
    openingChat=true;
    try{
     if(typeof window.iaAbrirChatPendiente==="function")await window.iaAbrirChatPendiente(chat.id);
     else if(typeof abrirChatFlotante==="function")await abrirChatFlotante(chat.id);
    }catch(err){console.warn("No se pudo abrir el chat pendiente:",err);}
    finally{openingChat=false;}
   };
  }
  if(state.chats.length>3)element("small","rp-pending-more","Y "+(state.chats.length-3)+" conversación(es) más",block);
 }
 if(state.avisos.length){
  const block=element("div","rp-pending-group","",card);
  element("strong","rp-pending-group-title","🔔 "+state.avisos.length+" notificación"+(state.avisos.length===1?" nueva":"es nuevas"),block);
  const latest=state.avisos[0];
  element("div","rp-pending-preview",String(latest.titulo||"Tienes una notificación nueva"),block);
  const button=element("button","rp-pending-action rp-pending-notification","Ver notificaciones",block);
  button.type="button";
  button.onclick=()=>{if(typeof show==="function")show("notificaciones");};
 }
 element("small","rp-pending-foot","Puedes minimizar el recordatorio sin marcar nada como leído.",card);
}

function syncResident(){
 const uid=isResident()?String(user.id):null;
 if(uid!==currentResidentId){
  currentResidentId=uid;
  shownMessagesThisSession.clear();
  autoChatReady=false;autoChatOpening=false;initialChatNeedsControl=false;
 }
}
async function abrirConversacionPendiente(state){
 if(!autoChatReady||autoChatOpening||!isResident()||document.hidden||
   document.body.classList.contains("ia-open"))return false;
 const next=(state.chats||[]).find(c=>!shownMessagesThisSession.has(c.id+":"+c.mensajeId));
 if(!next)return false;
 const key=next.id+":"+next.mensajeId;
 shownMessagesThisSession.add(key);
 autoChatOpening=true;
 try{
  if(typeof window.iaAbrirChatPendiente!=="function")return false;
  return await window.iaAbrirChatPendiente(next.id)===true;
 }catch(e){
  console.warn("No se pudo abrir automáticamente la conversación pendiente:",e);
  return false;
 }finally{autoChatOpening=false;}
}

function update(){
 if(document.hidden)return;
 if(updateTimer!==null)return;
 updateTimer=window.setTimeout(()=>{
  updateTimer=null;
  syncResident();
  if(!isResident()){if(root)root.hidden=true;return;}
  init();
  const state=pendingState();
  draw(state);
  // Nuevo mensaje: abrir la conversación una sola vez por mensaje/sesión.
  if(autoChatReady&&state.chats.length)void abrirConversacionPendiente(state);
 },80);
}
window.residentePendientesIniciar=()=>{syncResident();init();update();};
window.residentePendientesAbrirChatInicial=async()=>{
 syncResident();
 if(!isResident())return false;
 autoChatReady=true;
 const state=pendingState();
 if(!state.chats.length)return false;
 const abierto=await abrirConversacionPendiente(state);
 if(abierto)initialChatNeedsControl=true;
 return abierto;
};
window.residentePendientesAlCerrarChatInicial=()=>{
 if(!initialChatNeedsControl)return;
 initialChatNeedsControl=false;
 if(!isResident())return;
 // Después del chat pendiente, mostrar cuota sin pagar ANTES de Control Digital.
 // Cerrar cualquiera de los avisos permite seguir al control sin bloquear accesos.
 if(window.residenteCuotasPendientesAbrir?.()===true)return;
 if(typeof show==="function")show("controlDigital");
};
window.residentePendientesActualizar=update;
window.addEventListener("pageshow",update);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)update();});
})();
