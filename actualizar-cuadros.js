/* Actualización automática de la sección visible, cada 5 segundos.
   Sólo consulta datos. No modifica pagos, permisos, accesos ni ESP32.
   No hace consultas en segundo plano y evita sobrescribir formularios. */
(function(){
 "use strict";
 const INTERVALO=5000;
 let busy=false;
 let lastInteraction=0;
 let lastWarn=0;
 const fingerprints=new Map();
 const dirtyFields=new WeakSet();
 const staff=()=>["owner","admin"].includes(profile?.rol);
 const residentStaff=()=>["owner","admin","residente"].includes(profile?.rol);
 const models={
  casas:{
   read:()=>sb.from("casas").select("*").order("numero",{ascending:true}),
   save:data=>{casas=data;}
  },
  profiles:{
   allowed:residentStaff,
   read:()=>sb.from("profiles").select("*").order("nombre"),
   save:data=>{profiles=data;}
  },
  cuotas:{
   read:()=>sb.from("cuotas").select("*").order("created_at",{ascending:false}),
   save:data=>{
    cuotas=data.filter(x=>x.archivada!==true);
    cuotasArchivadas=data.filter(x=>x.archivada===true&&x.oculta_por_retiro_integracion!==true);
   }
  },
  pagos:{read:()=>sb.from("pagos").select("*").order("created_at",{ascending:false}),save:data=>{pagos=data;}},
  visitas:{read:()=>sb.from("visitas").select("*").order("created_at",{ascending:false}),save:data=>{visitas=data;}},
  accesos:{
   allowed:()=>["owner","admin","guardia"].includes(profile?.rol),
   read:()=>sb.from("accesos").select("*").order("created_at",{ascending:false}),
   save:data=>{accesos=data;}
  },
  eventos:{read:()=>sb.from("eventos").select("*").order("fecha",{ascending:true}).order("hora",{ascending:true}),save:data=>{eventos=data;}},
  controles:{
   allowed:residentStaff,
   read:()=>sb.from("controles_residenciales").select("*").order("numero_control",{ascending:true}),
   save:data=>{controles=data;}
  },
  gastos:{
   allowed:staff,
   read:()=>sb.from("gastos").select("*").order("fecha",{ascending:false}).order("created_at",{ascending:false}),
   save:data=>{gastos=data;}
  },
  metodos:{
   allowed:residentStaff,
   read:()=>sb.from("metodos_pago").select("*").order("created_at",{ascending:true}),
   save:data=>{metodosPago=data;}
  },
  avisos:{read:()=>sb.from("avisos_condominio").select("*").order("created_at",{ascending:false}),save:data=>{avisos=data;}},
  reportes:{
   allowed:residentStaff,
   read:()=>sb.from("reportes_mantenimiento").select("*").order("created_at",{ascending:false}),
   save:data=>{reportes=data;}
  },
  incidentes:{
   allowed:residentStaff,
   read:()=>sb.from("incidentes").select("*").order("updated_at",{ascending:false}),
   save:data=>{incidentes=data;}
  },
  incidenteMensajes:{
   allowed:residentStaff,
   read:()=>sb.from("incidente_mensajes").select("*").order("created_at",{ascending:true}),
   save:data=>{incidenteMensajes=data;}
  },
  incidenteAdjuntos:{
   allowed:residentStaff,
   read:()=>sb.from("incidente_adjuntos").select("id,incidente_id,subido_por,storage_path,nombre_archivo,mime_type,tamano_bytes,created_at").order("created_at",{ascending:true}),
   save:data=>{incidenteAdjuntos=data;}
  },
  entregas:{
   allowed:residentStaff,
   read:()=>sb.from("entregas_contacto").select("id,casa_id,tipo,empresa,repartidor,mensaje,estado,respuesta,respondido_por,respondido_at,created_at,expires_at").order("created_at",{ascending:false}).limit(100),
   save:data=>{entregas=data;}
  },
  paquetes:{read:()=>sb.from("paquetes").select("*").order("created_at",{ascending:false}),save:data=>{paquetes=data;}},
  reservas:{
   allowed:residentStaff,
   read:()=>sb.from("reservaciones").select("*").order("fecha",{ascending:true}),
   save:data=>{reservas=data;}
  },
  documentos:{read:()=>sb.from("documentos_condominio").select("*").order("created_at",{ascending:false}),save:data=>{documentos=data;}},
  emergencia:{read:()=>sb.from("contactos_emergencia").select("*").order("tipo").order("nombre"),save:data=>{contactosEmergencia=data;}}
 };
 const bySection={
  inicio:["casas","profiles","cuotas","pagos","visitas","accesos","eventos","controles","avisos","reportes","incidentes","entregas","paquetes"],
  ownerPanel:["casas","profiles","cuotas","pagos","controles","reservas"],
  ownerResidentPreview:["casas","profiles","cuotas","pagos","controles","eventos","paquetes"],
  casas:["casas","profiles"],
  residentes:["profiles","casas"],
  miembrosCasa:["profiles","casas"],
  cuotas:["casas","profiles","cuotas","pagos"],
  pagos:["casas","profiles","cuotas","pagos"],
  deudas:["casas","profiles","cuotas","pagos"],
  gastos:["gastos","pagos"],
  metodosPago:["metodos"],
  visitas:["visitas","casas","profiles"],
  porton:["controles","casas","profiles","cuotas","pagos"],
  eventos:["eventos"],
  avisos:["avisos"],
  mantenimiento:["reportes","casas","profiles"],
  incidentes:["incidentes","incidenteMensajes","incidenteAdjuntos","casas","profiles"],
  paqueteria:["paquetes","casas","profiles"],
  reservaciones:["reservas","casas","profiles"],
  documentos:["documentos"],
  emergencia:["emergencia"],
  historialCasa:["casas","profiles","cuotas","pagos","visitas","accesos","controles","paquetes","eventos"],
  accesos:["accesos","visitas","entregas","casas","profiles"]
 };
 function requestedSources(id){
  if(id==="cuotas"){
   const tab=document.querySelector("#cuotas .cu-panel:not([hidden])")?.id||"";
   if(tab.endsWith("-automatico"))return [];
   if(tab.endsWith("-adelantos"))return ["casas","profiles"];
   if(tab.endsWith("-crear"))return ["casas","profiles","cuotas"];
   if(tab.endsWith("-duplicados"))return ["casas","cuotas"];
   if(tab.endsWith("-misCuotas"))return ["casas","cuotas","pagos"];
  }
  if(id==="solicitudes"){
   const tab=document.querySelector("#solicitudes .su-panel:not([hidden])")?.id||"";
   if(tab.endsWith("-registros"))return ["profiles","casas"];
   if(tab.endsWith("-reservaciones"))return ["reservas","casas","profiles"];
   return [];
  }
  return bySection[id]||[];
 }
 function currentSection(){
  return document.querySelector("main > section.active");
 }
 function userIsEditing(section){
  if(Date.now()-lastInteraction<3500)return true;
  const focus=document.activeElement;
  return !!focus&&section.contains(focus)&&
   (focus.matches?.("input,textarea,select,[contenteditable=true]")||false)&&
   Date.now()-lastInteraction<6500;
 }
 function collectDrafts(section){
  const drafts=[];
  section.querySelectorAll("input,textarea,select").forEach(el=>{
   if(!dirtyFields.has(el)||el.type==="file")return;
   drafts.push({el,value:el.value,checked:el.checked,type:el.type});
  });
  return drafts;
 }
 function restoreDrafts(drafts){
  for(const d of drafts){
   if(!d.el.isConnected)continue;
   if(d.type==="checkbox"||d.type==="radio")d.el.checked=d.checked;
   else if(d.el.tagName==="SELECT"){
    if([...d.el.options].some(o=>o.value===d.value))d.el.value=d.value;
   }else d.el.value=d.value;
  }
 }
 function warn(error){
  if(Date.now()-lastWarn>30000){
   console.warn("Actualización automática:",error);
   lastWarn=Date.now();
  }
 }
 async function readModels(id,section,accountId){
  const keys=requestedSources(id).filter(k=>models[k]&&(!models[k].allowed||models[k].allowed()));
  if(!keys.length)return;
  const results=await Promise.allSettled(keys.map(k=>models[k].read()));
  if(user?.id!==accountId||currentSection()!==section||document.hidden)return;
  let changed=false;
  for(let i=0;i<keys.length;i++){
   const result=results[i];
   if(result.status!=="fulfilled"){warn(result.reason);continue;}
   const value=result.value;
   if(value?.error){warn(value.error);continue;}
   const data=Array.isArray(value?.data)?value.data:[];
   const mark=JSON.stringify(data);
   const previous=fingerprints.get(keys[i]);
   if(mark!==previous){
    fingerprints.set(keys[i],mark);
    models[keys[i]].save(data);
    changed=true;
   }
  }
  // Las tablas originales solo se dibujan si algo cambió; evita parpadeos.
  if(changed&&typeof render==="function"){
   const drafts=collectDrafts(section);
   render();
   restoreDrafts(drafts);
  }
 }
 async function readAutomaticConfig(){
  if(!staff())return;
  const {data,error}=await sb.from("config_cobro_automatico").select("*").eq("id",1).single();
  if(error)throw error;
  if(!data)return;
  configCobroAutomatico=data;
  const estado=document.getElementById("autoCobroEstado");
  const btn=document.getElementById("autoCobroToggle");
  const monto=document.getElementById("autoCobroMonto");
  if(estado)estado.textContent=data.activo?"✅ Cobros automáticos ACTIVADOS":"⛔ Cobros automáticos DESACTIVADOS";
  if(btn){
   btn.textContent=data.activo?"⛔ Desactivar cobros automáticos":"✅ Activar cobros automáticos";
   btn.className=data.activo?"danger":"primary";
  }
  if(monto&&!dirtyFields.has(monto))monto.value=Number(data.monto||0).toFixed(2);
 }
 async function readExtra(id){
  switch(id){
   case "cuotas":{
    const tab=document.querySelector("#cuotas .cu-panel:not([hidden])")?.id||"";
    if(tab.endsWith("-automatico"))await readAutomaticConfig();
    window.cuotasSeccionesActualizar?.();
    break;
   }
   case "solicitudes":{
    const tab=document.querySelector("#solicitudes .su-panel:not([hidden])")?.id||"";
    if(tab.endsWith("-huellas")&&residentStaff())await cargarSolicitudesHuellas();
    else if(tab.endsWith("-permanentes")&&residentStaff())await cargarCodigosPermanentes();
    else if(tab.endsWith("-entradas")){
     if(profile?.rol==="residente")await actualizarSolicitudesEntrega();
     else if(profile?.rol==="owner")await cargarChatsEspecialesOwner();
    }else if(tab.endsWith("-comunicacion")&&profile?.rol==="residente")await cargarContactoResidenteDatos();
    else if(tab.endsWith("-empresas")&&profile?.rol==="owner")await cargarEmpresasReparto();
    window.solicitudesUnificadasActualizar?.();
    break;
   }
   case "controlDigital":
    await Promise.all([refreshDigitalAccess(),basuraActualizar()]);
    break;
   case "esp32Panel":
    if(staff())await refreshEsp32Panel();
    break;
   case "biometrico":
    if(residentStaff())await cargarSolicitudesHuellas();
    break;
   case "visitas":
    if(residentStaff())await Promise.all([cargarCodigosVisita(),cargarCodigosPermanentes()]);
    break;
   case "entregas":
    if(residentStaff())await actualizarSolicitudesEntrega();
    break;
   case "comunicacion":
    if(profile?.rol==="residente")await cargarContactoResidenteDatos();
    break;
   case "notificaciones":
    if(residentStaff())await actualizarNotificacionesEnVivo();
    break;
   case "accesos":
    if(residentStaff())await cargarHistorialCodigosVisita();
    if(staff())await refreshEsp32History();
    if(profile?.rol==="owner"&&ownerPanelMode==="owner")await cargarHistorialBasuraOwner();
    break;
   case "ownerPanel":
    if(profile?.rol==="owner"&&ownerPanelMode==="owner")
     await Promise.all([cargarAccionesOwner(),cargarMetricasOwnerAccesos(),cargarEmpresasReparto()]);
    break;
   case "disciplina":
    if(typeof disciplinaCargar==="function")await disciplinaCargar();
    break;
   case "camaras":
    // Video en vivo: no reiniciar el iframe cada 5 segundos.
    break;
  }
 }
 async function tick(){
  const section=currentSection(),id=section?.id;
  if(busy||!id||!user||!profile||document.hidden||navigator.onLine===false||
    document.getElementById("app")?.classList.contains("hidden"))return;
  if(userIsEditing(section))return;
  if(document.querySelector("dialog[open],.modal:not(.hidden)"))return;
  if(typeof cuotaGuardando!=="undefined"&&cuotaGuardando)return;
  if(typeof pagoGuardando!=="undefined"&&pagoGuardando)return;
  busy=true;
  const accountId=user.id;
  try{
   await readModels(id,section,accountId);
   if(user?.id!==accountId||currentSection()!==section||document.hidden)return;
   await readExtra(id);
  }catch(error){warn(error);}
  finally{busy=false;}
 }
 function setup(){
  // Desinstala las barras de la versión manual, si estuvieran presentes.
  document.querySelectorAll(".actualizar-cuadro-barra").forEach(el=>el.remove());
 }
 document.addEventListener("input",e=>{if(e.target?.matches?.("input,textarea,select"))dirtyFields.add(e.target);lastInteraction=Date.now();},true);
 document.addEventListener("change",e=>{if(e.target?.matches?.("input,textarea,select"))dirtyFields.add(e.target);lastInteraction=Date.now();},true);
 document.addEventListener("pointerdown",()=>{lastInteraction=Date.now();},true);
 document.addEventListener("keydown",()=>{lastInteraction=Date.now();},true);
 window.actualizarCuadrosPreparar=setup;
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
 else setup();
 setInterval(()=>{void tick();},INTERVALO);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)void tick();});
})();