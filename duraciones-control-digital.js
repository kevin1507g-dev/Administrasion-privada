// Ajustes persistentes de duración para futuras activaciones, solo Sistema Admin.
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const owner=()=>document.body.dataset.sessionRole==='owner' &&
    document.body.dataset.ownerPanel==='owner';
  const modal=()=>el('digitalDurationsDialog');
  const message=text=>{const node=el('digitalDurationsStatus');if(node)node.textContent=text;};
  const busy=flag=>{
    for(const id of ['durationGarbageMinutes','durationParcelMinutes','digitalDurationsSaveBtn']) {
      const node=el(id);if(node)node.disabled=flag;
    }
  };
  let sending=false;
  async function open(){
    if(!owner()||sending)return;
    const dialog=modal();if(!dialog)return;
    if(!dialog.open)dialog.showModal();
    busy(true);
    message('Consultando tiempos guardados...');
    try {
      const {data,error}=await sb.rpc('access_window_durations_get');
      if(error)throw error;
      if(!data||!Number.isInteger(data.garbage_minutes)||!Number.isInteger(data.parcel_minutes))
        throw new Error('La configuración recibida no es válida.');
      el('durationGarbageMinutes').value=String(data.garbage_minutes);
      el('durationParcelMinutes').value=String(data.parcel_minutes);
      message('Modifica los minutos y pulsa Guardar tiempos.');
    }catch(err){
      message('No fue posible consultar los tiempos: '+(err?.message||'error de conexión'));
    }finally{busy(false);}
  }
  function close(){
    if(sending)return;
    modal()?.close();
  }
  async function save(){
    if(!owner()||sending||!modal()?.open)return;
    const garbage=Number(el('durationGarbageMinutes').value);
    const parcel=Number(el('durationParcelMinutes').value);
    if(!Number.isInteger(garbage)||garbage<1||garbage>20||
       !Number.isInteger(parcel)||parcel<1||parcel>3){
      message('Valores válidos: basura de 1 a 20 minutos y paquetería de 1 a 3 minutos.');
      return;
    }
    sending=true;busy(true);message('Guardando cambios...');
    try {
      const {data,error}=await sb.rpc('access_window_durations_set',{
        p_garbage_minutes:garbage,p_parcel_minutes:parcel
      });
      if(error)throw error;
      if(!data||data.garbage_minutes!==garbage||data.parcel_minutes!==parcel)
        throw new Error('No se pudo confirmar el guardado.');
      message('Tiempos guardados: basura '+garbage+' min y paquetería '+parcel+
        ' min. Se aplicarán a las siguientes activaciones.');
      await Promise.allSettled([
        typeof basuraActualizar==='function'?basuraActualizar():Promise.resolve(),
        typeof window.paqueteriaActualizar==='function'?window.paqueteriaActualizar():Promise.resolve()
      ]);
    }catch(err){
      message('No se pudieron guardar los tiempos: '+(err?.message||'error de conexión'));
    }finally{sending=false;busy(false);}
  }
  window.abrirDuracionesControlDigital=open;
  window.guardarDuracionesControlDigital=save;
  window.cerrarDuracionesControlDigital=close;
})();
