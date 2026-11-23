// Vista previa de un botón para paquetería. NO acciona relés ni abre el portón.
// La apertura sostenida de un portón real requiere un controlador con protección
// antiatrapamiento y confirmación de estado; este panel no posee esos sensores.
(function(){
  'use strict';
  const TIME_MS=3*60*1000;
  let endsAt=0;
  let interval=null;
  const status=()=>document.getElementById('paqueteriaPreviewStatus');
  const cancelBtn=()=>document.getElementById('paqueteriaCancelBtn');
  const beginBtn=()=>document.getElementById('paqueteriaPreviewBtn');
  const authorized=()=>document.body?.dataset?.sessionRole==='owner'||
                       document.body?.dataset?.sessionRole==='admin';
  function stop(finished){
    if(interval)clearInterval(interval);
    interval=null;
    endsAt=0;
    if(cancelBtn())cancelBtn().hidden=true;
    if(beginBtn())beginBtn().disabled=false;
    if(status())status().textContent=finished
      ?'Demostración de tres minutos terminada. No se enviaron instrucciones al portón.'
      :'Demostración cancelada. No se enviaron instrucciones al portón.';
  }
  function render(){
    if(!endsAt)return;
    const remaining=Math.max(0,endsAt-Date.now());
    if(!remaining){stop(true);return;}
    const seconds=Math.ceil(remaining/1000);
    const mm=String(Math.floor(seconds/60)).padStart(2,'0');
    const ss=String(seconds%60).padStart(2,'0');
    if(status())status().textContent='Simulación de Paquetería: '+mm+':'+ss+
       ' restantes. Esta cuenta regresiva NO abre ni mantiene abierto el portón.';
  }
  window.paqueteriaVistaPrevia=function(){
    if(!authorized()||endsAt)return;
    endsAt=Date.now()+TIME_MS;
    if(beginBtn())beginBtn().disabled=true;
    if(cancelBtn())cancelBtn().hidden=false;
    render();
    interval=setInterval(render,1000);
  };
  window.paqueteriaCancelarVistaPrevia=function(){if(authorized())stop(false);};
  window.addEventListener('pagehide',()=>{
    if(interval)clearInterval(interval);
    interval=null;
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
})();
