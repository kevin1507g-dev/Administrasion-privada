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
    if(!element){
     console.warn("Panel Admin: no se encontró cuadro",anchor);
     continue;
    }
    // Solicitudes y permisos traslada tarjetas de Repartidores fuera de ownerPanel.
    // No moverlas de regreso: hacerlo rompería el módulo que las administra.
    if(element.parentElement!==root){
     if(kind==="owner" && ["ownerEmpresasReparto","ownerChatEspecialListaCard"].includes(anchor)
       && document.getElementById("solicitudes")?.contains(element)){
       continue;
     }
     console.warn("Panel Admin: el cuadro está administrado por otra sección",anchor);
     continue;
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
  // Igual que Cuotas: las pestañas quedan inmediatamente bajo el título.
  root.insertBefore(region,root.querySelector("h2")?.nextElementSibling||null);
  for(const item of cfg.sections){
   const panel=panels.get(item.id);
   for(const node of anchored.get(item.id))panel.appendChild(node);
  }
  if(kind==="owner"){
   // Opciones originales de Repartidores están centralizadas en Solicitudes.
   const info=document.createElement("div");
   info.className="card pa-owner-requests";
   const title=document.createElement("h3");
   title.textContent="📝 Solicitudes de repartidores y empresas";
   const description=document.createElement("p");
   description.className="muted";
   description.textContent="Gestiona las solicitudes en su sección original. No cambia autorizaciones ni habilita aperturas.";
   const actions=document.createElement("div");
   actions.className="actions";
   for(const [label,category] of [
    ["🛵 Revisar entradas y repartidores","entradas"],
    ["🏢 Administrar permisos de empresas","empresas"]
   ]){
    const button=document.createElement("button");
    button.type="button";
    button.textContent=label;
    button.addEventListener("click",()=>window.solicitudesIr?.(category));
    actions.appendChild(button);
   }
   info.append(title,description,actions);
   panels.get("repartidores").insertBefore(info,panels.get("repartidores").firstChild);
  }
  stores.set(kind,{tabs,panels,selected:cfg.defaultTab});
  render(kind);
  return true;
 }

 function moveOwnerShortcut(){
  const state=stores.get("owner");
  if(!state)return;
  const root=document.getElementById("ownerPanel");
  const link=[...(root?.children||[])].find(el=>el.classList?.contains("su-redirect"));
  if(link){
   const target=state.panels.get("usuarios");
   target?.insertBefore(link,target.firstChild);
  }
 }
 window.panelAdminSeccionesAbrir=function(kind,tab){
  if(!["admin","owner"].includes(kind))return;
  if(!init(kind))return;
  if(tab&&config[kind].sections.some(x=>x.id===tab))stores.get(kind).selected=tab;
  if(kind==="owner")moveOwnerShortcut();
  render(kind);
 };
 window.panelAdminSeccionesActualizar=function(){
  if(staff())window.panelAdminSeccionesAbrir("admin");
  if(ownerAllowed()&&document.getElementById("ownerPanel")?.classList.contains("active"))
   window.panelAdminSeccionesAbrir("owner");
 };
 // Iniciar una vez que el DOM esté completo, aunque ya haya sesión restaurada.
 // También cubre el caso donde 'show' corrió antes de cargar este script.
 function bootstrap(){
  if(staff()&&document.getElementById("inicio")?.classList.contains("active"))
   window.panelAdminSeccionesAbrir("admin");
  if(ownerAllowed()&&document.getElementById("ownerPanel")?.classList.contains("active"))
   window.panelAdminSeccionesAbrir("owner");
 }
 if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
 else bootstrap();
})();