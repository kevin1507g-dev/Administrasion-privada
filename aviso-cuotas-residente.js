/* Administración Residencial · aviso de cuotas pendientes para residentes.
 * Se basa EXCLUSIVAMENTE en el resumenDeudaCasa() existente, que ya resta
 * pagos parciales y excluye cuotas archivadas. No crea pagos ni notificaciones.
 * El aviso reaparece en un nuevo inicio de sesión si la deuda sigue abierta.
 */
(function(){
"use strict";
let root=null,content=null,currentUid=null,visible=false,autoReady=false;
const notifiedThisSession=new Set();

function modeloAvisoCuotas({uid,rol,casaId,numero,resumen,errorCarga=false}){
 if(!uid||rol!=="residente"||!casaId||errorCarga||!resumen)return null;
 const pendientes=(Array.isArray(resumen.detalle)?resumen.detalle:[])
  .filter(q=>Number.isFinite(Number(q.saldo))&&Number(q.saldo)>0.009)
  .map(q=>({
   id:String(q.id),
   concepto:String(q.concepto||"Cuota residencial").slice(0,180),
   vencimiento:String(q.vencimiento||""),
   saldo:Number(q.saldo),
   estado:String(q.estado||"Pendiente")
  }));
 if(!pendientes.length)return null;
 const saldo=pendientes.reduce((acc,q)=>acc+q.saldo,0);
 if(!Number.isFinite(saldo)||saldo<=0.009)return null;
 const firma=pendientes.map(q=>q.id).sort().join("|");
 return {casa:String(numero||"Sin número"),saldo,pendientes,
  vencidas:pendientes.filter(q=>q.estado==="Vencida").length,
  firma,numeroCuotas:pendientes.length};
}
function esResidente(){
 return typeof user!=="undefined"&&!!user?.id&&
  typeof profile!=="undefined"&&profile?.rol==="residente"&&!!profile?.casa_id&&
  !document.getElementById("app")?.classList.contains("hidden");
}
function modeloActual(){
 if(!esResidente()||typeof resumenDeudaCasa!=="function")return null;
 const error=typeof ownerAnalyticsFinanceError!=="undefined" && ownerAnalyticsFinanceError===true;
 if(error)return null; // Nunca enseñar deuda supuesta si falló obtener pagos.
 const resumen=resumenDeudaCasa(profile.casa_id);
 return modeloAvisoCuotas({uid:user.id,rol:profile.rol,casaId:profile.casa_id,
  numero:typeof casaNumero==="function"?(casaNumero(profile.casa_id)||profile.unidad):profile.unidad,
  resumen,errorCarga:false});
}
function element(tag,className,parent,text){
 const e=document.createElement(tag);
 if(className)e.className=className;
 if(text!==undefined)e.textContent=String(text);
 if(parent)parent.appendChild(e);
 return e;
}
function money(n){
 return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(n);
}
function initialize(){
 if(root)return;
 root=element("div","rcu-root",document.body);
 root.hidden=true;
 root.setAttribute("aria-label","Aviso de cuotas pendientes");
 content=element("section","rcu-dialog",root);
 content.setAttribute("role","dialog");
 content.setAttribute("aria-modal","true");
 content.setAttribute("aria-labelledby","rcu-title");
}
function nextPage(page){
 close();
 if(typeof show==="function")show(page);
}
function close(){
 if(root)root.hidden=true;
 visible=false;
}
function render(model){
 if(!root||!content||!model)return;
 content.replaceChildren();
 const header=element("div","rcu-header",content);
 const title=element("h2","",header,"🧾 Tienes cuotas pendientes");
 title.id="rcu-title";
 const closeButton=element("button","rcu-x",header,"×");
 closeButton.type="button";
 closeButton.setAttribute("aria-label","Cerrar aviso y abrir Control Digital");
 closeButton.onclick=()=>nextPage("controlDigital");

 element("p","rcu-subtitle",content,"Casa "+model.casa+" · "+model.numeroCuotas+
  (model.numeroCuotas===1?" cuota por pagar":" cuotas por pagar"));
 element("div","rcu-amount",content,money(model.saldo));
 element("p","rcu-note",content,"Saldo pendiente registrado en Administración Residencial.");
 if(model.vencidas){
  element("p","rcu-overdue",content,
   "⚠️ "+model.vencidas+(model.vencidas===1?" cuota vencida":" cuotas vencidas"));
 }
 const detail=element("div","rcu-detail",content);
 for(const q of model.pendientes.slice(0,12)){
  const row=element("div","rcu-row",detail);
  const left=element("div","rcu-row-left",row);
  element("strong","",left,q.concepto);
  element("small","",left,"Vence: "+(q.vencimiento||"Sin fecha")+" · "+q.estado);
  element("b","rcu-row-money",row,money(q.saldo));
 }
 if(model.pendientes.length>12){
  element("small","rcu-more",content,"Y "+(model.pendientes.length-12)+" cuotas adicionales. Consulta el detalle en Pagos.");
 }
 element("p","rcu-instructions",content,
  "Este recordatorio volverá a aparecer cuando inicies sesión si todavía existe saldo pendiente. No registra ningún cobro.");
 const actions=element("div","rcu-actions",content);
 const pay=element("button","rcu-primary",actions,"Consultar cuotas y pagos");
 pay.type="button";pay.onclick=()=>nextPage("pagos");
 const methods=element("button","rcu-secondary",actions,"Ver métodos de pago");
 methods.type="button";methods.onclick=()=>nextPage("metodosPago");
 const skip=element("button","rcu-secondary",actions,"Continuar a Control Digital");
 skip.type="button";skip.onclick=()=>nextPage("controlDigital");
}
function syncUser(){
 const uid=esResidente()?String(user.id):null;
 if(uid!==currentUid){
  currentUid=uid;
  notifiedThisSession.clear();
  autoReady=false;
  close();
 }
}
function abrir({forzar=false}={}){
 syncUser();
 autoReady=true;
 const model=modeloActual();
 if(!model)return false;
 if(!forzar&&notifiedThisSession.has(model.firma))return false;
 if(document.body.classList.contains("ia-open"))return false;
 initialize();
 notifiedThisSession.add(model.firma);
 render(model);
 root.hidden=false;
 visible=true;
 return true;
}
function update(){
 syncUser();
 if(!autoReady)return;
 const model=modeloActual();
 if(!model){if(visible)close();return;}
 if(visible){render(model);return;} // pagos parciales: actualizar sin reabrir
 // Si aparece una cuota nueva mientras la plataforma está abierta, mostrar
 // el recordatorio una sola vez para esa combinación de cuotas pendientes.
 if(!document.hidden&&!document.body.classList.contains("ia-open")&&
    !notifiedThisSession.has(model.firma))abrir();
}
window.residenteCuotasPendientesAbrir=abrir;
window.residenteCuotasPendientesActualizar=update;
window.addEventListener("pageshow",update);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)update();});
})();
