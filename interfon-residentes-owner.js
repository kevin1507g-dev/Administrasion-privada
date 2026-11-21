// Directorio privado por casa: solo Sistema Admin puede administrar números.
// Requiere declaración de autorización del titular. No envía códigos SMS ni activa llamadas.
(()=>{
 "use strict";
 const el=id=>document.getElementById(id);
 const section=el("interfonResidentesOwner");
 if(!section)return;
 const estado=el("interfonOwnerEstado"),form=el("interfonOwnerFormulario");
 const casa=el("interfonOwnerCasa"),slot=el("interfonOwnerSlot");
 const tipo=el("interfonOwnerTipo"),numero=el("interfonOwnerNumero");
 const autoriza=el("interfonOwnerAutoriza"),guardar=el("interfonOwnerGuardar");
 const actualizar=el("interfonOwnerActualizar"),lista=el("interfonOwnerLista");
 let casas=[],working=false;
 const canEdit=()=>typeof profile!=="undefined"&&profile?.rol==="owner";
 const nombreSlot=x=>x==="principal"?"Principal":"Respaldo";
 const numeroValido=()=>numero.value.replace(/\D/g,"").length===10;
 function bloquear(){
   const dis=working||!canEdit();
   casa.disabled=dis;slot.disabled=dis;tipo.disabled=dis;
   numero.disabled=dis;autoriza.disabled=dis;actualizar.disabled=dis;
   guardar.disabled=dis||!casa.value||!numeroValido()||!autoriza.checked;
 }
 function mostrarContactos(){
   lista.replaceChildren();
   if(!canEdit())return;
   const seleccion=casas.find(c=>String(c.casa)===String(casa.value));
   if(!seleccion){
     const p=document.createElement("p");
     p.className="muted";p.textContent="Selecciona una casa para consultar sus contactos.";
     lista.append(p);
     return;
   }
   for(const key of ["principal","respaldo"]){
     const contacto=(Array.isArray(seleccion.contactos)?seleccion.contactos:[]).find(c=>c.slot===key);
     const card=document.createElement("div");
     card.className="card";
     card.style.cssText="padding:12px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px";
     const contenido=document.createElement("div");
     const titulo=document.createElement("strong");titulo.textContent="Casa "+casa.value+" · "+nombreSlot(key);
     const descripcion=document.createElement("p");descripcion.className="muted";
     descripcion.style.margin="6px 0 0";
     descripcion.textContent=contacto
       ? ((contacto.tipo==="fijo"?"Fijo":"Celular")+" · •••• "+String(contacto.ultimos4||"")+
           (contacto.verificado?" · Verificado":(contacto.origen_registro==="sistema_admin"
             ?" · Registrado por Sistema Admin (sin SMS)":" · Sin verificar")))
       : "Sin número registrado";
     contenido.append(titulo,descripcion);card.append(contenido);
     if(contacto){
       const actions=document.createElement("div");
       actions.className="actions";
       actions.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
       const editar=document.createElement("button");
       editar.type="button";editar.textContent="Modificar";
       editar.style.width="auto";editar.disabled=working;
       editar.addEventListener("click",()=>{
         slot.value=key;tipo.value=contacto.tipo==="fijo"?"fijo":"movil";
         numero.value="";autoriza.checked=false;
         bloquear();numero.focus();
         estado.textContent="Escribe el nuevo número de Casa "+casa.value+" ("+nombreSlot(key)+") y confirma la autorización del titular.";
       });
       const borrar=document.createElement("button");
       borrar.type="button";borrar.textContent="Eliminar";
       borrar.style.width="auto";borrar.disabled=working;
       borrar.addEventListener("click",async()=>{
         if(working||!canEdit()||!window.confirm("¿Eliminar el teléfono "+nombreSlot(key)+" de Casa "+casa.value+"?"))return;
         working=true;bloquear();
         const casaActual=casa.value;
         estado.textContent="Eliminando teléfono…";
         try{
           const {data,error}=await sb.rpc("interfon_owner_eliminar_casa",{
              p_casa:casaActual,p_slot:key
           });
           if(error||!data?.ok)throw Error(error?.message||"No se pudo eliminar.");
           await cargar();
           estado.textContent="Teléfono eliminado de Casa "+casaActual+".";
         }catch(err){
           estado.textContent="No se pudo eliminar: "+(err?.message||"intenta nuevamente");
         }finally{working=false;bloquear();mostrarContactos();}
       });
       actions.append(editar,borrar);card.append(actions);
     }
     lista.append(card);
   }
 }
 async function cargar(){
   if(!canEdit()){
     lista.replaceChildren();
     estado.textContent="Solo Sistema Admin puede consultar los contactos de todas las casas.";
     return;
   }
   estado.textContent="Consultando contactos privados por casa…";
   const seleccion=casa.value;
   try{
     const {data,error}=await sb.rpc("interfon_owner_listar_casas");
     if(error||!data?.ok)throw Error(error?.message||"No se pudo consultar.");
     casas=Array.isArray(data.casas)?data.casas:[];
     casa.replaceChildren(new Option("Selecciona una casa",""));
     for(const c of casas){
       casa.add(new Option("Casa "+String(c.casa),String(c.casa)));
     }
     if(casas.some(c=>String(c.casa)===String(seleccion)))casa.value=seleccion;
     mostrarContactos();
     estado.textContent="Elige una casa para agregar, modificar o eliminar teléfonos. Solo se muestran los últimos cuatro dígitos.";
   }catch(err){
     casas=[];casa.replaceChildren(new Option("Selecciona una casa",""));
     lista.replaceChildren();
     estado.textContent="No se pudo cargar el directorio: "+(err?.message||"sin conexión");
   }
   bloquear();
 }
 form.addEventListener("submit",async e=>{
   e.preventDefault();
   if(!canEdit()||working)return;
   const digits=numero.value.replace(/\D/g,"");
   if(!casa.value||digits.length!==10||!autoriza.checked){
     estado.textContent="Selecciona casa, escribe diez dígitos y confirma la autorización del titular.";
     return;
   }
   const numeroCasa=casa.value,slotCasa=slot.value;
   working=true;bloquear();
   estado.textContent="Guardando de forma cifrada el teléfono de Casa "+numeroCasa+"…";
   try{
     const {data,error}=await sb.rpc("interfon_owner_guardar_casa",{
       p_casa:numeroCasa,p_slot:slotCasa,p_numero:"+52"+digits,
       p_tipo:tipo.value,p_autorizacion:true
     });
     if(error||!data?.ok)throw Error(error?.message||"No se pudo guardar.");
     numero.value="";autoriza.checked=false;
     await cargar();
     estado.textContent="Guardado el teléfono "+nombreSlot(slotCasa)+" de Casa "+numeroCasa+" sin pedir SMS. Las llamadas siguen desactivadas.";
   }catch(err){
     estado.textContent="No se pudo guardar: "+(err?.message||"intenta nuevamente");
   }finally{working=false;bloquear();mostrarContactos();}
 });
 casa.addEventListener("change",()=>{numero.value="";autoriza.checked=false;mostrarContactos();bloquear();});
 for(const input of [slot,tipo,numero,autoriza]){
   input.addEventListener("input",bloquear);input.addEventListener("change",bloquear);
 }
 actualizar.addEventListener("click",cargar);
 window.cargarInterfonResidentesOwner=cargar;
 bloquear();
})();
