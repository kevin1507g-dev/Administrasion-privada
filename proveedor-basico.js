// Registro básico real: solo se habilita al completar el aviso de privacidad.
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const form=$("basicoForm"),button=$("basicoEnviar"),status=$("basicoEstado");
  if(!form||!button||!status||typeof sb==="undefined")return;
  const result=$("basicoResultado");
  let code="";
  async function api(data){
    const {data:response,error}=await sb.functions.invoke("proveedores-registro",{body:data});
    if(error){
      let message=error.message||"Error al comunicarse con el servidor.";
      try{const x=await error.context?.json?.();if(x?.error)message=x.error;}catch{}
      throw Error(message);
    }
    if(response?.error)throw Error(response.error);
    return response;
  }
  async function capabilities(){
    try{
      const res=await api({accion:"capacidades"});
      if(!res.registro_basico_habilitado){
        status.textContent="El registro real está preparado, pero requiere completar y validar el domicilio del responsable en el aviso de privacidad. Mientras tanto puedes solicitar ingreso desde el Portero Virtual, sin registrarte.";
        button.disabled=true;
        return;
      }
      button.disabled=false;
      status.textContent="Registro real habilitado. Tu código quedará pendiente de aprobación por Sistema Admin.";
    }catch(e){
      status.textContent=e.message||"Servicio no disponible.";button.disabled=true;
    }
  }
  capabilities();
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(button.disabled||!form.reportValidity())return;
    const value=id=>$(id).value.trim().replace(/\s+/g," ");
    const body={accion:"registro_basico",nombre:value("basicoNombre"),
      apellido_paterno:value("basicoPaterno"),apellido_materno:value("basicoMaterno"),
      empresa:value("basicoEmpresa"),casa:value("basicoCasa"),
      consentimiento:$("basicoConsent").checked};
    button.disabled=true;status.textContent="Registrando proveedor en el servidor…";
    try{
      const res=await api(body);
      code=res.codigo;
      $("basicoCodigo").textContent=code;
      $("basicoCard").hidden=true;
      result.hidden=false;
      result.scrollIntoView({behavior:"smooth",block:"start"});
      status.textContent="Registro recibido; pendiente de aprobación por Sistema Admin.";
    }catch(err){
      status.textContent=err.message||"No fue posible completar el registro.";
      button.disabled=false;
    }
  });
  $("basicoCopiar")?.addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(code);$("basicoCopiar").textContent="✓ Código copiado";}
    catch{$("basicoCopiar").textContent="Copia el código mostrado arriba";}
  });
  $("basicoAlPortero")?.addEventListener("click",()=>{
    try{sessionStorage.setItem("proveedor_codigo_reciente",code);}catch{}
  });
})();