// Paquetería: el mismo botón activa o cancela la ventana de tres minutos.
// El servidor valida el rol, duración, estado del dispositivo y conflictos.
// El contador muestra tiempo solicitado; NO certifica la posición del portón.
(function () {
  'use strict';

  const byId=id=>document.getElementById(id);
  const section=()=>byId('controlDigital');
  const button=()=>byId('paqueteriaStartBtn');
  const counter=()=>byId('paqueteriaContador');
  const status=()=>byId('paqueteriaStatus');
  const authorized=()=>['owner','admin'].includes(document.body?.dataset?.sessionRole);
  let busy=false,reading=false,current=null,lastError='';

  const text=(element,value)=>{
    if(element && element.textContent!==value)element.textContent=value;
  };

  function render() {
    const btn=button(), clock=counter(), label=status();
    if(!btn||!clock||!label)return;
    if(!authorized()) {
      btn.disabled=true;
      return;
    }

    const active=!!current?.active;
    const until=Date.parse(current?.until||'');
    const ms=active&&Number.isFinite(until)?Math.max(0,until-Date.now()):0;
    const expired=active&&ms<=0;
    const seconds=active?Math.ceil(ms/1000):180;
    const mm=String(Math.floor(seconds/60)).padStart(2,'0');
    const ss=String(seconds%60).padStart(2,'0');
    text(clock,mm+':'+ss);

    btn.disabled=busy||reading||!current?.allowed||
      (active?expired:!current?.hardware_ready);
    btn.classList.toggle('paqueteriaActiva',active&&!expired);
    btn.setAttribute('aria-label',active
      ? 'Paquetería activa. Pulsar para cancelar la ventana de tres minutos.'
      : 'Paquetería. Pulsar para activar durante tres minutos.');
    btn.title=active?'Pulsar para cancelar Paquetería':'Activar Paquetería por 3 minutos';

    if(lastError) {
      text(label,lastError);
    } else if(!current) {
      text(label,'Consultando disponibilidad de Paquetería...');
    } else if(expired) {
      text(label,'La ventana ha llegado a cero. Verificando su finalización con el servidor; comprueba físicamente el portón.');
    } else if(active) {
      text(label,'Paquetería activada. Pulsa el mismo botón para cancelar antes de tiempo. Comprueba físicamente el portón; el contador no confirma su posición.');
    } else {
      text(label,current.reason||'Paquetería disponible.');
    }
  }

  async function getStatus() {
    const {data,error}=await sb.rpc('parcel_window_status');
    if(error)throw error;
    if(!data || typeof data!=='object')throw new Error('Respuesta de estado inválida.');
    return data;
  }

  async function refresh(preserveError=false) {
    if(!authorized()){render();return;}
    if(busy||reading||!section()?.classList.contains('active'))return;
    reading=true;
    try {
      current=await getStatus();
      if(!preserveError)lastError='';
    } catch(e) {
      current=null;
      lastError='No se pudo consultar Paquetería: '+(e?.message||'intenta de nuevo')+'. No se envió ninguna orden.';
    } finally {
      reading=false;
      render();
    }
  }

  async function toggle() {
    if(!authorized()){render();return;}
    if(busy||reading||!section()?.classList.contains('active')||!current?.allowed)return;
    const intended=current.active?'stop':'start';
    busy=true;lastError='';render();
    let actionFailed=false;
    try {
      // Revalidar en el servidor sin reinterpretar el toque:
      // si ya cambió la ventana, no cancelar ni abrir una nueva por error.
      const latest=await getStatus();
      current=latest;
      if(!latest.allowed)throw new Error('Cuenta sin permiso para usar Paquetería.');
      if(Boolean(latest.active)!==(intended==='stop')) {
        throw new Error('El estado cambió. Revisa el botón y vuelve a pulsar si lo necesitas.');
      }
      if(intended==='start'&&!latest.hardware_ready) {
        throw new Error('El ESP32 no está conectado o la función no está habilitada.');
      }
      const {data,error}=await sb.rpc('parcel_window_manage',{p_action:intended});
      if(error)throw error;
      current=data;
      lastError='';
    } catch(e) {
      actionFailed=true;
      lastError='No se pudo '+(intended==='start'?'activar':'cancelar')+
        ' Paquetería: '+(e?.message||'error del servidor');
    } finally {
      busy=false;
      render();
      // Restablece estado compartido con basura y control digital.
      await Promise.allSettled([
        refresh(actionFailed),
        typeof basuraActualizar==='function'?basuraActualizar():Promise.resolve(),
        typeof refreshDigitalAccess==='function'?refreshDigitalAccess():Promise.resolve()
      ]);
    }
  }

  window.paqueteriaActualizar=refresh;
  window.paqueteriaAlternar=toggle;
  setInterval(()=>{if(!document.hidden)render();},1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
