/* Centro único de solicitudes. Reutiliza formularios, permisos y acciones originales.
   No modifica los RPC de Supabase ni crea permisos nuevos. */
(function(){
 "use strict";
 let ready=false,selected="",refreshing=false;
 const panels=new Map(),buttons=new Map();
 const roles={
  registros:["owner","admin"],reservaciones:["owner","admin","residente"],
  permanentes:["owner","residente"],huellas:["owner","admin","residente"],
  entradas:["owner","residente"],comunicacion:["residente"],
  empresas:["owner"]
 };
 const labels={
  registros:"👥 Registros",reservaciones:"📅 Reservaciones",
  permanentes:"🔑 Códigos permanentes",huellas:"🖐️ Huellas",
  entradas:"🚪 Acceso y repartidores",comunicacion:"💬 Comunicación",
  empresas:"🛵 Permisos de empresas"
 };
 function allowed(id){
  const rol=typeof profile!=="undefined"?profile?.rol:null;
  return !!rol && roles[id].includes(rol) &&
   !(rol==="owner" && typeof ownerPanelMode!=="undefined" &&
    ownerPanelMode!=="owner" && ["permanentes","entradas","empresas"].includes(id));
 }
 function card(title,description){
  const el=document.createElement("div");el.className="card su-info";
  const h=document.createElement("h3");h.textContent=title;el.appendChild(h);
  if(description){const p=document.createElement("p");p.className="muted";p.textContent=description;el.appendChild(p);}
  return el;
 }
 function move(id,element){
  if(element&&panels.has(id))panels.get(id).appendChild(element);
 }
 function link(source,label){
  if(!source||source.querySelector(".su-redirect"))return;
  const btn=document.createElement("button");
  btn.type="button";btn.className="primary su-redirect";
  btn.textContent=label||"📝 Ir a Solicitudes";
  btn.addEventListener("click",()=>window.solicitudesIr());
  source.insertBefore(btn,source.firstElementChild?.nextSibling||null);
 }
 function init(){
  if(ready)return true;
  const root=document.getElementById("solicitudes");
  if(!root)return false;
  const original=root.querySelector(".card");
  const hub=document.createElement("div");hub.id="solicitudesHub";
  const desc=document.createElement("p");desc.className="muted";
  desc.textContent="Aquí se presentan las solicitudes y permisos según tu rol. Aprobar, rechazar o responder utiliza las mismas autorizaciones de Supabase; ninguna solicitud abre el portón por sí sola.";
  root.appendChild(desc);
  const nav=document.createElement("div");nav.className="su-tabs";nav.setAttribute("role","tablist");
  nav.setAttribute("aria-label","Categorías de solicitudes");hub.appendChild(nav);
  const content=document.createElement("div");content.className="su-content";hub.appendChild(content);
  for(const id of Object.keys(roles)){
   const button=document.createElement("button");button.type="button";button.className="su-tab";
   button.setAttribute("role","tab");button.setAttribute("aria-selected","false");button.textContent=labels[id];
   button.onclick=()=>choose(id);nav.appendChild(button);buttons.set(id,button);
   const panel=document.createElement("div");panel.className="su-panel";panel.id="solicitudes-"+id;
   panel.setAttribute("role","tabpanel");panel.hidden=true;content.appendChild(panel);panels.set(id,panel);
  }
  root.appendChild(hub);

  if(original){original.classList.add("adminOnly");move("registros",original);}
  // Las solicitudes de reservaciones y sus acciones se atienden solo aquí.
  const reservas=document.getElementById("reservaciones");
  if(reservas){
   const form=reservas.querySelector(".card:not(.adminOnly)");
   const table=document.getElementById("reservasRows")?.closest(".card");
   move("reservaciones",form);move("reservaciones",table);
   link(reservas,"📝 Gestionar reservaciones en Solicitudes");
  }

  // Las autorizaciones de código permanente continúan bajo el control de Sistema Admin.
  const visita=document.getElementById("visitas");
  move("permanentes",document.getElementById("vpPermanentList")?.closest(".card"));
  move("permanentes",document.getElementById("vpPermanentAdminList")?.closest(".card"));
  link(visita,"📝 Ver solicitudes de códigos permanentes");

  // El residente mantiene su consentimiento y la captura real sigue pendiente de R503Pro.
  move("huellas",document.getElementById("bioMisSolicitudes")?.closest(".card.residentOnly"));
  const bioTabla=document.getElementById("bioAdminSolicitudes")?.closest(".table");
  if(bioTabla){
   const bioCard=card("Solicitudes de huellas recibidas","Solo se registra la petición. Una huella no se activa sin captura física y comprobación del lector R503Pro.");
   bioCard.classList.add("adminOnly");
   const refresh=document.createElement("button");refresh.type="button";refresh.textContent="↻ Actualizar huellas";
   refresh.addEventListener("click",()=>window.cargarSolicitudesHuellas?.());bioCard.appendChild(refresh);
   bioCard.appendChild(bioTabla);move("huellas",bioCard);
   const old=document.querySelector("#biometrico .card.adminOnly");
   if(old){const title=[...old.querySelectorAll("h3")].find(x=>x.textContent?.trim()==="Solicitudes recibidas");title?.remove();
    [...old.querySelectorAll("p")].find(x=>x.textContent?.includes("Cada residente solicita sus huellas"))?.remove();
    [...old.querySelectorAll("button")].find(x=>x.getAttribute("onclick")==="cargarSolicitudesHuellas()")?.remove();}
  }
  link(document.getElementById("biometrico"),"📝 Solicitar o revisar huellas");

  // Accesos solicitados desde el QR: responder es una acción del residente.
  move("entradas",document.getElementById("entregasPendientes")?.closest(".card"));
  move("entradas",document.getElementById("ownerChatEspecialListaCard"));
  link(document.getElementById("entregas"),"📝 Responder solicitudes en la entrada");

  // El chat entre casas solo puede comenzar cuando el destinatario aceptó.
  const contacto=document.getElementById("comunicacion");
  const solicitudForm=document.getElementById("contactoCasa")?.closest(".card");
  move("comunicacion",solicitudForm);
  move("comunicacion",document.getElementById("contactoSolicitudesEntrantes")?.closest(".card"));
  move("comunicacion",document.getElementById("contactoSolicitudesLista")?.closest(".card"));
  move("comunicacion",document.getElementById("contactoChatPanel"));
  link(contacto,"📝 Gestionar permisos de comunicación");

  // Solo Sistema Admin gestiona empresas; la lista NO prueba la identidad del repartidor.
  const empresas=document.getElementById("ownerEmpresasReparto");
  if(empresas)empresas.classList.add("ownerOnly");
  move("empresas",empresas);
  link(document.getElementById("ownerPanel"),"📝 Revisar permisos y solicitudes");

  ready=true;
  return true;
 }
 function count(id){
  try{
   if(id==="registros")return profiles.filter(x=>x.rol==="residente"&&x.estado_registro==="pendiente").length;
   if(id==="reservaciones")return reservas.filter(x=>x.estado==="pendiente"&&(profile?.rol!=="residente" || String(x.creado_por)===String(user?.id))).length;
   if(id==="huellas")return bioSolicitudesActuales.filter(x=>x.estado==="pendiente_captura").length;
   if(id==="permanentes"){
    const box=document.getElementById(profile?.rol==="owner"?"vpPermanentAdminList":"vpPermanentList");
    return box?.querySelectorAll('.vpPermanentEntry[data-status="pending"]').length||0;
   }
   if(id==="entradas"){
    if(profile?.rol==="residente")return entregas.filter(x=>x.estado==="esperando"&&new Date(x.expires_at)>new Date()).length;
    return chatsEspecialesOwner.filter(x=>x.estado==="abierto"&&new Date(x.expires_at)>new Date()).length;
   }
   if(id==="comunicacion")return solicitudesContacto.filter(x=>x.estado==="pendiente"&&String(x.destino_casa_id)===String(profile?.casa_id)).length;
  }catch(e){return 0;}
  return 0;
 }
 function display(){
  if(!ready||!profile)return;
  const ids=[...panels.keys()].filter(allowed);
  if(!ids.includes(selected))selected=ids.includes("registros")?"registros":ids[0]||"";
  for(const [id,panel] of panels){
   const btn=buttons.get(id),visible=allowed(id);
   btn.hidden=!visible;
   const active=id===selected&&visible;
   btn.setAttribute("aria-selected",String(active));btn.classList.toggle("su-selected",active);
   btn.textContent=labels[id]+(visible&&count(id)>0?" ("+Math.min(count(id),99)+(count(id)>99?"+":"")+")":"");
   panel.hidden=!active;
  }
  const badge=document.getElementById("solicitudesMenuCount");
  if(badge){
   const total=ids.reduce((n,id)=>n+count(id),0);
   badge.textContent=total>99?"99+":String(total);
   badge.hidden=!total;
  }
 }
 function choose(id){
  if(!ready||!allowed(id))return;
  selected=id;display();
 }
 async function refresh(){
  if(refreshing||!profile||!ready)return;
  refreshing=true;
  try{
   const tasks=[];
   if(["owner","admin","residente"].includes(profile.rol) && typeof cargarSolicitudesHuellas==="function")
    tasks.push(cargarSolicitudesHuellas());
   if(["owner","residente"].includes(profile.rol) && (profile.rol!=="owner"||ownerPanelMode==="owner") && typeof cargarCodigosPermanentes==="function")
    tasks.push(cargarCodigosPermanentes());
   if(profile.rol==="residente"){
    if(typeof actualizarSolicitudesEntrega==="function")tasks.push(actualizarSolicitudesEntrega());
    if(typeof cargarContactoResidenteDatos==="function")tasks.push(cargarContactoResidenteDatos());
   }
   if(profile.rol==="owner"&&ownerPanelMode==="owner"){
    if(typeof cargarChatsEspecialesOwner==="function")tasks.push(cargarChatsEspecialesOwner());
    if(typeof cargarEmpresasReparto==="function")tasks.push(cargarEmpresasReparto());
   }
   await Promise.allSettled(tasks);
  }finally{refreshing=false;display();}
 }
 window.solicitudesUnificadasAbrir=function(tab){
  if(!init())return;
  if(tab&&allowed(tab))selected=tab;
  display();
  void refresh();
 };
 window.solicitudesUnificadasActualizar=function(){if(init())display();};
 window.solicitudesIr=function(tab){
  if(!profile||!["owner","admin","residente"].includes(profile.rol))return;
  show("solicitudes");
  if(tab&&allowed(tab))choose(tab);
 };
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
 else init();
})();
