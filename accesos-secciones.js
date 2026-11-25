/* Historial de accesos por pestañas, siguiendo el diseño de Cuotas.
   Solo presentación: conserva las tarjetas originales, registros, permisos y eventos. */
(function(){
 "use strict";
 const sections=[
  {id:"visitas",label:"👥 Visitas registradas",roles:["residente","admin","owner"],anchors:["visitasRows"]},
  {id:"entregas",label:"🛵 Repartidores y QR",roles:["residente","admin","owner"],anchors:["entregasRows"]},
  {id:"codigos",label:"🔑 Códigos de visita",roles:["residente","admin","owner"],anchors:["vcHistorialRows"]},
  {id:"manual",label:"🚪 Accesos manuales",roles:["guardia","admin","owner"],anchors:["aPersona","accesosRows"]},
  {id:"esp32",label:"🖥️ Accesos ESP32",roles:["admin","owner"],anchors:["esp32HistoryRows"]},
  {id:"basura",label:"🚛 Camión de basura",roles:["owner"],anchors:["garbageHistoryCard"]}
 ];
 const tabs=new Map(),panels=new Map();
 let initialized=false,selected="";
 function permitted(item){return typeof profile!=="undefined" && !!profile && item.roles.includes(profile.rol);}
 function findCard(root,anchor){
  const element=document.getElementById(anchor);
  if(!element)return null;
  return [...root.children].find(node=>node.classList?.contains("card")&&node.contains(element))||null;
 }
 function render(){
  if(!initialized||typeof profile==="undefined"||!profile)return;
  const allowed=sections.filter(permitted);
  if(!allowed.some(x=>x.id===selected)){
   selected=(profile.rol==="guardia"?"manual":"visitas");
   if(!allowed.some(x=>x.id===selected))selected=allowed[0]?.id||"";
  }
  for(const item of sections){
   const allowedTab=permitted(item);
   const active=allowedTab&&selected===item.id;
   const tab=tabs.get(item.id),panel=panels.get(item.id);
   tab.hidden=!allowedTab;
   tab.setAttribute("aria-selected",String(active));
   tab.tabIndex=active?0:-1;
   tab.classList.toggle("ac-selected",active);
   panel.hidden=!active;
  }
 }
 function selectTab(id,focus=false){
  const item=sections.find(x=>x.id===id);
  if(!item||!permitted(item))return;
  selected=id;
  render();
  if(focus)tabs.get(id)?.focus();
 }
 function init(){
  if(initialized)return true;
  const root=document.getElementById("accesos");
  if(!root)return false;
  const cards=new Map();
  // Identificar tarjetas originales ANTES de moverlas, preservando nodos y eventos.
  for(const item of sections)cards.set(item.id,item.anchors.map(anchor=>findCard(root,anchor)));
  const region=document.createElement("div");
  region.id="accesosSecciones";
  const intro=document.createElement("p");
  intro.className="muted ac-intro";
  intro.textContent="Elige una categoría para consultar el historial de accesos.";
  const tabsContainer=document.createElement("div");
  tabsContainer.className="ac-tabs";
  tabsContainer.setAttribute("role","tablist");
  tabsContainer.setAttribute("aria-label","Categorías de historial de accesos");
  const content=document.createElement("div");
  content.className="ac-content";
  for(const item of sections){
   const tab=document.createElement("button");
   tab.type="button";
   tab.className="ac-tab";
   tab.textContent=item.label;
   tab.id="accesos-tab-"+item.id;
   tab.setAttribute("role","tab");
   tab.setAttribute("aria-controls","accesos-panel-"+item.id);
   tab.setAttribute("aria-selected","false");
   tab.tabIndex=-1;
   tab.onclick=()=>selectTab(item.id);
   tab.onkeydown=event=>{
    if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
    event.preventDefault();
    const available=sections.filter(permitted).map(x=>x.id);
    if(!available.length)return;
    const idx=available.indexOf(item.id);
    const next=event.key==="Home"?available[0]:
     event.key==="End"?available[available.length-1]:
     available[(idx+(event.key==="ArrowRight"?1:-1)+available.length)%available.length];
    if(next)selectTab(next,true);
   };
   tabsContainer.appendChild(tab);tabs.set(item.id,tab);
   const panel=document.createElement("div");
   panel.id="accesos-panel-"+item.id;
   panel.className="ac-panel";
   panel.setAttribute("role","tabpanel");
   panel.setAttribute("aria-labelledby",tab.id);
   panel.hidden=true;
   content.appendChild(panel);panels.set(item.id,panel);
  }
  region.append(intro,tabsContainer,content);
  root.appendChild(region);
  for(const item of sections){
   const panel=panels.get(item.id);
   for(let i=0;i<item.anchors.length;i++){
    const card=cards.get(item.id)[i];
    if(card)panel.appendChild(card);
    else console.warn("Historial de accesos: cuadro no encontrado",item.anchors[i]);
   }
  }
  initialized=true;
  return true;
 }
 window.accesosSeccionesAbrir=function(tab){
  if(!init())return;
  if(tab&&sections.some(item=>item.id===tab&&permitted(item)))selected=tab;
  render();
 };
 window.accesosSeccionesActualizar=function(){if(init())render();};
 if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",init,{once:true});
 else init();
})();
