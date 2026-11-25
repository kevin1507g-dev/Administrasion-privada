/* Teléfonos del interfón en pestañas, como Cuotas.
   Sólo presentación: conserva los mismos nodos, formularios, funciones y permisos. */
(function(){
 "use strict";
 const sections=[
  {id:"casas",label:"🏠 Teléfonos de residentes",roles:["owner"],anchor:"interfonResidentesOwner"},
  {id:"mio",label:"📞 Mi teléfono",roles:["residente","owner","admin"],anchor:"interfonTelConfigCard"},
  {id:"llamadas",label:"🧪 Prueba de llamada",roles:["owner"],anchor:"interfonVoiceDemo"},
  {id:"datos",label:"🪪 Datos de administración",roles:["owner"],anchor:"interfonAdminDatosCard"},
  {id:"informacion",label:"ℹ️ Cómo funciona",roles:["residente","owner","admin"],anchor:"interfonTelInfoCard"}
 ];
 const tabs=new Map(),panels=new Map();
 let initialized=false,selected="";
 const role=()=>typeof profile==="undefined"?"":profile?.rol||"";
 const permitted=item=>item.roles.includes(role());

 function render(){
  if(!initialized)return;
  const activeRole=role();
  if(!activeRole)return;
  const eligible=sections.filter(permitted);
  if(!eligible.some(item=>item.id===selected))
   selected=activeRole==="owner"?"casas":"mio";
  if(!eligible.some(item=>item.id===selected))selected=eligible[0]?.id||"";
  for(const item of sections){
   const shown=permitted(item),active=shown&&selected===item.id;
   const tab=tabs.get(item.id),panel=panels.get(item.id);
   if(item.id==="mio")
    tab.textContent=activeRole==="residente"?"📞 Mis teléfonos":
      activeRole==="admin"?"📞 Configuración telefónica":"📞 Mi teléfono";
   tab.hidden=!shown;
   tab.setAttribute("aria-selected",String(active));
   tab.tabIndex=active?0:-1;
   tab.classList.toggle("ta-selected",active);
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
  const root=document.getElementById("interfonTelefonos");
  if(!root)return false;
  const cards=new Map();
  for(const item of sections){
   const card=document.getElementById(item.anchor);
   if(!card||card.parentElement!==root||!card.classList.contains("card")){
    console.warn("Teléfonos Admin: no se encontró tarjeta",item.anchor);
    return false;
   }
   cards.set(item.id,card);
  }
  const region=document.createElement("div");
  region.id="telefonosAdminSecciones";
  const intro=document.createElement("p");
  intro.className="muted ta-intro";
  intro.textContent="Selecciona una categoría para consultar o gestionar teléfonos del interfón.";
  const tablist=document.createElement("div");
  tablist.className="ta-tabs";
  tablist.setAttribute("role","tablist");
  tablist.setAttribute("aria-label","Secciones de teléfonos del interfón");
  const content=document.createElement("div");
  content.className="ta-content";
  for(const item of sections){
   const tab=document.createElement("button");
   tab.type="button";tab.className="ta-tab";tab.textContent=item.label;
   tab.id="telefonos-tab-"+item.id;
   tab.setAttribute("role","tab");
   tab.setAttribute("aria-controls","telefonos-panel-"+item.id);
   tab.setAttribute("aria-selected","false");
   tab.tabIndex=-1;tab.onclick=()=>selectTab(item.id);
   tab.onkeydown=event=>{
    if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
    event.preventDefault();
    const available=sections.filter(permitted).map(x=>x.id);
    if(!available.length)return;
    const at=available.indexOf(item.id);
    const next=event.key==="Home"?available[0]:
     event.key==="End"?available[available.length-1]:
     available[(at+(event.key==="ArrowRight"?1:-1)+available.length)%available.length];
    if(next)selectTab(next,true);
   };
   tablist.appendChild(tab);tabs.set(item.id,tab);
   const panel=document.createElement("div");
   panel.id="telefonos-panel-"+item.id;
   panel.className="ta-panel";
   panel.setAttribute("role","tabpanel");
   panel.setAttribute("aria-labelledby",tab.id);
   panel.hidden=true;
   content.appendChild(panel);panels.set(item.id,panel);
  }
  region.append(intro,tablist,content);
  root.appendChild(region);
  // Trasladar los cuadros originales sin clonarlos: conservar IDs y eventos.
  for(const item of sections)panels.get(item.id).appendChild(cards.get(item.id));
  initialized=true;
  return true;
 }
 window.telefonosAdminSeccionesAbrir=function(tab){
  if(!init())return;
  if(tab&&sections.some(item=>item.id===tab&&permitted(item)))selected=tab;
  render();
 };
 window.telefonosAdminSeccionesActualizar=function(){if(init())render();};
 if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",init,{once:true});
 else init();
})();
