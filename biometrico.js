/* Prerregistro de huellas por cuenta. La captura real requiere R503Pro y no se simula. */
let bioSolicitudesEnCarga=false, bioSolicitudGuardando=false, bioSolicitudesActuales=[];
const bioNombresDedo={indice_izquierdo:'Índice izquierdo · Peatonal',pulgar_derecho:'Pulgar derecho · Portón'};
function actualizarBotonesHuella(){
 const residente=profile?.rol==='residente';
 const casa=profile?.casa_id?casaPorId(profile.casa_id):null;
 const autorizada=!!(residente && user?.id && casa && casa.activo!==false
    && profile.activo!==false && profile.estado_registro==='aprobado');
 const consentimiento=!!document.getElementById('bioConsentimiento')?.checked;
 const info=document.getElementById('bioMiCasa');
 if(info && residente)info.textContent=autorizada
    ?'Casa '+casaNumero(profile.casa_id)+' · '+(profile.nombre||'Residente')
    :'Tu cuenta debe estar aprobada y vinculada a una casa activa.';
 for(const [dedo,id] of [['indice_izquierdo','bioSolicitarIndice'],['pulgar_derecho','bioSolicitarPulgar']]){
   const btn=document.getElementById(id);
   if(!btn)continue;
   const existente=bioSolicitudesActuales.some(x=>x.residente_id===user?.id && x.dedo===dedo
     && ['pendiente_captura','registrada'].includes(x.estado));
   btn.disabled=!autorizada||!consentimiento||bioSolicitudGuardando||bioSolicitudesEnCarga||existente;
   btn.textContent=existente?'Solicitud existente':('Solicitar '+(dedo==='indice_izquierdo'?'índice izquierdo':'pulgar derecho'));
 }
}
function bioNombreEstado(estado){
 return estado==='pendiente_captura'?'Pendiente de lector físico':
        estado==='registrada'?'Registrada en el lector':
        estado==='cancelada'?'Cancelada':estado==='error'?'Error de captura':estado;
}
async function cargarSolicitudesHuellas(){
 if(bioSolicitudesEnCarga || !profile || !user || !['owner','admin','residente'].includes(profile.rol))return;
 bioSolicitudesEnCarga=true;
 actualizarBotonesHuella();
 try{
   const {data,error}=await sb.from('solicitudes_huella')
      .select('id,residente_id,casa_id,dedo,estado,created_at')
      .order('created_at',{ascending:false}).limit(250);
   if(error)throw error;
   bioSolicitudesActuales=data||[];
   const propias=bioSolicitudesActuales.filter(x=>x.residente_id===user?.id);
   const body=document.getElementById('bioMisSolicitudes');
   if(body && profile.rol==='residente'){
     body.innerHTML=propias.map(x=>`<tr>
       <td>${esc(bioNombresDedo[x.dedo]||x.dedo)}</td>
       <td>${esc(bioNombreEstado(x.estado))}</td>
       <td>${esc(new Date(x.created_at).toLocaleString('es-MX'))}</td>
       <td>${x.estado==='pendiente_captura'
          ?`<button type="button" onclick="cancelarSolicitudHuella('${x.id}')">Cancelar solicitud</button>`:'—'}</td>
     </tr>`).join('')||'<tr><td colspan="4" class="muted">Aún no has solicitado huellas.</td></tr>';
   }
   const adminBody=document.getElementById('bioAdminSolicitudes');
   if(adminBody && isAdminProfileRole(profile.rol)){
     adminBody.innerHTML=bioSolicitudesActuales.map(x=>{
       const residente=profiles.find(p=>p.id===x.residente_id);
       return `<tr>
         <td>${esc(residente?.nombre||'Residente')}</td>
         <td>${esc(casaNumero(x.casa_id))}</td>
         <td>${esc(bioNombresDedo[x.dedo]||x.dedo)}</td>
         <td>${esc(bioNombreEstado(x.estado))}</td>
         <td>${esc(new Date(x.created_at).toLocaleString('es-MX'))}</td>
       </tr>`;
     }).join('')||'<tr><td colspan="5" class="muted">Todavía no hay solicitudes de huellas.</td></tr>';
   }
 }catch(e){
   const msg='No se pudieron consultar las solicitudes: '+(e?.message||'verifica Supabase');
   const propia=document.getElementById('bioResidenteMensaje');
   if(propia && profile.rol==='residente')propia.textContent=msg;
   const adminBody=document.getElementById('bioAdminSolicitudes');
   if(adminBody && isAdminProfileRole(profile.rol))adminBody.innerHTML='<tr><td colspan="5" class="muted">'+esc(msg)+'</td></tr>';
   bioSolicitudesActuales=[];
 }finally{bioSolicitudesEnCarga=false;actualizarBotonesHuella();}
}
async function solicitarHuellaResidente(dedo){
 if(profile?.rol!=='residente'||!user?.id||bioSolicitudGuardando||bioSolicitudesEnCarga)return;
 if(!Object.prototype.hasOwnProperty.call(bioNombresDedo,dedo))return;
 const casa=profile.casa_id?casaPorId(profile.casa_id):null;
 const msg=document.getElementById('bioResidenteMensaje');
 if(!casa || casa.activo===false || profile.activo===false || profile.estado_registro!=='aprobado'){
   if(msg)msg.textContent='Necesitas una cuenta aprobada y una casa activa.';return;
 }
 if(!document.getElementById('bioConsentimiento')?.checked){
   if(msg)msg.textContent='Confirma que solicitas registrar tu propia huella.';return;
 }
 bioSolicitudGuardando=true;actualizarBotonesHuella();
 try{
   const {error}=await sb.from('solicitudes_huella').insert({
     residente_id:user.id,casa_id:profile.casa_id,dedo,estado:'pendiente_captura'
   });
   if(error)throw error;
   if(msg)msg.textContent='Solicitud guardada para tu casa. Tu huella queda pendiente de capturarse en el lector físico R503Pro.';
   await cargarSolicitudesHuellas();
 }catch(e){
   if(msg)msg.textContent=e?.code==='23505'?'Ya existe una solicitud vigente para ese dedo.':
     'No se pudo registrar: '+(e?.message||'intenta de nuevo');
 }finally{bioSolicitudGuardando=false;actualizarBotonesHuella();}
}
async function cancelarSolicitudHuella(id){
 if(profile?.rol!=='residente'||!user?.id||bioSolicitudGuardando)return;
 const item=bioSolicitudesActuales.find(x=>x.id===id && x.residente_id===user.id);
 if(!item||item.estado!=='pendiente_captura')return;
 if(!confirm('¿Cancelar esta solicitud que todavía no ha sido capturada?'))return;
 bioSolicitudGuardando=true;actualizarBotonesHuella();
 const msg=document.getElementById('bioResidenteMensaje');
 try{
   const {data,error}=await sb.from('solicitudes_huella').delete()
     .eq('id',id).eq('residente_id',user.id).eq('estado','pendiente_captura').select('id');
   if(error)throw error;
   if(!data?.length)throw Error('La solicitud ya no está pendiente o no tienes permiso para cancelarla.');
   if(msg)msg.textContent='Solicitud pendiente cancelada.';
   await cargarSolicitudesHuellas();
 }catch(e){if(msg)msg.textContent='No se pudo cancelar: '+(e?.message||'intenta de nuevo');}
 finally{bioSolicitudGuardando=false;actualizarBotonesHuella();}
}
