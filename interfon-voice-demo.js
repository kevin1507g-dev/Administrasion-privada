// Prueba manual Twilio Voice limitada a Sistema Admin, sin comandos al portón.
(()=>{
 "use strict";
 const section=document.getElementById("interfonVoiceDemo");
 if(!section)return;
 const status=document.getElementById("interfonVoiceEstado");
 const llamar=document.getElementById("interfonVoiceLlamar");
 const actualizar=document.getElementById("interfonVoiceActualizar");
 let configured=false, busy=false;
 const isOwner=()=>typeof profile!=="undefined"&&profile?.rol==="owner";
 function refreshButton(){
  llamar.disabled=!isOwner()||!configured||busy;
  actualizar.disabled=!isOwner()||busy;
 }
 async function verificarEstado(){
  if(!isOwner()){
   configured=false;status.textContent="Esta prueba es exclusiva de Sistema Admin.";
   refreshButton();return;
  }
  busy=true;configured=false;refreshButton();
  status.textContent="Comprobando Twilio Voice sin realizar llamadas…";
  try{
   const {data,error}=await sb.functions.invoke("interfon-voice-prueba",{body:{accion:"estado"}});
   if(error||!data?.ok)throw Error(data?.error||"No fue posible consultar Twilio Voice.");
   configured=data.configurado===true;
   status.textContent=configured
    ?"Twilio Voice está configurado para pruebas. Puedes llamar a tu número verificado. Solo se simularán respuestas; no se abrirá el portón."
    :data.falta_origen
      ?"Falta configurar el número de origen TWILIO_VOICE_FROM en Edge Functions → Secrets de Supabase. El SMS verificado no configura Voice automáticamente."
      :"No se detectó una configuración válida de Twilio Voice en los secretos de Supabase.";
  }catch(err){
   configured=false;
   status.textContent="No se pudo consultar Voice: "+(err?.message||"revisa tu conexión");
  }finally{busy=false;refreshButton();}
 }
 llamar.addEventListener("click",async()=>{
  if(!isOwner()||!configured||busy)return;
  if(!window.confirm("¿Quieres recibir ahora una llamada de prueba en tu teléfono verificado? Puede consumir minutos de Twilio. Las opciones 1, 2 y 3 son simulaciones: no se abrirá el portón."))return;
  busy=true;refreshButton();
  status.textContent="Solicitando una llamada de prueba a tu teléfono de Sistema Admin…";
  try{
   const {data,error}=await sb.functions.invoke("interfon-voice-prueba",{
     body:{accion:"llamar",confirmacion:true}
   });
   if(error||!data?.ok){
     let detail=data?.error;
     if(!detail&&error?.context?.json){
       try{const body=await error.context.json();detail=body?.error;}catch(_){}
     }
     throw Error(detail||"No se pudo iniciar la llamada; revisa los permisos de Twilio Voice.");
   }
   status.textContent="Twilio aceptó la solicitud de llamada al celular terminado en "+
    String(data.ultimos4||"••••")+". Atiende el teléfono; marca 1, 2 o 3 para probar el menú. No se abrirá ninguna puerta.";
  }catch(err){
   status.textContent="La llamada no pudo iniciarse: "+(err?.message||"intenta nuevamente");
  }finally{busy=false;refreshButton();}
 });
 actualizar.addEventListener("click",verificarEstado);
 window.cargarInterfonVoiceDemo=verificarEstado;
 refreshButton();
})();