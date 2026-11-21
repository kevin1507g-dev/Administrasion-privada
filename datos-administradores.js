// Fichas PRIVADAS de Sistema Admin y Administradores.
// Nunca se exponen en el QR, en el aviso publico ni a cuentas de residente.
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const section=$("datosAdministradores");
 if(!section)return;
 const select=$("datosAdminPerfil");
 const form=$("datosAdminForm");
 const message=$("datosAdminMensaje");
 const save=$("datosAdminGuardar");
 const reload=$("datosAdminRecargar");
 const fields={
   nombre_completo:$("datosAdminNombre"),
   domicilio:$("datosAdminDomicilio"),
   colonia:$("datosAdminColonia"),
   municipio:$("datosAdminMunicipio"),
   estado:$("datosAdminEstado"),
   codigo_postal:$("datosAdminCP"),
   correo_contacto:$("datosAdminCorreo"),
   telefono_contacto:$("datosAdminTelefono")
 };
 let records=[],busy=false,seq=0;
 const owner=()=>typeof profile!=="undefined"&&profile?.rol==="owner";
 const clear=()=>{
   for(const [key,input] of Object.entries(fields))input.value="";
 };
 const lock=()=>{
   const disabled=busy||!owner()||!select.value;
   save.disabled=disabled;
   select.disabled=busy||!owner();
   reload.disabled=busy;
   for(const input of Object.values(fields))input.disabled=disabled;
 };
 function applyRecord(){
   const item=records.find(r=>r.perfil_id===select.value);
   clear();
   if(item){
     for(const [key,input] of Object.entries(fields))input.value=String(item[key]??"");
     message.textContent=item.tiene_ficha
       ?"Ficha cargada. Puedes modificar sus datos y volver a guardarlos cuantas veces necesites."
       :"Esta cuenta no tiene ficha. Escribe sus datos y pulsa Guardar datos.";
   }else{
     message.textContent="Selecciona una cuenta de administrador.";
   }
   lock();
 }
 async function load(preserveMessage=false){
   if(!owner()){
     message.textContent="Solo Sistema Admin puede administrar esta información.";
     select.replaceChildren();
     clear();lock();return;
   }
   const req=++seq;
   const oldSelection=select.value;
   message.textContent="Consultando fichas privadas de administradores…";
   try{
     const {data,error}=await sb.rpc("administracion_datos_listar");
     if(error||!data?.ok||!Array.isArray(data.personas))throw Error(error?.message||"No se pudieron obtener las fichas.");
     if(req!==seq)return;
     records=data.personas;
     select.replaceChildren();
     for(const person of records){
       const role=person.rol==="owner"?"Sistema Admin":"Administrador";
       const title=role+" · "+String(person.nombre_cuenta||"Cuenta");
       select.append(new Option(title,String(person.perfil_id)));
     }
     const chosen=records.find(r=>r.perfil_id===oldSelection)
       ||records.find(r=>r.rol==="owner")
       ||records[0];
     if(chosen)select.value=chosen.perfil_id;
     applyRecord();
     if(preserveMessage)message.textContent="✅ Información guardada. Puedes editarla de nuevo cuando lo necesites.";
   }catch(e){
     if(req!==seq)return;
     select.replaceChildren();
     clear();
     message.textContent="No se pudieron consultar los datos privados: "+(e?.message||"Error de conexión");
   }finally{lock();}
 }
 select.addEventListener("change",applyRecord);
 reload.addEventListener("click",()=>load());
 form.addEventListener("submit",async e=>{
   e.preventDefault();
   if(!owner()||busy||!select.value)return;
   if(!fields.nombre_completo.value.trim()){
     message.textContent="Escribe el nombre completo del administrador.";
     return;
   }
   if(fields.codigo_postal.value.trim()&&!/^[0-9]{5}$/.test(fields.codigo_postal.value.trim())){
     message.textContent="El código postal debe contener exactamente 5 dígitos.";
     return;
   }
   busy=true;lock();
   message.textContent="Guardando los datos privados…";
   try{
     const {data,error}=await sb.rpc("administracion_datos_guardar",{
       p_perfil_id:select.value,
       p_nombre_completo:fields.nombre_completo.value,
       p_domicilio:fields.domicilio.value,
       p_colonia:fields.colonia.value,
       p_municipio:fields.municipio.value,
       p_estado:fields.estado.value,
       p_codigo_postal:fields.codigo_postal.value,
       p_correo_contacto:fields.correo_contacto.value,
       p_telefono_contacto:fields.telefono_contacto.value
     });
     if(error||!data?.ok)throw Error(error?.message||"No se guardaron los cambios.");
     await load(true);
   }catch(e){
     message.textContent="No se pudo guardar la ficha: "+(e?.message||"Intenta otra vez.");
   }finally{busy=false;lock();}
 });
 window.cargarDatosAdministradores=()=>load();
 lock();
})();
