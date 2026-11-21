// Directorio del futuro interfón. Números privados en el servidor; solo últimos 4 dígitos al cliente.
// El registro sigue desactivado hasta contar con un aviso de privacidad y verificación de teléfonos.
(()=>{
 "use strict";
 const el=id=>document.getElementById(id);
 const section=el("interfonTelefonos");
 if(!section)return;
 const status=el("interfonTelEstado");
 const area=el("interfonTelArea");
 const heading=el("interfonTelTitulo");
 const destination=el("interfonTelDestino");
 const list=el("interfonTelLista");
 const form=el("interfonTelFormulario");
 const slot=el("interfonTelSlot");
 const tipo=el("interfonTelTipo");
 const numero=el("interfonTelNumero");
 const consent=el("interfonTelConsentimiento");
 const save=el("interfonTelGuardar");
 const refresh=el("interfonTelActualizar");
 let last=null,working=false;
 const allowed=()=>typeof profile!=="undefined"&&profile&&["residente","owner"].includes(profile.rol);
 const prettySlot=s=>s==="principal"?"Teléfono principal":s==="respaldo"?"Teléfono de respaldo":"Sistema Admin";
 const esHabilitado=()=>Boolean(last?.captura_habilitada);
 function habilitarFormulario(){
   const disabled=working||!esHabilitado()||!allowed();
   slot.disabled=disabled;tipo.disabled=disabled;numero.disabled=disabled;consent.disabled=disabled;
   const num=numero.value.replace(/\D/g,"");
   save.disabled=disabled||num.length!==10||!consent.checked;
 }
 function showList(items){
   list.replaceChildren();
   const targets=last?.destino==="sistema_admin"?["sistema_admin"]:["principal","respaldo"];
   for(const key of targets){
     const item=(Array.isArray(items)?items:[]).find(x=>x.slot===key);
     const row=document.createElement("div");
     row.className="card";
     row.style.cssText="padding:12px;display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap";
     const detail=document.createElement("div");
     const title=document.createElement("strong");title.textContent=prettySlot(key);
     const description=document.createElement("p");description.className="muted";description.style.margin="4px 0 0";
     description.textContent=item
       ? ((item.tipo==="fijo"?"Fijo":"Celular")+" · •••• "+String(item.ultimos4||"")+
          (item.verificado?" · Verificado":" · Pendiente de verificación"))
       : "Todavía no hay número registrado";
     detail.append(title,description);
     row.append(detail);
     if(item){
       const erase=document.createElement("button");
       erase.type="button";erase.textContent="Eliminar";
       erase.style.width="auto";
       erase.disabled=working;
       erase.addEventListener("click",async()=>{
         if(working||!window.confirm("¿Eliminar el número de "+prettySlot(key)+" del directorio del interfón?"))return;
         working=true;habilitarFormulario();status.textContent="Eliminando teléfono…";
         try{
           const {data,error}=await sb.rpc("interfon_eliminar_telefono",{p_slot:key});
           if(error||!data?.ok)throw Error(error?.message||"No se pudo eliminar.");
           await load();
         }catch(err){status.textContent="No fue posible eliminar: "+(err?.message||"intenta nuevamente");}
         finally{working=false;habilitarFormulario();}
       });
       row.append(erase);
     }
     list.append(row);
   }
 }
 async function load(){
   if(!allowed()){
     area.classList.add("hidden");
     status.textContent="El directorio corresponde a los residentes de cada casa o a Sistema Admin.";
     return;
   }
   status.textContent="Consultando la configuración privada del interfón…";
   try{
     const {data,error}=await sb.rpc("interfon_mis_telefonos");
     if(error||!data?.ok)throw Error(error?.message||"No fue posible consultar los teléfonos.");
     last=data;
     area.classList.remove("hidden");
     if(data.destino==="sistema_admin"){
       heading.textContent="📞 Teléfono de Sistema Admin";
       destination.textContent="Contacto de respaldo del condominio · visible únicamente como número enmascarado";
       slot.replaceChildren(new Option("Teléfono de Sistema Admin","sistema_admin"));
     }else{
       heading.textContent="📞 Teléfonos de mi casa";
       destination.textContent="Casa "+String(data.casa||"—")+" · principal y respaldo";
       if(slot.options.length!==2||slot.options[0].value!=="principal"){
         slot.replaceChildren(new Option("Teléfono principal","principal"),new Option("Teléfono de respaldo","respaldo"));
       }
     }
     showList(data.telefonos);
     status.textContent=data.captura_habilitada
       ?"Registro de números habilitado. Los números guardados permanecerán pendientes de verificación y no recibirán llamadas todavía."
       :"Registro de números todavía no disponible. Falta validar el aviso de privacidad, la protección de teléfonos y el servicio de verificación; no se están realizando llamadas.";
   }catch(err){
     last=null;area.classList.add("hidden");
     status.textContent="No se pudo consultar la configuración: "+(err?.message||"sin conexión");
   }
   habilitarFormulario();
 }
 form.addEventListener("submit",async(event)=>{
   event.preventDefault();
   if(working||!allowed()||!esHabilitado())return;
   const digits=numero.value.replace(/\D/g,"");
   if(digits.length!==10||!consent.checked){
     status.textContent="Introduce los diez dígitos y confirma tu autorización.";
     return;
   }
   working=true;habilitarFormulario();status.textContent="Guardando el número de manera privada…";
   try{
     const {data,error}=await sb.rpc("interfon_guardar_telefono",{
       p_slot:slot.value,
       p_numero:"+52"+digits,
       p_tipo:tipo.value,
       p_consentimiento:true
     });
     if(error||!data?.ok)throw Error(error?.message||"No fue posible guardar el número.");
     numero.value="";consent.checked=false;
     await load();
   }catch(err){
     status.textContent="No se pudo guardar el número: "+(err?.message||"intenta otra vez");
   }finally{working=false;habilitarFormulario();}
 });
 for(const control of [numero,consent,slot,tipo]){
   control.addEventListener("input",habilitarFormulario);
   control.addEventListener("change",habilitarFormulario);
 }
 refresh.addEventListener("click",load);
 window.cargarInterfonTelefonos=load;
 habilitarFormulario();
})();
