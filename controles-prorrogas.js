// Controles suspendidos y prórrogas de mora.
// Los permisos y la expiración se validan exclusivamente mediante RPC de Supabase.
(function(){
 'use strict';
 let loading=false,working=false,lastRefresh=0,items=[];
 const $=id=>document.getElementById(id);
 const isStaff=()=>['owner','admin'].includes(typeof profile!=='undefined'?profile?.rol:null);
 const isOwner=()=>typeof profile!=='undefined'&&profile?.rol==='owner';
 const active=()=>$('porton')?.classList.contains('active')===true;
 const fmtMoney=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(v)||0);
 const fmtDate=x=>{
   const d=new Date(x||'');
   return Number.isFinite(d.getTime())
     ?d.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'})
     :'—';
 };
 const el=(tag,txt,cls,parent)=>{
   const node=document.createElement(tag);
   if(txt!==undefined&&txt!==null)node.textContent=String(txt);
   if(cls)node.className=cls;
   if(parent)parent.appendChild(node);
   return node;
 };
 function note(message,warning=false){
   const target=$('controlesBloqueadosEstado');
   if(!target)return;
   target.textContent=message;
   target.style.color=warning?'#fca5a5':'';
 }
 function render(){
   const list=$('controlesBloqueadosLista');
   if(!list)return;
   list.replaceChildren();
   if(!isStaff())return;
   if(!items.length){
     el('p','No hay controles suspendidos, mora que genere suspensión ni prórrogas vigentes.','muted',list);
     return;
   }
   for(const item of items){
     const card=el('article',null,'card',list);
     card.style.marginTop='12px';
     card.style.padding='16px';
     const row=el('div',null,'',card);
     row.style.display='flex';
     row.style.justifyContent='space-between';
     row.style.alignItems='center';
     row.style.flexWrap='wrap';
     row.style.gap='8px';
     el('strong','🏠 Casa '+item.numero,'',row);
     const suspended=Number(item.controles_suspendidos)||0;
     const automatic=Number(item.suspendidos_por_mora)||0;
     const manual=Number(item.suspendidos_manuales)||0;
     const debt=Number(item.deuda_mora)||0;
     const grace=item.prorroga_activa===true;
     const state=grace&&manual>0?'Prórroga vigente · bloqueo manual pendiente'
        :grace?'Prórroga vigente'
        :suspended>0?'⛔ Controles suspendidos'
        :debt>0.009?'⛔ Suspensión por mora':'En seguimiento';
     el('span',state,'badge',row);
     el('p',
       suspended+' control(es) suspendido(s) · '+automatic+' por mora · '+manual+' manual(es)'+
       ' · Deuda vencida de 10+ días: '+fmtMoney(debt),
       'muted',card);
     // Mostrar los números efectivamente suspendidos, no solo totales por casa.
     const houseControls=typeof controles!=='undefined'&&Array.isArray(controles)
       ?controles.filter(c=>String(c.casa_id)===String(item.casa_id)):[];
     const blocked=houseControls.filter(c=>c.estado==='suspendido');
     if(blocked.length){
       const list=el('ul',null,'',card);
       list.style.paddingLeft='24px';
       for(const c of blocked){
         el('li','Control '+String(c.numero_control||'—')+' · '+
           (c.suspension_automatica?'Suspendido por mora':'Suspensión manual o administrativa'),
           null,list);
       }
     }
     if(grace)el('p','✅ Días adicionales autorizados hasta '+fmtDate(item.prorroga_hasta)+
       '. El adeudo sigue pendiente.','muted',card);
     if(grace&&!isOwner()){
       const alert=el('p','🔒 Sistema Admin otorgó días adicionales hasta '+
         fmtDate(item.prorroga_hasta)+
         '. Como Administrador no puedes bloquear los controles de esta casa mientras la prórroga esté vigente.',
         'muted',card);
       alert.style.fontWeight='700';
       alert.style.color='#fbbf24';
     }
     if(manual>0)el('p','⚠️ Los bloqueos manuales o exclusivos de Sistema Admin no se levantan con días adicionales.','muted',card);
     if(!isOwner())continue;
     if(debt>0.009&&houseControls.length){
       const actions=el('div',null,'actions',card);
       actions.style.alignItems='end';
       actions.style.marginTop='10px';
       actions.style.flexWrap='wrap';
       const wrapper=el('label','Días adicionales (1–365) ',null,actions);
       wrapper.style.display='grid';wrapper.style.gap='5px';
       const input=el('input',null,'',wrapper);
       input.type='number';input.min='1';input.max='365';input.step='1';
       input.value='7';input.inputMode='numeric';input.setAttribute('aria-label','Días adicionales para casa '+item.numero);
       input.style.width='110px';
       const button=el('button','Otorgar días','primary',actions);
       button.type='button';button.disabled=working;
       button.addEventListener('click',()=>act('otorgar',item,input));
       if(grace){
         const revoke=el('button','Revocar días','danger',actions);
         revoke.type='button';revoke.disabled=working;
         revoke.addEventListener('click',()=>act('revocar',item,null));
       }
     }
   }
 }
 async function refresh(force=false){
   if(!isStaff()||!active()||loading||working)return;
   if(!force&&Date.now()-lastRefresh<30000)return;
   loading=true;
   note('Actualizando controles suspendidos…');
   try{
     const {data,error}=await sb.rpc('controles_bloqueos_resumen');
     if(error)throw error;
     if(!Array.isArray(data))throw Error('No se recibió una lista válida.');
     items=data;
     lastRefresh=Date.now();
     render();
     note(data.length+' casa(s) con suspensión, deuda vencida o plazo especial.');
   }catch(error){
     note('No se pudo consultar controles suspendidos: '+(error?.message||'intenta nuevamente'),true);
   }finally{loading=false;}
 }
 async function act(type,item,input){
   if(!isOwner()||!active()||working||loading)return;
   const days=type==='otorgar'?Number(input?.value):null;
   if(type==='otorgar'&&(!Number.isInteger(days)||days<1||days>365)){
     note('Escribe de 1 a 365 días adicionales.',true);
     input?.focus();
     return;
   }
   const msg=type==='otorgar'
     ?'¿Otorgar '+days+' día(s) adicionales a la casa '+item.numero+' por falta de pago?\n\nLa deuda continuará registrada. Solo se reactivarán controles suspendidos automáticamente por mora; los manuales permanecerán bloqueados. Asegura una alternativa segura de acceso.'
     :'¿Revocar los días adicionales de la casa '+item.numero+'? Si todavía tiene mora, el sistema volverá a suspender su Control Digital.';
   if(!window.confirm(msg))return;
   working=true;render();
   note(type==='otorgar'?'Autorizando días adicionales…':'Revocando días adicionales…');
   try{
     const {data,error}=await sb.rpc('controles_otorgar_dias_mora',{
       p_casa_id:item.casa_id,p_dias:days,p_accion:type
     });
     if(error)throw error;
     if(!data?.ok)throw Error('El servidor no confirmó el cambio.');
     lastRefresh=0;
     working=false;
     await refresh(true);
     note(type==='otorgar'
       ?'✅ Días adicionales autorizados para casa '+item.numero+' hasta '+fmtDate(data.vigente_hasta)+'.'
       :'✅ Días adicionales revocados para casa '+item.numero+'.');
     if(typeof loadAll==='function')void loadAll();
   }catch(error){
     working=false;render();
     note('No se pudo completar la operación: '+(error?.message||'intenta nuevamente'),true);
   }
 }
 window.controlesBloqueosActualizar=refresh;
 window.addEventListener('visibilitychange',()=>{if(!document.hidden&&active())void refresh(true);});
 window.setInterval(()=>{if(!document.hidden&&active())void refresh(true);},60000);
})();
