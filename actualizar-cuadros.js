/* Un botón de consulta por pantalla y por pestaña.
   Sólo lectura; no abre el portón, cambia permisos ni activa un cobro.
   Mantiene el apartado visible y evita solicitudes simultáneas. */
(function(){
 "use strict";
 let updating=false;
 const groups=[
  {container:"#cuotas .cu-panel",kind:"cuotas"},
  {container:"#solicitudes .su-panel",kind:"solicitudes"}
 ];
 const ignoredStatus="Actualiza los datos de este apartado sin salir de la pantalla.";
 function makeToolbar(sectionId,subPanel){
  const root=document.createElement("div");
  root.className="actualizar-cuadro-barra";
  root.dataset.seccionActualizar=sectionId;
  if(subPanel)root.dataset.panelActualizar=subPanel;
  const button=document.createElement("button");
  button.type="button";
  button.className="actualizar-cuadro-boton";
  button.textContent="↻ Actualizar";
  button.setAttribute("aria-label","Actualizar datos de "+(subPanel?"esta pestaña":"la sección "+sectionId));
  const status=document.createElement("span");
  status.className="actualizar-cuadro-estado";
  status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  status.textContent="";
  button.addEventListener("click",()=>void refresh(sectionId,button,status));
  root.append(button,status);
  return root;
 }
 function setup(){
  document.querySelectorAll("main > section[id]").forEach(section=>{
   if(["cuotas","solicitudes"].includes(section.id))return;
   if(section.querySelector(":scope > .actualizar-cuadro-barra"))return;
   const bar=makeToolbar(section.id);
   const heading=section.querySelector(":scope > h2");
   if(heading)heading.insertAdjacentElement("afterend",bar);
   else section.prepend(bar);
  });
  groups.forEach(group=>{
   document.querySelectorAll(group.container).forEach(panel=>{
    if(panel.querySelector(":scope > .actualizar-cuadro-barra"))return;
    panel.prepend(makeToolbar(group.kind,panel.id));
   });
  });
 }
 async function readExtra(id){
  // Funciones de consulta existentes; NO solicitar aperturas ni modificar estados.
  switch(id){
   case "cuotas":
    if(["owner","admin"].includes(profile?.rol))await cargarConfigCobroAutomatico();
    window.cuotasSeccionesActualizar?.();
    break;
   case "solicitudes":
    await window.solicitudesUnificadasRefrescar?.();
    window.solicitudesUnificadasActualizar?.();
    break;
   case "controlDigital":
    await Promise.all([refreshDigitalAccess(),basuraActualizar()]);
    break;
   case "esp32Panel":
    if(["owner","admin"].includes(profile?.rol))await refreshEsp32Panel();
    break;
   case "biometrico":
    if(["owner","admin","residente"].includes(profile?.rol))await cargarSolicitudesHuellas();
    break;
   case "visitas":
    if(["owner","admin","residente"].includes(profile?.rol)){
     await Promise.all([cargarCodigosVisita(),cargarCodigosPermanentes()]);
    }
    break;
   case "entregas":
    if(["owner","admin","residente"].includes(profile?.rol))await actualizarSolicitudesEntrega();
    break;
   case "comunicacion":
    if(profile?.rol==="residente")await cargarContactoResidenteDatos();
    break;
   case "notificaciones":
    if(["owner","admin","residente"].includes(profile?.rol))await actualizarNotificacionesEnVivo();
    break;
   case "accesos":
    if(["owner","admin","residente"].includes(profile?.rol))await cargarHistorialCodigosVisita();
    if(["owner","admin"].includes(profile?.rol))await refreshEsp32History();
    if(profile?.rol==="owner"&&ownerPanelMode==="owner")await cargarHistorialBasuraOwner();
    break;
   case "ownerPanel":
    if(profile?.rol==="owner"&&ownerPanelMode==="owner"){
     await Promise.all([cargarAccionesOwner(),cargarMetricasOwnerAccesos(),cargarEmpresasReparto()]);
    }
    break;
   case "disciplina":
    if(typeof disciplinaCargar==="function")await disciplinaCargar();
    break;
   case "miembrosCasa":
    if(profile?.rol==="residente")renderMiembrosCasa();
    break;
  }
 }
 async function refresh(id,button,status){
  const section=document.getElementById(id);
  if(updating||!profile||!user||!section?.classList.contains("active"))return;
  updating=true;
  document.querySelectorAll(".actualizar-cuadro-boton").forEach(b=>{b.disabled=true;});
  button.textContent="↻ Actualizando…";
  status.textContent="Consultando información…";
  try{
   if(typeof loadAll!=="function")throw new Error("No se encontró la conexión de datos.");
   const outcome=await loadAll();
   await readExtra(id);
   if(!profile||!user||!section.classList.contains("active"))return;
   const hora=new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
   const imperfect=outcome?.ok===false;
   status.textContent=imperfect
     ?"Actualización parcial ("+hora+"). Algunos datos no se pudieron consultar."
     :"Datos actualizados · "+hora;
   status.dataset.estado=imperfect?"parcial":"ok";
  }catch(error){
   console.warn("Actualización de sección",id,error);
   status.textContent="No se pudieron actualizar todos los datos. Intenta de nuevo.";
   status.dataset.estado="error";
  }finally{
   updating=false;
   document.querySelectorAll(".actualizar-cuadro-boton").forEach(b=>{b.disabled=false;});
   button.textContent="↻ Actualizar";
  }
 }
 window.actualizarCuadrosPreparar=setup;
 // Es suficiente una instalación: nunca reemplazamos cards ni handlers existentes.
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
 else setup();
})();