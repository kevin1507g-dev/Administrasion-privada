/*
 * Mercado Pago — laboratorio de pruebas AISLADO.
 * Nunca llama al proveedor ni escribe en cuotas/pagos reales.
 * El primer paso es probar el flujo y la idempotencia sin dinero.
 * Solo Owner. Al integrar el checkout externo deberá existir una
 * validación verificada de webhook y de transacciones por backend.
 */
const mpLab={busy:false,historyBusy:false,current:null,lastRequest:null};
function mpLabEnabled(){
 return profile?.rol==='owner' && ownerPanelMode==='owner' && profile.activo===true && !!user;
}
function mpLabText(id,value){
 const el=document.getElementById(id);
 if(el)el.textContent=String(value??'');
}
function mpLabMoney(value){
 return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(value)||0);
}
function mpLabBalance(q){
 const already=(pagos||[]).filter(p=>String(p.cuota_id)===String(q.id))
   .reduce((n,p)=>n+Math.max(0,Number(p.monto)||0),0);
 return Math.max(0,(Number(q.monto)||0)-already);
}
function mpLabQuotaOptions(){
 const active=new Set((casas||[]).filter(c=>c.activo===true).map(c=>String(c.id)));
 return (cuotas||[]).filter(q=>q.casa_id&&active.has(String(q.casa_id))&&mpLabBalance(q)>=0.01)
   .sort((a,b)=>String(a.vencimiento||'').localeCompare(String(b.vencimiento||''))||Number(a.id)-Number(b.id));
}
function mpSandboxRender(){
 if(!mpLabEnabled())return;
 const select=document.getElementById('mpLabQuota');
 if(!select)return;
 const previous=select.value;
 const allowed=mpLabQuotaOptions();
 select.replaceChildren(new Option('Elige una cuota pendiente',''));
 for(const q of allowed){
  const casa=casas.find(c=>String(c.id)===String(q.casa_id));
  select.add(new Option('Casa '+(casa?.numero||'—')+' · '+(q.concepto||'Cuota')+
   ' · '+mpLabMoney(mpLabBalance(q)),String(q.id)));
 }
 // Deliberately do NOT automatically select a house for payment.
 if(allowed.some(q=>String(q.id)===previous))select.value=previous;
 else select.value='';
 mpSandboxPreview();
}
function mpSandboxPreview(){
 if(!mpLabEnabled())return;
 const quotaId=document.getElementById('mpLabQuota')?.value;
 const q=mpLabQuotaOptions().find(x=>String(x.id)===quotaId);
 mpLabText('mpLabAmount',q?mpLabMoney(mpLabBalance(q)):'—');
 mpLabText('mpLabSummary',q?'Saldo registrado de la cuota seleccionada. Es solo referencia para la prueba.':
  'Selecciona una cuota con saldo pendiente; no cambiará su deuda real.');
 const start=document.getElementById('mpLabStart');
 if(start)start.disabled=mpLab.busy||!q||mpLab.current?.status==='pending';
 const checkout=document.getElementById('mpLabCheckout');
 if(checkout)checkout.disabled=mpLab.busy||!q;
 mpSandboxUpdateButtons();
}
function mpSandboxUpdateButtons(){
 const pending=mpLab.current?.status==='pending';
 const yes=document.getElementById('mpLabApprove');
 const no=document.getElementById('mpLabReject');
 if(yes)yes.disabled=!mpLabEnabled()||mpLab.busy||!pending;
 if(no)no.disabled=!mpLabEnabled()||mpLab.busy||!pending;
}
async function mpSandboxStart(){
 if(!mpLabEnabled()||mpLab.busy||mpLab.current?.status==='pending')return;
 const raw=document.getElementById('mpLabQuota')?.value;
 const method=document.getElementById('mpLabMethod')?.value;
 const q=mpLabQuotaOptions().find(x=>String(x.id)===String(raw));
 if(!q||!['card','spei'].includes(method))return mpLabText('mpLabStatus','Selecciona cuota y método válidos.');
 if(!confirm('¿Crear un intento en el LABORATORIO de Mercado Pago?\n\n'+
 'Casa '+(casas.find(c=>String(c.id)===String(q.casa_id))?.numero||'')+
 '\nMonto ficticio: '+mpLabMoney(mpLabBalance(q))+
 '\n\nNO se realizará ningún cobro ni se modificará ninguna deuda.'))return;
 mpLab.busy=true;mpSandboxPreview();
 const requestId=mpLab.lastRequest?.quota===q.id&&mpLab.lastRequest?.method===method
  ?mpLab.lastRequest.id:crypto.randomUUID();
 mpLab.lastRequest={quota:q.id,method,id:requestId};
 mpLabText('mpLabStatus','Preparando intento de prueba…');
 try{
  const {data,error}=await sb.rpc('mp_sandbox_start',{
   p_cuota_id:q.id,p_request_id:requestId,p_method:method
  });
  if(error)throw error;
  if(!data?.sandbox||!data?.id)throw new Error('El servidor no identificó la operación de prueba.');
  mpLab.current=data;
  mpLabText('mpLabStatus','🧪 Intento creado · folio '+data.id.slice(0,8)+
   ' · '+(method==='card'?'Tarjeta de prueba':'SPEI de prueba')+
   ' · '+mpLabMoney(data.amount)+'. Simula la respuesta del proveedor abajo.');
  await mpSandboxLoadHistory();
 }catch(e){
  mpLabText('mpLabStatus','No se completó la prueba: '+(e?.message||String(e))+
   '. Si hubo un error de red, revisa el historial antes de intentar de nuevo.');
 }finally{
  mpLab.busy=false;mpSandboxPreview();
 }
}
async function mpSandboxSimulate(result){
 if(!mpLabEnabled()||mpLab.busy||mpLab.current?.status!=='pending'||!['approved','rejected'].includes(result))return;
 if(!confirm('¿Simular pago '+(result==='approved'?'APROBADO':'RECHAZADO')+
 '? No es un pago real: NO alterará el saldo ni emitirá recibos reales.'))return;
 mpLab.busy=true;mpSandboxUpdateButtons();
 try{
  const {data,error}=await sb.rpc('mp_sandbox_simulate',{
    p_attempt_id:mpLab.current.id,p_result:result
  });
  if(error)throw error;
  if(!data?.sandbox)throw new Error('Respuesta de simulación no verificada');
  mpLab.current.status=data.status;
  mpLabText('mpLabStatus',(result==='approved'?'✅ APROBADO':'❌ RECHAZADO')+
   ' en el simulador. La cuota real y los pagos NO se modificaron. '+(data.repeated?'Era un reintento.':''));
  await mpSandboxLoadHistory();
 }catch(e){
  mpLabText('mpLabStatus','No se pudo confirmar el resultado simulado: '+(e?.message||String(e)));
 }finally{
  mpLab.busy=false;mpLab.lastRequest=null;mpSandboxPreview();
 }
}
async function mpSandboxLoadHistory(){
 if(!mpLabEnabled()||mpLab.historyBusy)return;
 const rows=document.getElementById('mpLabRows'),status=document.getElementById('mpLabHistoryStatus');
 if(!rows||!status)return;
 mpLab.historyBusy=true;
 const actor=user.id;
 status.textContent='Cargando laboratorio…';
 try{
  const {data,error}=await sb.rpc('mp_sandbox_history',{p_limit:30});
  if(error)throw error;
  if(actor!==user?.id||!mpLabEnabled())return;
  rows.replaceChildren();
  // Restore unfinished test after a mobile refresh; no real financial action occurs.
  if(!mpLab.current && Array.isArray(data)){
   const latestPending=data.find(x=>x.status==='pending');
   if(latestPending){
    mpLab.current={...latestPending,sandbox:true};
    mpLabText('mpLabStatus','🧪 Prueba pendiente recuperada. Puedes simular la aprobación o el rechazo.');
   }
  }
  mpSandboxUpdateButtons();
  if(!Array.isArray(data)||!data.length){
   const row=rows.insertRow();const cell=row.insertCell();
   cell.colSpan=5;cell.textContent='Sin pruebas. Elige una cuota y crea el primer intento.';
  }else{
   const names={card:'Tarjeta',spei:'Transferencia SPEI'};
   const statuses={pending:'Pendiente · PRUEBA',approved:'Aprobado · PRUEBA',rejected:'Rechazado · PRUEBA'};
   for(const item of data){
    const row=rows.insertRow();
    const date=new Date(item.created_at);
    const values=[
     Number.isNaN(date.getTime())?'—':date.toLocaleString('es-MX'),
     'Casa '+(item.house||'—'),
     mpLabMoney(item.amount),
     names[item.method]||'Prueba',
     statuses[item.status]||'Desconocido'
    ];
    for(const value of values)row.insertCell().textContent=value;
   }
  }
  status.textContent=data.length+' movimientos de prueba · nunca afectan pagos reales.';
 }catch(e){
  status.textContent='No se pudo consultar el historial: '+(e?.message||String(e));
 }finally{mpLab.historyBusy=false;}
}
function mpSandboxOpen(){
 if(!mpLabEnabled())return;
 mpSandboxRender();
 mpSandboxLoadHistory();
}

/** Abre exclusivamente la URL sandbox verificada por la función de Supabase.
 * No escribe en tablas de pagos/deudas y nunca usa credenciales de producción.
 */
async function mpSandboxCheckout(){
 if(!mpLabEnabled()||mpLab.busy)return;
 const q=mpLabQuotaOptions().find(x=>String(x.id)===String(document.getElementById('mpLabQuota')?.value));
 if(!q)return mpLabText('mpLabStatus','Selecciona primero una cuota pendiente.');
 if(!confirm('Abrir el entorno de PRUEBAS de Mercado Pago para la cuota de '+mpLabMoney(mpLabBalance(q))+
   '?\\n\\nÚnicamente utiliza una cuenta compradora y medios de pago de prueba. No uses dinero, tarjetas ni cuentas reales.'))return;
 mpLab.busy=true;mpSandboxPreview();
 mpLabText('mpLabStatus','Solicitando enlace de prueba a Mercado Pago…');
 try{
  const {data,error}=await sb.functions.invoke('mp-crear-preferencia-prueba',{
   body:{cuota_id:Number(q.id)}
  });
  if(error){
   let message=error.message||'Error del servidor';
   if(error.context && typeof error.context.json==='function'){
    try{
     const details=await error.context.json();
     if(typeof details?.error==='string')message=details.error;
    }catch(_){}
   }
   throw new Error(message);
  }
  if(!data||data.modo!=='prueba'||Number(data.cuota_id)!==Number(q.id))throw new Error('Respuesta de prueba inválida.');
  const url=new URL(String(data.checkout_url||''));
  if(url.protocol!=='https:'||!['sandbox.mercadopago.com','sandbox.mercadopago.com.mx'].includes(url.hostname)){
   throw new Error('El enlace no pertenece al entorno sandbox autorizado.');
  }
  mpLabText('mpLabStatus','Redirigiendo al checkout SANDBOX. La deuda real no cambiará.');
  window.location.assign(url.href);
 }catch(e){
  mpLabText('mpLabStatus','No se pudo abrir Mercado Pago de prueba: '+(e?.message||String(e))+
    '. Verifica que el Access Token TEST- esté guardado en Supabase.');
 }finally{mpLab.busy=false;mpSandboxPreview();}
}


/** Diagnóstico de SOLO LECTURA: no genera preferencias ni modifica cuotas/pagos. */
async function mpSandboxCheckProduction(){
 if(!mpLabEnabled())return;
 const btn=document.getElementById('mpProdCheckBtn');
 if(btn)btn.disabled=true;
 const previousId=document.getElementById('mpProdDetectedSellerId');
 const detectedWrap=document.getElementById('mpProdDetectedSellerWrap');
 if(previousId)previousId.textContent='';
 if(detectedWrap)detectedWrap.classList.add('hidden');
 mpLabText('mpProdCheckStatus','Comprobando configuración de producción sin cobrar…');
 try{
  const {data,error}=await sb.functions.invoke('mp-prod-diagnostico',{body:{}});
  if(error){
   let details=error.message||'No se pudo contactar con el servidor.';
   if(error.context && typeof error.context.json==='function'){
    try{const body=await error.context.json();if(typeof body?.error==='string')details=body.error;}catch(_){}
   }
   throw new Error(details);
  }
  if(data?.checked!==true)throw new Error('Respuesta de verificación desconocida.');
  const detected=String(data.id_vendedor_detectado??'');
  const wrap=document.getElementById('mpProdDetectedSellerWrap');
  const value=document.getElementById('mpProdDetectedSellerId');
  if(wrap&&value){
   const show=/^[0-9]+$/.test(detected)&&!data.vendedor_verificado;
   value.textContent=show?detected:'';
   wrap.classList.toggle('hidden',!show);
  }
  const parts=[
    'Access Token: '+(data.token_configurado?'configurado':'falta o tiene formato incorrecto'),
    'ID vendedor: '+(data.vendedor_configurado?'configurado':'falta o es inválido'),
    'Firma Webhook: '+(data.firma_webhook_configurada?'configurada':'falta'),
    'Cuenta vendedora: '+(data.vendedor_verificado?'verificada':'NO verificada'),
    'Cobros reales: '+(data.cobros_habilitados?'HABILITADOS, requiere revisión':'desactivados')
  ];
  mpLabText('mpProdCheckStatus',parts.join(' · ')+'. '+String(data.verificacion_vendedor||'')+
  '. La entrega del webhook aún NO está verificada. No se realizó ningún cobro.');
 }catch(e){
  mpLabText('mpProdCheckStatus','No se completó la verificación: '+(e?.message||String(e))+
    '. Revisa los secretos guardados en Supabase, sin compartir sus valores.');
 }finally{if(btn)btn.disabled=false;}
}

/** Solo copia el ID público que devuelve la función autorizada; jamás copia credenciales. */
async function mpCopyDetectedSellerId(){
 if(!mpLabEnabled())return;
 const id=document.getElementById('mpProdDetectedSellerId')?.textContent?.trim()||'';
 if(!/^[0-9]+$/.test(id))return;
 try{
  await navigator.clipboard.writeText(id);
  mpLabText('mpProdCopyStatus','ID de vendedor copiado. En Supabase, edita solo el VALUE de MP_PROD_SELLER_ID.');
 }catch(_){
  mpLabText('mpProdCopyStatus','Selecciona el número que aparece arriba y cópialo manualmente.');
 }
}
