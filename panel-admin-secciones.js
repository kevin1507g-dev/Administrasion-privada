/* Paneles administrativos con navegación por pestañas, como Cuotas.
   Se trasladan los cuadros originales sin clonarlos ni modificar sus eventos.
   Los residentes conservan el panel Inicio original. */
(function(){
 "use strict";
 const config={
  admin:{
   root:"inicio",region:"panelAdminSecciones",defaultTab:"resumen",
   description:"Selecciona una categoría para consultar el panel de administración.",
   sections:[
    {id:"resumen",label:"📊 Resumen general",anchors:["inicioIndicadores"]},
    {id:"casas",label:"🏘️ Casas y ocupación",anchors:["houseOccupancyCard"]},
    {id:"avisos",label:"🔔 Avisos y notificaciones",anchors:["inicioNotifCard","avisosInicio"]}
   ]
  },
  owner:{
   root:"ownerPanel",region:"panelSistemaAdminSecciones",defaultTab:"metricas",
   description:"Selecciona una categoría del Centro de control Sistema Admin.",
   sections:[
    {id:"metricas",label:"📊 Indicadores y gráficas",anchors:["ownerAnalyticsDashboard"]},
    {id:"gestion",label:"🗂️ Accesos rápidos",anchors:["ownerGeneralAccessCard"]},
    {id:"usuarios",label:"👥 Usuarios y administración",anchors:["ownerUsersRoleCard","ownerAdminDataCard"]},
    {id:"repartidores",label:"🛵 Repartidores y evidencias",anchors:["ownerEmpresasReparto","ownerChatEspecialListaCard","ownerEvidenciasFotograficas"]},
    {id:"avisos",label:"🔔 Avisos y auditoría",anchors:["ownerNotificationsCard","ownerAuditCard"]},
    {id:"panel",label:"🔀 Cambiar de vista",anchors:["ownerModeCard"]}
   ]
  }
 };
 const stores=new Map();
 const staff=()=>typeof profile!=="undefined" && !!profile && ["admin","owner"].includes(profile.rol);
 const ownerAllowed=()=>typeof profile!=="undefined" && profile?.rol==="owner" &&
   document.body.dataset.ownerPanel==="owner";

 function select(kind,id,focus=false){
  const state=stores.get(kind);
  if(!state || !config[kind].sections.some(x=>x.id===id))return;
  if(kind==="owner" && !ownerAllowed())return;
  if(kind==="admin" && !staff())return;
  state.selected=id;
  render(kind);
  if(focus)state.tabs.get(id)?.focus();
 }
 function render(kind){
  const state=stores.get(kind);
  if(!state)return;
  const active=kind==="owner"?ownerAllowed():staff();
  if(!active)return;
  if(!config[kind].sections.some(x=>x.id===state.selected))
   state.selected=config[kind].defaultTab;
  for(const item of config[kind].sections){
   const btn=state.tabs.get(item.id),panel=state.panels.get(item.id);
   const shown=state.selected===item.id;
   btn.setAttribute("aria-selected",String(shown));
   btn.tabIndex=shown?0:-1;
   btn.classList.toggle("pa-selected",shown);
   panel.hidden=!shown;
  }
 }
 function init(kind){
  if(stores.has(kind))return true;
  if(kind==="owner" && !ownerAllowed())return false;
  if(kind==="admin" && !staff())return false;
  const cfg=config[kind];
  const root=document.getElementById(cfg.root);
  if(!root)return false;
  const anchored=new Map();
  for(const item of cfg.sections){
   const found=[];
   for(const anchor of item.anchors){
    const element=document.getElementById(anchor);
    if(!element || element.parentElement!==root){
     console.warn("Panel Admin: no se encontró cuadro",anchor);
     return false;
    }
    found.push(element);
   }
   anchored.set(item.id,found);
  }
  const region=document.createElement("div");
  region.id=cfg.region;
  const intro=document.createElement("p");
  intro.className="muted pa-intro";
  intro.textContent=cfg.description;
  const tablist=document.createElement("div");
  tablist.className="pa-tabs";
  tablist.setAttribute("role","tablist");
  tablist.setAttribute("aria-label",cfg.description);
  const content=document.createElement("div");
  content.className="pa-content";
  const tabs=new Map(),panels=new Map();
  for(const item of cfg.sections){
   const tab=document.createElement("button");
   tab.type="button";tab.className="pa-tab";tab.textContent=item.label;
   tab.id=cfg.region+"-tab-"+item.id;
   tab.setAttribute("role","tab");
   tab.setAttribute("aria-controls",cfg.region+"-panel-"+item.id);
   tab.setAttribute("aria-selected","false");
   tab.tabIndex=-1;
   tab.onclick=()=>select(kind,item.id);
   tab.onkeydown=event=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    event.preventDefault();
    const ids=cfg.sections.map(x=>x.id);
    const index=ids.indexOf(item.id);
    const next=event.key==="Home"?ids[0]:
     event.key==="End"?ids[ids.length-1]:
     ids[(index+(event.key==="ArrowRight"?1:-1)+ids.length)%ids.length];
    select(kind,next,true);
   };
   tablist.appendChild(tab);tabs.set(item.id,tab);
   const panel=document.createElement("div");
   panel.id=cfg.region+"-panel-"+item.id;
   panel.className="pa-panel";
   panel.setAttribute("role","tabpanel");
   panel.setAttribute("aria-labelledby",tab.id);
   panel.hidden=true;
   content.appendChild(panel);panels.set(item.id,panel);
  }
  region.append(intro,tablist,content);
  root.appendChild(region);
  for(const item of cfg.sections){
   const panel=panels.get(item.id);
   for(const node of anchored.get(item.id))panel.appendChild(node);
  }
  stores.set(kind,{tabs,panels,selected:cfg.defaultTab});
  render(kind);
  return true;
 }

 window.panelAdminSeccionesAbrir=function(kind,tab){
  if(!["admin","owner"].includes(kind))return;
  if(!init(kind))return;
  if(tab&&config[kind].sections.some(x=>x.id===tab))stores.get(kind).selected=tab;
  render(kind);
 };
 window.panelAdminSeccionesActualizar=function(){
  if(staff())window.panelAdminSeccionesAbrir("admin");
 };
})();