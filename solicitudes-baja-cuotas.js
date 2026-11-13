/* Solicitudes de baja de cuotas: admin solicita; Sistema Admin resuelve.
   Sólo las funciones RPC verificadas por Supabase modifican las cuotas. */
(function(){
 "use strict";
 let busy=false,lastSnapshot="",lastUser="";
 const labels={
  cuota_no_disponible:"Esta cuota ya fue eliminada, archivada o no está disponible.",
  motivo_invalido:"Escribe un motivo entre 5 y 500 caracteres.",
  solicitud_no_pendiente:"La solicitud ya fue resuelta o no existe.",
  cuota_modificada:"La cuota cambió después de solicitarse. Revísala antes de continuar.",
  cobro_externo_en_revision:"Existe un cobro externo en revisión. Debe conciliarse antes de aprobar la eliminación.",
  accion_invalida:"Acción no permitida."
 };
 const estados={pendiente:"⏳ Pendiente",aprobada:"✅ Aprobada",rechazada:"❌ Rechazada"};
 const resultados={eliminada:"Eliminada",archivada:"Archivada (con historial)",rechazada:"Rechazada"};
 window.solicitudesBajaCuotasDatos=[];
 const currentRole=()=>profile?.rol;
 const authorized=()=>["admin","owner"].includes(currentRole());
 function reason(respuesta){
  return labels[respuesta?.reason]||"No se pudo completar la operación. Comprueba que sigas teniendo permisos.";
 }
 function elem(tag,value){
  const node=document.createElement(tag);
  if(value!=null)node.textContent=String(value);
  return node;
 }
 function rowCell(row,value){
  const cell=elem("td",value);
  row.appendChild(cell);
  return cell;
 }
 function updateView(){
  const body=document.getElementById("solicitudesBajaCuotasRows");
  if(!body)return;
  const rows=Array.isArray(window.solicitudesBajaCuotasDatos)?window.solicitudesBajaCuotasDatos:[];
  body.replaceChildren();
  if(!authorized()){
   const tr=elem("tr");const td=rowCell(tr,"No tienes permiso para consultar solicitudes.");
   td.colSpan=8;body.appendChild(tr);return;
  }
  if(!rows.length){
   const tr=elem("tr"),td=rowCell(tr,"No hay solicitudes de eliminación de cuotas.");
   td.colSpan=8;td.className="muted";body.appendChild(tr);return;
  }
  for(const request of [...rows].sort((a,b)=>
    Number(a.estado!=="pendiente")-Number(b.estado!=="pendiente")||
    new Date(b.creado_el)-new Date(a.creado_el))){
   const tr=elem("tr");
   rowCell(tr,"Casa "+(request.casa_numero||"—"));
   rowCell(tr,request.concepto||"Cuota");
   rowCell(tr,Number(request.monto||0).toLocaleString("es-MX",{style:"currency",currency:"MXN"}));
   rowCell(tr,request.vencimiento||"—");
   const motivo=rowCell(tr,request.motivo||"—");
   motivo.style.maxWidth="300px";motivo.style.whiteSpace="normal";
   rowCell(tr,new Date(request.creado_el).toLocaleString("es-MX"));
   rowCell(tr,estados[request.estado]||request.estado+
     (request.resultado?" · "+(resultados[request.resultado]||request.resultado):""));
   // La decisión sólo está disponible al Sistema Admin.
   const action=rowCell(tr,"");
   if(request.estado==="pendiente"&&currentRole()==="owner"&&
     (typeof ownerPanelMode==="undefined"||ownerPanelMode==="owner")){
    const approve=elem("button","✅ Aprobar"),reject=elem("button","❌ Rechazar");
    approve.type="button";reject.type="button";approve.className="primary mini";reject.className="danger mini";
    approve.onclick=()=>void window.resolverSolicitudBajaCuota(request.id,true);
    reject.onclick=()=>void window.resolverSolicitudBajaCuota(request.id,false);
    const holder=elem("div");holder.className="actions";
    holder.append(approve,reject);action.appendChild(holder);
   }else if(request.estado==="pendiente"){
    action.textContent="🔒 Esperando Sistema Admin";
   }else action.textContent=resultados[request.resultado]||"Resuelta";
   body.appendChild(tr);
  }
 }
 window.cargarSolicitudesBajaCuotas=async function(){
  if(!authorized()||!user)return;
  const actor=user.id;
  const {data,error}=await sb.from("solicitudes_baja_cuota")
    .select("id,cuota_id,solicitante_id,motivo,casa_numero,concepto,monto,vencimiento,estado,resultado,creado_el,resuelto_el")
    .order("creado_el",{ascending:false}).limit(100);
  if(error)throw error;
  if(user?.id!==actor)return;
  if(lastUser!==actor){lastUser=actor;lastSnapshot="";}
  const list=Array.isArray(data)?data:[];
  const snapshot=JSON.stringify(list);
  window.solicitudesBajaCuotasDatos=list;
  if(snapshot!==lastSnapshot){lastSnapshot=snapshot;updateView();}
  window.solicitudesUnificadasActualizar?.();
 };
 window.solicitarBajaCuota=async function(id){
  if(!authorized()||busy)return;
  const cuota=cuotas.find(q=>String(q.id)===String(id));
  if(!cuota){alert("Cuota no disponible. Actualiza el apartado.");return;}
  const motivo=prompt(
   "Motivo de la solicitud para eliminar la cuota "+(cuota.concepto||"")+"\n"+
   "Casa "+(typeof casaNumero==="function"?casaNumero(cuota.casa_id):"")+"\n\n"+
   "Sistema Admin deberá aprobar o rechazar. Escribe al menos 5 caracteres:"
  );
  if(motivo===null)return;
  if(motivo.trim().length<5||motivo.trim().length>500){
   alert(labels.motivo_invalido);return;
  }
  if(!confirm("¿Enviar la solicitud de eliminación a Sistema Admin? La cuota NO se eliminará todavía."))return;
  busy=true;
  try{
   const {data,error}=await sb.rpc("solicitar_baja_cuota",{
    p_cuota_id:Number(id),p_motivo:motivo.trim()
   });
   if(error)throw error;
   if(!data?.ok){alert(reason(data));return;}
   alert(data.ya_solicitada
    ?"Ya existe una solicitud pendiente de aprobación para esta cuota."
    :"✅ Solicitud enviada a Sistema Admin. La cuota sigue activa hasta la aprobación.");
   if(typeof window.solicitudesIr==="function")window.solicitudesIr("cuotas");
   await window.cargarSolicitudesBajaCuotas();
  }catch(error){alert("No se pudo solicitar la eliminación: "+(error?.message||String(error)));}
  finally{busy=false;}
 };
 window.resolverSolicitudBajaCuota=async function(id,approve){
  if(currentRole()!=="owner"||busy||
    (typeof ownerPanelMode!=="undefined"&&ownerPanelMode!=="owner"))return;
  const request=window.solicitudesBajaCuotasDatos.find(x=>x.id===id&&x.estado==="pendiente");
  if(!request){alert("Esta solicitud ya no está pendiente.");return;}
  const txt=approve
   ?"¿APROBAR la eliminación de la cuota?\n\nCasa "+request.casa_numero+
    " · "+request.concepto+"\n\nSi tiene pagos o referencias externas, se archivará para conservar el historial."
   :"¿RECHAZAR esta solicitud?\n\nCasa "+request.casa_numero+" · "+request.concepto;
  if(!confirm(txt))return;
  busy=true;
  try{
   const {data,error}=await sb.rpc("resolver_baja_cuota",{
    p_solicitud_id:id,p_aprobar:!!approve
   });
   if(error)throw error;
   if(!data?.ok){alert(reason(data));return;}
   await loadAll();
   await window.cargarSolicitudesBajaCuotas();
   alert(data.resultado==="archivada"
    ?"✅ Aprobada: cuota archivada y pagos conservados."
    :data.resultado==="eliminada"
    ?"✅ Aprobada: cuota eliminada correctamente."
    :"Solicitud rechazada. La cuota no se modificó.");
  }catch(error){alert("No se pudo resolver la solicitud: "+(error?.message||String(error)));}
  finally{busy=false;}
 };
})();
