// Piloto local de 30 días. Solo datos ficticios; nunca crea solicitudes ni abre puertas.
(()=>{
  "use strict";
  const KEY="beteles_proveedores_demo_v1";
  const TTL=30*24*60*60*1000;
  const validHouse=x=>/^(4[0-9]|5[0-9]|6[0-6])$/.test(String(x||""));
  const validCode=x=>/^DEMO-[A-F0-9]{16}$/.test(String(x||""));
  function load(){
    try{
      const v=JSON.parse(localStorage.getItem(KEY)||"{}"),now=Date.now(),clean={};
      for(const [code,item] of Object.entries(v)){
        if(validCode(code)&&item&&typeof item==="object"&&Number(item.expires_at)>now&&validHouse(item.casa))clean[code]=item;
      }
      return clean;
    }catch{return {};}
  }
  function save(records){
    const entries=Object.entries(records).sort((a,b)=>Number(b[1].created_at)-Number(a[1].created_at)).slice(0,20);
    localStorage.setItem(KEY,JSON.stringify(Object.fromEntries(entries)));
  }
  function createCode(){
    const bytes=crypto.getRandomValues(new Uint8Array(8));
    return "DEMO-"+Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
  }
  window.proveedorDemoBuscar=(code)=>{
    if(!validCode(code))return null;
    return load()[code]||null;
  };
  const form=document.getElementById("formDemo");
  if(!form)return;
  const output=document.getElementById("codigoDemo");
  const status=document.getElementById("estadoDemo");
  const result=document.getElementById("demoResult");
  const portero=document.getElementById("demoPortero");
  const remove=document.getElementById("demoEliminar");
  let latest="";
  form.addEventListener("submit",e=>{
    e.preventDefault();
    if(!form.reportValidity())return;
    const value=id=>document.getElementById(id).value.trim().replace(/\s+/g," ");
    const nombre=value("demoNombre"),paterno=value("demoPaterno"),materno=value("demoMaterno");
    const empresa=value("demoEmpresa"),casa=value("demoCasa");
    if([nombre,paterno,materno].some(v=>v.length<2||v.length>70)||empresa.length<2||empresa.length>80||!validHouse(casa)){
      status.textContent="Revisa nombres, empresa y casa entre 40 y 66.";return;
    }
    if(!document.getElementById("demoConsent").checked){
      status.textContent="Confirma que solo utilizarás datos inventados para probar.";return;
    }
    try{
      const records=load();
      let codigo=createCode();
      while(Object.hasOwn(records,codigo))codigo=createCode();
      records[codigo]={nombre,apellido_paterno:paterno,apellido_materno:materno,empresa,casa,
        created_at:Date.now(),expires_at:Date.now()+TTL};
      save(records);
      latest=codigo;
      output.textContent=codigo;
      result.hidden=false;
      status.textContent="Código de demostración generado. Solo funciona en este navegador, no solicita ingreso real.";
      result.scrollIntoView({behavior:"smooth",block:"start"});
    }catch{
      status.textContent="No se pudieron guardar los datos de prueba en este navegador.";
    }
  });
  portero?.addEventListener("click",()=>{
    try{sessionStorage.setItem("proveedor_codigo_reciente",latest);}catch{}
  });
  document.getElementById("demoCopiar")?.addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(latest);status.textContent="Código de prueba copiado.";}
    catch{status.textContent="Copia el código que aparece arriba.";}
  });
  remove?.addEventListener("click",()=>{
    try{const records=load();delete records[latest];save(records);}catch{}
    latest="";result.hidden=true;form.reset();status.textContent="Código de prueba eliminado de este navegador.";
  });
})();