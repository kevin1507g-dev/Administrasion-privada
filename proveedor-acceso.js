// Integración de proveedores: código de registro = perfil, NO llave física.
(()=>{
 const menu=document.getElementById("accessChoice");
 const card=document.getElementById("porteroCard");
 if(!menu||!card||typeof sb==="undefined")return;
 // Un perfil DEMO no debe enviar órdenes ni generar solicitudes reales.
 window.proveedorDemoActivo=false;
 const porteroForm=document.getElementById("porteroForm");
 porteroForm?.addEventListener("submit",event=>{
   if(!window.proveedorDemoActivo)return;
   event.preventDefault();event.stopImmediatePropagation();
   const status=document.getElementById("porteroEstado");
   if(status){status.hidden=false;status.textContent="Este es un código DEMO; el registro de prueba no permite solicitar ingresos reales."}
 },true);
 const box=document.createElement("section");
 box.style.cssText="background:#0b2230;border:1px solid #357f78;border-radius:14px;padding:14px;margin:12px 0 20px";
 const heading=document.createElement("h3");heading.textContent="🪪 Código de proveedor";heading.style.marginTop="0";
 const description=document.createElement("p");
 description.className="muted portero-small";
 description.textContent="Introduce un código PR aprobado para solicitar autorización del residente. Los códigos DEMO permiten únicamente probar el autocompletado sin enviar solicitudes ni abrir el portón.";
 const label=document.createElement("label");label.htmlFor="proveedorCodigo";label.textContent="Tu código personal";
 const input=document.createElement("input");input.id="proveedorCodigo";input.type="text";
 input.maxLength=23;input.autocomplete="off";input.autocapitalize="characters";input.placeholder="PR-XXXXXXXXXXXXXXXXXXXX";
 const retrieve=document.createElement("button");retrieve.type="button";retrieve.textContent="🔎 Recuperar mis datos";
 retrieve.style.marginTop="10px";
 const request=document.createElement("button");request.type="button";request.textContent="🔔 Solicitar acceso (3 minutos)";
 request.className="primary hidden";request.style.marginTop="10px";
 const status=document.createElement("p");status.className="muted portero-small";status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 box.append(heading,description,label,input,retrieve,request,status);
 card.insertBefore(box,card.querySelector("form"));
 let registeredCode=null,busy=false;
 function invalidate(){registeredCode=null;request.classList.add("hidden");window.proveedorSolicitudActiva=false;window.proveedorDemoActivo=false;const b=document.getElementById("porteroEnviar");if(b)b.disabled=false;}
 input.addEventListener("input",invalidate);
 async function call(body){
  const {data,error}=await sb.functions.invoke("proveedores-registro",{body});
  if(error){let message=error.message||"No se pudo contactar al servidor.";try{const x=await error.context?.json?.();if(x?.error)message=x.error;}catch(_){}throw Error(message);}
  if(data?.error)throw Error(data.error);
  return data;
 }
 async function lookup(){
  if(busy)return;
  const codigo=input.value.trim().toUpperCase();
  if(/^DEMO-[A-F0-9]{16}$/.test(codigo)){
   invalidate();
   const demo=window.proveedorDemoBuscar?.(codigo);
   if(!demo){status.textContent="Código de prueba no encontrado o vencido. Solo funciona en el mismo navegador donde se generó.";return;}
   document.getElementById("porteroCasa").value=demo.casa;
   document.getElementById("porteroTipo").value="otro";
   document.getElementById("porteroEmpresa").value=demo.empresa;
   document.getElementById("porteroNombre").value=[demo.nombre,demo.apellido_paterno,demo.apellido_materno].join(" ");
   document.getElementById("porteroMensaje").value="Simulación de proveedor de "+demo.empresa+". No solicitar acceso real.";
   document.getElementById("porteroAutorizacion").value="sin_codigo";
   if(typeof porteroAlternarCodigo==="function")porteroAlternarCodigo();
   window.proveedorDemoActivo=true;
   document.getElementById("porteroEnviar").disabled=true;
   document.getElementById("porteroPedirConfirmacion").classList.add("hidden");
   status.textContent="🧪 Prueba correcta: datos y empresa rellenados para Casa "+demo.casa+". Este código no permite solicitudes ni aperturas reales. Para volver a un acceso normal, recarga la página.";
   return;
  }
  if(!/^PR-[A-F0-9]{20}$/.test(codigo)){status.textContent="Revisa tu código de registro de proveedor.";return;}
  busy=true;retrieve.disabled=true;request.classList.add("hidden");status.textContent="Buscando registro autorizado…";
  try{
   const data=await call({accion:"consultar",codigo});
   document.getElementById("porteroCasa").value=data.casa;
   document.getElementById("porteroTipo").value="otro";
   document.getElementById("porteroEmpresa").value=data.empresa;
   document.getElementById("porteroNombre").value=data.nombre_completo;
   document.getElementById("porteroMensaje").value="Solicitud de acceso de proveedor registrado.";
   document.getElementById("porteroAutorizacion").value="sin_codigo";
   if(typeof porteroAlternarCodigo==="function")porteroAlternarCodigo();
   registeredCode=codigo;request.classList.remove("hidden");
   status.textContent="✅ Datos recuperados para Casa "+data.casa+". Para ingresar es indispensable que el residente autorice la solicitud.";
  }catch(e){invalidate();status.textContent=e.message||"No se pudo recuperar el registro.";}
  finally{busy=false;retrieve.disabled=false;}
 }
 retrieve.addEventListener("click",lookup);
 input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();lookup();}});
 request.addEventListener("click",async()=>{
  if(busy||!registeredCode)return;
  busy=true;request.disabled=true;status.textContent="Solicitando autorización al residente…";
  try{
   const response=await call({accion:"solicitar_acceso",codigo:registeredCode});
   window.proveedorSolicitudActiva=true;
   token=response.token;
   expiresAt=response.expires_at;
   esperandoPorteroMixto=false;
   porteroIntervencionAt=null;
   porteroChatEscalado=false;porteroChatEscalando=false;porteroChatReintentarEn=0;
   document.getElementById("porteroCard").classList.add("hidden");
   document.getElementById("accessChoice").classList.add("hidden");
   document.getElementById("waitCard").classList.remove("hidden");
   document.getElementById("waitTitle").textContent="⏳ Proveedor: esperando autorización (3 minutos)";
   document.getElementById("waitText").textContent="El residente debe autorizar dentro de 3 minutos. El portón permanece cerrado hasta recibir la orden.";
   document.getElementById("answer").textContent="";
   document.getElementById("newBtn").classList.add("hidden");
   if(pollTimer)clearInterval(pollTimer);
   await consultarEstado();
   pollTimer=setInterval(consultarEstado,3000);
  }catch(e){window.proveedorSolicitudActiva=false;status.textContent=e.message||"No se pudo generar la solicitud.";}
  finally{busy=false;request.disabled=false;}
 });
 // Si el proveedor acaba de registrarse, no se escribe su código en la URL.
 try{
  const recent=sessionStorage.getItem("proveedor_codigo_reciente");
  if(recent){
   sessionStorage.removeItem("proveedor_codigo_reciente");
   input.value=recent;
   seleccionarEntrada("portero");
   lookup();
  }
 }catch(_){}
 window.addEventListener("beforeunload",()=>{window.proveedorSolicitudActiva=false;});
})();
