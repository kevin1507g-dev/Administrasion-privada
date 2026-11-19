// Panel administrativo: suspender y reactivar el QR del Portero Virtual.
// No modifica el control digital de residentes ni el ESP32.
(()=>{
 "use strict";
 const status=document.getElementById("porteroServicioEstadoAdmin");
 const button=document.getElementById("porteroServicioCambiar");
 const panel=document.getElementById("porteroServicioPanel");
 if(!status||!button||!panel)return;
 let active=null,busy=false;
 const canManage=()=>typeof profile!=="undefined"&&["owner","admin"].includes(profile?.rol);
 function render(){
   button.disabled=busy||active===null||!canManage();
   if(active===null){button.textContent="Comprobando estado…";return;}
   button.textContent=active?"🛑 Poner QR fuera de servicio":"✅ Reactivar QR de repartidores y visitas";
   button.style.background=active?"#9f3337":"#166534";
   button.style.color="white";
   status.textContent=active?"🟢 QR en servicio. Los visitantes pueden utilizar el Portero Virtual.":"🔴 QR FUERA DE SERVICIO. Se han suspendido las nuevas solicitudes y autorizaciones.";
 }
 async function load(){
   if(busy||!canManage())return;
   try{
     const {data,error}=await sb.rpc("portero_servicio_estado");
     if(error||typeof data?.activo!=="boolean")throw Error(error?.message||"No se pudo consultar el estado.");
     active=data.activo;
     render();
   }catch(e){
     active=null;
     button.disabled=true;
     status.textContent="No se pudo comprobar el estado del QR. Actualiza la página para intentarlo.";
   }
 }
 button.addEventListener("click",async()=>{
   if(busy||!canManage()||active===null)return;
   const next=!active;
   const msg=next
      ?"¿Reactivar el QR y permitir nuevamente solicitudes de repartidores y visitas?"
      :"¿Poner fuera de servicio el QR? Se bloquearán nuevas solicitudes y autorizaciones desde el Portero Virtual.";
   if(!window.confirm(msg))return;
   busy=true;button.disabled=true;status.textContent="Guardando el estado del Portero Virtual…";
   try{
     const {data,error}=await sb.rpc("portero_servicio_cambiar",{p_activo:next});
     if(error||!data?.ok||data.activo!==next)throw Error(error?.message||"No se guardó el nuevo estado.");
     active=next;busy=false;render();
   }catch(e){
     busy=false;status.textContent="No se pudo cambiar el estado: "+(e?.message||"Error de conexión.");
     await load();
   }
 });
 window.addEventListener("focus",load);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)load();});
 load();
 setInterval(()=>{if(!document.hidden&&canManage()&&!busy)load();},30000);
})();