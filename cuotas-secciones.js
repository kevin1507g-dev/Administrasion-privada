/* Cuotas por pestañas, como Solicitudes y permisos.
   Presentación solamente: conserva campos, permisos y eventos originales. */
(function(){
 "use strict";
 const config=[
  {id:"misCuotas",label:"🏠 Mis mensualidades",roles:["residente"],anchor:"residentPaidUntil"},
  {id:"historial",label:"📋 Cuotas registradas",roles:["residente","admin","owner"],anchor:"cuotasRows"},
  {id:"automatico",label:"⚙️ Cobro automático",roles:["admin","owner"],anchor:"autoCobroMonto"},
  {id:"adelantos",label:"⏩ Mensualidades adelantadas",roles:["admin","owner"],anchor:"paidUntilCasa"},
  {id:"crear",label:"➕ Crear cuota",roles:["admin","owner"],anchor:"crearCuotaBtn"},
  {id:"duplicados",label:"🔎 Revisar duplicados",roles:["admin","owner"],anchor:"duplicatedDuesWarning"}
 ];
 const panels=new Map(),tabs=new Map();
 let initialized=false,selected="";
 function isAllowed(item){return !!profile&&item.roles.includes(profile.rol);}
 function panelForAnchor(id){
  const el=document.getElementById(id);
  if(!el)return null;
  return el.closest("#cuotas > .card")||el.closest(".card");
 }
 function selectTab(id,focus){
  const item=config.find(x=>x.id===id);
  if(!item||!isAllowed(item))return;
  selected=id;render();
  if(focus)tabs.get(id)?.focus();
 }
 function render(){
  if(!initialized||!profile)return;
  const permitted=config.filter(isAllowed);
  if(!permitted.some(x=>x.id===selected))selected=profile.rol==="residente"?"misCuotas":"historial";
  for(const item of config){
   const visible=isAllowed(item);
   const tab=tabs.get(item.id),panel=panels.get(item.id);
   const active=visible&&selected===item.id;
   tab.hidden=!visible;
   tab.setAttribute("aria-selected",String(active));
   tab.tabIndex=active?0:-1;
   tab.classList.toggle("cu-selected",active);
   panel.hidden=!active;
  }
 }
 function init(){
  if(initialized)return true;
  const root=document.getElementById("cuotas");
  if(!root)return false;
  const region=document.createElement("div");
  region.id="cuotasSecciones";
  const intro=document.createElement("p");
  intro.className="muted cu-intro";
  intro.textContent="Selecciona una categoría para consultar cuotas o gestionar las funciones autorizadas de tu cuenta.";
  region.appendChild(intro);
  const tabsContainer=document.createElement("div");
  tabsContainer.className="cu-tabs";tabsContainer.setAttribute("role","tablist");
  tabsContainer.setAttribute("aria-label","Secciones de cuotas");
  const content=document.createElement("div");
  content.className="cu-content";
  const idList=config.map(x=>x.id);
  for(const item of config){
   const btn=document.createElement("button");btn.type="button";
   btn.className="cu-tab";btn.textContent=item.label;
   btn.setAttribute("role","tab");btn.id="cuotas-tab-"+item.id;
   btn.setAttribute("aria-controls","cuotas-panel-"+item.id);
   btn.setAttribute("aria-selected","false");btn.tabIndex=-1;
   btn.onclick=()=>selectTab(item.id);
   btn.onkeydown=event=>{
    if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
    event.preventDefault();
    const allowed=config.filter(isAllowed).map(x=>x.id);
    const at=allowed.indexOf(item.id);
    const next=event.key==="Home"?allowed[0]:
      event.key==="End"?allowed[allowed.length-1]:
      allowed[(at+(event.key==="ArrowRight"?1:-1)+allowed.length)%allowed.length];
    if(next)selectTab(next,true);
   };
   tabsContainer.appendChild(btn);tabs.set(item.id,btn);
   const panel=document.createElement("div");
   panel.id="cuotas-panel-"+item.id;
   panel.className="cu-panel";
   panel.setAttribute("role","tabpanel");
   panel.setAttribute("aria-labelledby",btn.id);
   panel.hidden=true;
   content.appendChild(panel);panels.set(item.id,panel);
  }
  region.appendChild(tabsContainer);region.appendChild(content);
  root.appendChild(region);

  // Mover nodos existentes, no clonarlos: siguen conectados a sus acciones.
  for(const item of config){
   const card=panelForAnchor(item.anchor);
   if(!card)console.warn("Cuotas: no se encontró",item.anchor);
   else panels.get(item.id).appendChild(card);
  }
  initialized=true;
  return true;
 }
 window.cuotasSeccionesAbrir=function(tab){
  if(!init())return;
  if(tab&&config.some(x=>x.id===tab&&isAllowed(x)))selected=tab;
  render();
 };
 window.cuotasSeccionesIr=function(tab){
  if(!profile||!["residente","admin","owner"].includes(profile.rol))return;
  show("cuotas");
  window.cuotasSeccionesAbrir(tab);
 };
 window.cuotasSeccionesActualizar=function(){if(init())render();};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
 else init();
})();