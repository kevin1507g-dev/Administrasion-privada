// Paquetería: ventana de 3 minutos en el Modo Evento existente.
// Toda autorización, duración y exclusión se valida en Supabase.
// NO se considera confirmación de apertura o posición del portón.
(function () {
  'use strict';
  let busy=false, reading=false, current=null;
  const byId=id=>document.getElementById(id);
  const section=()=>byId('controlDigital');
  const authorized=()=>['owner','admin'].includes(document.body?.dataset?.sessionRole);
  const startButton=()=>byId('paqueteriaStartBtn');
  const stopButton=()=>byId('paqueteriaCancelBtn');
  const status=()=>byId('paqueteriaStatus');
  let lastError='';

  function render() {
    const start=startButton(),stop=stopButton(),label=status();
    if(!start||!stop||!label)return;
    if(!authorized()){
      start.disabled=true;
      stop.hidden=true;
      return;
    }
    const active=!!current?.active;
    start.disabled=busy||reading||!current?.allowed||!current?.hardware_ready||active;
    stop.hidden=!active;
    stop.disabled=busy||reading||!current?.allowed;
    if(lastError) {
      label.textContent=lastError;
      return;
    }
    if(!current) {
      label.textContent='Consultando disponibilidad del Modo Evento...';
      return;
    }
    if(!active) {
      label.textContent=current.reason||'No hay ventana de Paquetería activa.';
      return;
    }
    const remaining=Math.max(0,Date.parse(current.until||'')-Date.now());
    const seconds=Math.ceil(remaining/1000);
    const mm=String(Math.floor(seconds/60)).padStart(2,'0');
    const ss=String(seconds%60).padStart(2,'0');
    label.textContent='Paquetería · Modo Evento solicitado: '+mm+':'+ss+
      ' restantes. Verifica físicamente el portón; el temporizador no confirma su posición.';
  }

  async function refresh() {
    if(busy||reading||!authorized()||!section()?.classList.contains('active'))return;
    reading=true;
    try {
      const {data,error}=await sb.rpc('parcel_window_status');
      if(error)throw error;
      current=data;
      lastError='';
    } catch(e) {
      current=null;
      lastError='No se pudo consultar Paquetería: '+(e?.message||'intenta de nuevo')+'. No se envió ninguna orden.';
    } finally {reading=false;render();}
  }

  async function action(type) {
    if(busy||reading||!authorized()||!['start','stop'].includes(type))return;
    await refresh();
    if(!current?.allowed)return;
    if(type==='start' && (!current.hardware_ready||current.active))return;
    if(type==='stop'&&!current.active)return;
    const message=type==='start'
      ?'¿Solicitar Modo Evento para Paquetería durante 3 minutos? Comprueba que el paso está libre y que los sensores de seguridad funcionan. El estado físico debe verificarse presencialmente.'
      :'¿Desactivar ahora la ventana de Paquetería? Comprueba físicamente que el portón y su paso estén libres.';
    if(!confirm(message))return;
    busy=true;
    lastError='';
    render();
    try {
      const {data,error}=await sb.rpc('parcel_window_manage',{p_action:type});
      if(error)throw error;
      current=data;
      lastError='';
    } catch(e) {
      lastError='No se pudo '+(type==='start'?'activar':'desactivar')+
        ' Paquetería: '+(e?.message||'error del servidor');
    } finally {
      busy=false;
      render();
      await Promise.allSettled([
        refresh(),
        typeof basuraActualizar==='function'?basuraActualizar():Promise.resolve(),
        typeof refreshDigitalAccess==='function'?refreshDigitalAccess():Promise.resolve()
      ]);
    }
  }

  window.paqueteriaActualizar=refresh;
  window.paqueteriaAccion=action;
  setInterval(()=>{if(!document.hidden){render();}},1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
