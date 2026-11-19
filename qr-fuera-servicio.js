// El QR sigue apuntando al mismo enlace: se consulta su estado en Supabase.
(()=>{
 "use strict";
 const layer=document.createElement("div");
 layer.id="porteroFueraServicio";
 layer.setAttribute("role","status");
 layer.setAttribute("aria-live","polite");
 layer.style.cssText="position:fixed;inset:0;background:#0b1220;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto";
 const card=document.createElement("section");
 card.style.cssText="max-width:520px;width:100%;background:#111827;border:1px solid #475569;color:#f8fafc;border-radius:22px;padding:30px;text-align:center;font-family:system-ui,-apple-system,sans-serif;line-height:1.6";
 const icon=document.createElement("div");icon.textContent="🛑";icon.style.cssText="font-size:50px";
 const title=document.createElement("h1");title.textContent="Verificando servicio";title.style.cssText="font-size:26px;line-height:1.25;margin:15px 0";
 const detail=document.createElement("p");detail.textContent="Comprobando disponibilidad del Portero Virtual…";
 const retry=document.createElement("button");retry.type="button";retry.textContent="↻ Volver a comprobar";
 retry.style.cssText="background:#2563eb;color:white;border:0;border-radius:12px;padding:14px;margin-top:15px;font:700 16px system-ui;cursor:pointer";
 card.append(icon,title,detail,retry);
 layer.append(card);
 document.body.append(layer);
 let busy=false;
 async function check(){
   if(busy)return;
   busy=true;
   try{
     const {data,error}=await sb.rpc("portero_servicio_estado");
     if(error||typeof data?.activo!=="boolean")throw Error("No se pudo verificar.");
     if(data.activo===true){
       layer.style.display="none";
     }else{
       layer.style.display="flex";
       title.textContent="QR fuera de servicio";
       detail.textContent="El Portero Virtual para repartidores y visitas está temporalmente fuera de servicio por mantenimiento. Contacta a Administración o al residente para acordar otra forma de acceso.";
     }
   }catch{
     layer.style.display="flex";
     title.textContent="Portero Virtual no disponible";
     detail.textContent="No es posible comprobar el estado del servicio. Intenta de nuevo más tarde.";
   }finally{busy=false;}
 }
 retry.addEventListener("click",check);
 check();
 setInterval(()=>{if(!document.hidden)check();},15000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)check();});
})();