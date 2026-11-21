// Directorio del futuro interfón. Números privados en el servidor; solo últimos 4 dígitos al cliente.
// En esta fase solo Sistema Admin puede registrar su propio teléfono, cifrado y pendiente de verificación. Residentes continúan sin captura.
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
 let last=null,working=false,verifyReady=false;
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
          (item.verificado?" · Verificado":(item.origen_registro==="sistema_admin"?" · Añadido por Sistema Admin, sin SMS":" · Pendiente de verificación")))
       : "Todavía no hay número registrado";
     detail.append(title,description);
     row.append(detail);
     if(item && key==="sistema_admin" && !item.verificado && item.tipo==="movil"){
       const panel=document.createElement("div");
       panel.style.cssText="display:flex;flex-direction:column;gap:9px;width:100%;margin-top:10px";
       const info=document.createElement("p");
       info.className="muted";
       info.textContent=verifyReady
        ? "Verifica este celular por SMS. El código llegará únicamente al número registrado."
        : "Para activar el envío de códigos, conecta primero Twilio Verify en Supabase; el SMS aún no está disponible.";
       const send=document.createElement("button");
       send.type="button";send.className="primary";send.textContent="📲 Enviar código";
       send.disabled=!verifyReady||working;
       send.style.width="fit-content";
       const checkRow=document.createElement("div");
       checkRow.style.cssText="display:flex;gap:8px;align-items:center;flex-wrap:wrap";
       const input=document.createElement("input");
       input.type="text";input.inputMode="numeric";input.autocomplete="one-time-code";
       input.placeholder="Código de 6 dígitos";input.maxLength=6;
       input.setAttribute("aria-label","Código de verificación SMS de seis dígitos");
       input.disabled=!verifyReady;
       input.style.cssText="max-width:220px;min-width:150px";
       const confirm=document.createElement("button");
       confirm.type="button";confirm.textContent="✅ Verificar código";
       confirm.disabled=true;
       confirm.style.width="fit-content";
       const message=document.createElement("p");
       message.className="muted";message.setAttribute("role","status");
       input.addEventListener("input",()=>{
         input.value=input.value.replace(/\D/g,"").slice(0,6);
         confirm.disabled=!verifyReady||working||input.value.length!==6;
       });
       async function invokeVerify(accion){
         if(working||!verifyReady)return;
         working=true;send.disabled=true;confirm.disabled=true;
         message.textContent=accion==="enviar"?"Solicitando SMS…":"Comprobando código…";
         try{
           const payload={accion};
           if(accion==="comprobar")payload.codigo=input.value;
           const {data,error}=await sb.functions.invoke("interfon-verify",{body:payload});
           if(error||!data?.ok){
             let detail=data?.error;
             if(!detail && error?.context?.json){
               try{const body=await error.context.json();detail=body?.error;}catch(_){}
             }
             throw Error(detail||"No se pudo verificar. Revisa la conexión de Twilio.");
           }
           if(accion==="comprobar"){
             message.textContent="¡Número verificado correctamente! Las llamadas aún están desactivadas.";
             await load();
           }else{
             message.textContent="Código enviado al celular terminado en "+(data.ultimos4||"••••")+".";
             input.focus();
           }
         }catch(err){
           message.textContent=err?.message||"Hubo un problema con la verificación.";
         }finally{
           working=false;
           send.disabled=!verifyReady;
           confirm.disabled=!verifyReady||input.value.length!==6;
           habilitarFormulario();
         }
       }
       send.addEventListener("click",()=>invokeVerify("enviar"));
       confirm.addEventListener("click",()=>invokeVerify("comprobar"));
       checkRow.append(input,confirm);
       panel.append(info,send,checkRow,message);
       row.append(panel);
     }
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
     verifyReady=false;
     if(data.destino==="sistema_admin" && (data.telefonos||[]).some(t=>t.slot==="sistema_admin" && t.tipo==="movil" && !t.verificado)){
       try{
         const {data:check,error:checkError}=await sb.functions.invoke("interfon-verify",{body:{accion:"estado"}});
         verifyReady=!checkError && check?.ok===true && check?.configurado===true;
       }catch(_){verifyReady=false;}
     }
     showList(data.telefonos);
     status.textContent=data.destino==="sistema_admin"
       ? (data.captura_habilitada
         ? "Puedes registrar tu propio celular o fijo. El número se almacena cifrado; quedará pendiente de verificación y NO recibirá llamadas todavía."
         : "El registro del número de Sistema Admin está temporalmente deshabilitado.")
       : "El registro de números de residentes aún no está disponible; falta completar el aviso integral y la verificación. No se están realizando llamadas.";
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
