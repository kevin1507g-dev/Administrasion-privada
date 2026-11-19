// Reutiliza el mismo enlace público que el QR de Repartidores y visitas.
// Mostrar/descargar el QR no concede autorización para abrir el portón.
(()=>{
 "use strict";
 const byId=id=>document.getElementById(id);
 const toggle=byId("qrMantenimientoToggle");
 const area=byId("qrMantenimientoContenido");
 const graphic=byId("qrMantenimientoImagen");
 const urlInput=byId("qrMantenimientoUrl");
 const info=byId("qrMantenimientoEstado");
 if(!toggle||!area||!graphic||!urlInput)return;
 let rendered=false;
 function url(){
   return new URL("./repartidor.html",document.baseURI).href;
 }
 function render(){
   urlInput.value=url();
   if(rendered)return true;
   if(typeof window.QRCode!=="function"){
     info.textContent="No se pudo generar el QR. Puedes utilizar o copiar el enlace del portal.";
     return false;
   }
   graphic.replaceChildren();
   try{
     new window.QRCode(graphic,{
       text:urlInput.value,
       width:240,
       height:240,
       colorDark:"#0f172a",
       colorLight:"#ffffff",
       correctLevel:window.QRCode.CorrectLevel.M
     });
     rendered=true;
     info.textContent="QR listo para colocar en la entrada. Escanearlo no abre el portón automáticamente.";
     return true;
   }catch(e){
     info.textContent="No se pudo generar el QR. Intenta abrir el portal desde el enlace.";
     return false;
   }
 }
 toggle.addEventListener("click",()=>{
   const show=area.classList.contains("hidden");
   area.classList.toggle("hidden",!show);
   toggle.setAttribute("aria-expanded",String(show));
   toggle.textContent=show?"Ocultar QR de repartidores y visitas":"📱 Mostrar QR de repartidores y visitas";
   if(show)render();
 });
 byId("qrMantenimientoCopiar")?.addEventListener("click",async()=>{
   const link=url();
   try{await navigator.clipboard.writeText(link);info.textContent="Enlace del Portero Virtual copiado.";}
   catch{
     urlInput.focus();urlInput.select();
     info.textContent="Selecciona y copia el enlace del Portero Virtual.";
   }
 });
 byId("qrMantenimientoDescargar")?.addEventListener("click",()=>{
   if(!render())return;
   const canvas=graphic.querySelector("canvas"),image=graphic.querySelector("img");
   let data=null;
   try{data=canvas?.toDataURL("image/png")||image?.src;}catch{}
   if(!data||!data.startsWith("data:image/png")){
     info.textContent="El QR está visible, pero no se pudo descargar. Puedes guardar una captura del código.";
     return;
   }
   const a=document.createElement("a");
   a.download="qr-repartidores-visitas-beteles.png";
   a.href=data;
   document.body.append(a);
   a.click();
   a.remove();
   info.textContent="QR preparado para descargar e imprimir.";
 });
})();