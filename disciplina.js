/* Módulo de disciplina: avisos, multas y aclaraciones. */
(function(){
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId=(x)=>document.getElementById(x);
const admin=()=>['admin','owner'].includes(window.profile?.rol||profile?.rol);
const me=()=>window.profile||profile;
let casos=[],avisos=[],multas=[],aclaraciones=[];
async function query(table,fields='*'){const {data,error}=await sb.from(table).select(fields);if(error)throw error;return data||[];}
async function load(){
 const area=byId('disciplinaLista');if(!area)return;
 area.innerHTML='<p class="muted">Cargando avisos y multas…</p>';
 try{
  [casos,avisos,multas,aclaraciones]=await Promise.all([
   query('disciplina_casos'),query('disciplina_avisos'),query('disciplina_multas'),query('disciplina_aclaraciones')
  ]);
  casos.sort((a,b)=>b.creado_at.localeCompare(a.creado_at));
  render();
 }catch(e){area.textContent='No fue posible cargar el módulo: '+e.message;}
}
function render(){
 const area=byId('disciplinaLista');if(!area)return;
 const casasList=typeof casas!=='undefined'?casas:[];
 const opts=casasList.map(c=>'<option value="'+esc(c.id)+'">Casa '+esc(c.numero||c.nombre||'')+'</option>').join('');
 const form=byId('disciplinaCrear');
 if(form){form.classList.toggle('hidden',!admin());const select=byId('disciplinaCasa');if(select){const old=select.value;select.innerHTML='<option value="">Selecciona una casa</option>'+opts;select.value=old;}}
 if(!casos.length){area.innerHTML='<div class="card muted">Todavía no hay avisos ni multas registrados.</div>';return;}
 area.innerHTML=casos.map(c=>{
 const casa=casasList.find(h=>h.id===c.casa_id);
 const warns=avisos.filter(a=>a.caso_id===c.id).sort((a,b)=>a.numero-b.numero);
 const fine=multas.find(m=>m.caso_id===c.id);
 const notes=aclaraciones.filter(a=>a.caso_id===c.id).sort((a,b)=>a.creada_at.localeCompare(b.creada_at));
 const details=warns.map(w=>'<p>⚠️ <strong>Aviso '+w.numero+'/3</strong> · '+new Date(w.creado_at).toLocaleDateString('es-MX')+'<div class="muted">'+esc(w.mensaje)+'</div></p>').join('');
 const questions=notes.map(n=>'<div style="padding:10px;border:1px solid #334155;border-radius:8px;margin:8px 0"><strong>Aclaración</strong> · '+new Date(n.creada_at).toLocaleDateString('es-MX')+'<p>'+esc(n.mensaje)+'</p>'+(n.respuesta?'<p>Respuesta: '+esc(n.respuesta)+'</p>':admin()?'<button class="mini" data-answer="'+esc(n.id)+'">Responder aclaración</button>':'<span class="muted">Esperando respuesta</span>')+'</div>').join('');
 return '<article class="card" style="margin:12px 0"><h3>Casa '+esc(casa?.numero||casa?.nombre||'')+' · '+esc(c.motivo)+'</h3><p class="muted">'+esc(c.descripcion)+'</p><p>Estado: <strong>'+esc(c.estado)+'</strong> · Avisos: <strong>'+warns.length+'/3</strong></p>'+details+(fine?'<p><strong>Multa: $'+Number(fine.monto).toFixed(2)+'</strong> · '+esc(fine.estado)+'<div class="muted">'+esc(fine.fundamento)+'</div></p>':'')+
 (admin()&&c.estado==='abierto'&&warns.length<3?'<button class="mini primary" data-warn="'+esc(c.id)+'">Registrar aviso '+(warns.length+1)+'/3</button> ':'')+
 (admin()&&c.estado==='abierto'&&warns.length===3&&!fine?'<button class="mini danger" data-fine="'+esc(c.id)+'">Autorizar multa</button> ':'')+
 (!admin()?'<button class="mini" data-clarify="'+esc(c.id)+'">Presentar aclaración</button> ':'')+
 (admin()?'<button class="mini" data-pdf="'+esc(c.id)+'">📄 Descargar PDF</button> ':'')+
 (notes.length?'<h4>Aclaraciones</h4>'+questions:'')+'</article>';
 }).join('');
}
async function runRpc(name,args){const {error}=await sb.rpc(name,args);if(error)throw error;await load();}
window.disciplinaCrearCaso=async function(){
 if(!admin())return;
 const casa=byId('disciplinaCasa').value,motivo=byId('disciplinaMotivo').value.trim(),descripcion=byId('disciplinaDescripcion').value.trim();
 if(!casa||motivo.length<5)return alert('Selecciona una casa y escribe un motivo de al menos 5 caracteres.');
 try{await runRpc('disciplina_crear_caso',{p_casa_id:casa,p_motivo:motivo,p_descripcion:descripcion});byId('disciplinaMotivo').value='';byId('disciplinaDescripcion').value='';}catch(e){alert(e.message);}
};

async function descargarPDF(casoId){
 if(!admin())return alert('Solo administración puede generar el documento.');
 const c=casos.find(x=>x.id===casoId);
 if(!c)return alert('No se encontró el expediente.');
 const PDF=window.jspdf?.jsPDF;
 if(!PDF)return alert('No se cargó la herramienta PDF.');
 const doc=new PDF({unit:'mm',format:'a4'});
 const casa=(typeof casas!=='undefined'?casas:[]).find(h=>h.id===c.casa_id);
 const warns=avisos.filter(a=>a.caso_id===c.id).sort((a,b)=>a.numero-b.numero);
 const multa=multas.find(m=>m.caso_id===c.id);
 const notes=aclaraciones.filter(a=>a.caso_id===c.id).sort((a,b)=>a.creada_at.localeCompare(b.creada_at));
 const folio='BET-'+String(casa?.numero||'SN')+'-'+c.id.slice(0,8).toUpperCase();
 const fecha=v=>v?new Date(v).toLocaleDateString('es-MX'):'Sin fecha';
 // La plantilla aprobada se utiliza literalmente como fondo cuando está disponible.
 try{
  const response=await fetch('./plantilla-avisos-beteles.jpg',{cache:'no-store'});
  if(response.ok&&response.headers.get('content-type')?.includes('image')){
   const blob=await response.blob();const url=URL.createObjectURL(blob);
   try{
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
    const template=doc.getImageProperties(img);
    const page=(pageNumber)=>{
     if(pageNumber>1)doc.addPage();
     doc.addImage(img,'JPEG',0,0,210,297);
     doc.setFont('helvetica','normal');doc.setTextColor(17,35,32);
    };
    const write=(value,x,y,{size=9,bold=false,width=160,step=4.7}={})=>{
     doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
     const parts=doc.splitTextToSize(String(value??''),width);
     for(const part of parts){doc.text(part,x,y);y+=step;}
     return y;
    };
    // La primera hoja utiliza los espacios vacíos de la plantilla original.
    page(1);
    write('Folio: '+folio,154,40,{size:8,bold:true,width:44});
    write('Fecha: '+new Date().toLocaleDateString('es-MX'),154,46,{size:8,width:44});
    let top=60;
    top=write('Casa: '+(casa?.numero||casa?.nombre||'Sin asignar'),12,top,{bold:true});
    top=write('Identificador del expediente: '+c.id,12,top,{size:7.5});
    top=write('Motivo: '+c.motivo,12,top,{bold:true});
    top=write('Descripción: '+(c.descripcion||'Sin descripción'),12,top,{width:182,step:4.6});
    if(top>101)throw Error('Contenido inicial demasiado largo para plantilla de una página');
    // Cubrir solamente el estado fijo para reflejar el estado real.
    doc.setFillColor(235,242,239);doc.roundedRect(55,104,25,9,3,3,'F');
    write(String(c.estado||'abierto').toUpperCase(),59,110,{size:9,bold:true,width:22});
    write('Avisos registrados: '+warns.length+' de 3',96,110,{size:9,bold:true,width:75});
    let hy=139;
    for(const w of warns){hy=write('Aviso '+w.numero+' de 3 · '+fecha(w.creado_at),27,hy,{size:9,bold:true,width:160});hy=write(w.mensaje,27,hy,{size:9,width:165});hy+=2;}
    if(!warns.length)write('No hay avisos registrados.',27,hy);
    if(hy>153)throw Error('Historial demasiado largo para plantilla de una página');
    let sy=172;
    if(multa){sy=write('Multa autorizada: $'+Number(multa.monto).toLocaleString('es-MX')+' MXN',27,sy,{bold:true});sy=write('Fundamento: '+multa.fundamento,27,sy,{size:9});}
    else sy=write('Este documento es informativo. No se ha autorizado una multa en este expediente.',27,sy,{size:9});
    if(sy>182)throw Error('Situación demasiado larga para plantilla de una página');
    let ny=196;
    if(!notes.length)write('No hay aclaraciones registradas.',27,ny,{size:9});
    for(const n of notes){ny=write('Aclaración del '+fecha(n.creada_at)+': '+n.mensaje,27,ny,{size:9});ny=write('Respuesta: '+(n.respuesta||'Pendiente'),27,ny,{size:9});}
    if(ny>209)throw Error('Aclaraciones demasiado largas para plantilla de una página');
    doc.save('Avisos-Multas-Casa-'+String(casa?.numero||'casa')+'-'+c.id.slice(0,8)+'.pdf');
    return;
   }finally{URL.revokeObjectURL(url);}
  }
 }catch(err){console.warn('Plantilla visual no disponible; se usa formato alternativo:',err);}
 const dark=[6,67,50],gold=[181,150,79],ink=[15,26,37];
 let logo=null,mark=null,y=59;
 try{
  const res=await fetch('./logo-beteles.svg');if(!res.ok)throw Error('logo');
  const blob=new Blob([await res.text()],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{
   const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
   const cv=document.createElement('canvas');cv.width=800;cv.height=618;
   const cx=cv.getContext('2d');cx.drawImage(img,0,0,800,618);logo=cv.toDataURL('image/png');
   const wm=document.createElement('canvas');wm.width=800;wm.height=618;
   const wx=wm.getContext('2d');wx.globalAlpha=.045;wx.drawImage(img,0,0,800,618);mark=wm.toDataURL('image/png');
  }finally{URL.revokeObjectURL(url);}
 }catch(e){console.warn('Logo no disponible para PDF',e);}
 function background(){
  doc.setFillColor(255,255,255);doc.rect(0,0,210,297,'F');
  if(mark)doc.addImage(mark,'PNG',34,73,142,110,'beteles-watermark','FAST');
  // Encabezado blanco con escudo y banda verde a la derecha.
  if(logo)doc.addImage(logo,'PNG',11,3,31,24,'beteles-logo','FAST');
  doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(12);
  doc.text('PRIVADA',47,10);doc.setFontSize(15);doc.text('VALLE DE LOS BETELES',47,17);
  doc.setTextColor(...gold);doc.setFont('helvetica','normal');doc.setFontSize(7.5);
  doc.text('A D M I N I S T R A C I Ó N   R E S I D E N C I A L',47,23);
  doc.setFillColor(...dark);doc.rect(139,0,71,28,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(16);
  doc.text('AVISOS Y MULTAS',174.5,12,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(7);
  doc.text('CONVIVENCIA · SEGURIDAD · ORDEN',174.5,20,{align:'center'});
  doc.setDrawColor(...gold);doc.setLineWidth(1.1);doc.line(0,28.5,210,28.5);
  doc.setFillColor(...dark);doc.rect(0,282,210,15,'F');
  doc.setFillColor(...gold);doc.rect(0,281,210,1,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','normal');doc.setFontSize(7.7);
  doc.text('Privada Valle de los Beteles · Administración Residencial',11,289);
  doc.text('Convivencia · Seguridad · Orden',142,289,{align:'center'});
 }
 function next(height=7){if(y+height>274){doc.addPage();background();y=39;}}
 function text(t,{bold=false,size=10,space=5.7,x=17,width=176}={}){
  doc.setTextColor(...ink);doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
  const parts=doc.splitTextToSize(String(t??''),width);
  for(const p of parts){next(space);doc.text(p,x,y);y+=space;}
 }
 function section(title,symbol){
  next(15);y+=3;
  doc.setDrawColor(176,198,190);doc.setLineWidth(.2);doc.line(9,y-7,201,y-7);
  doc.setFillColor(240,240,233);doc.roundedRect(9,y-3,192,9,2,2,'F');
  doc.setFillColor(...dark);doc.circle(16,y+1.5,5,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);
  doc.text(symbol,16,y+3,{align:'center'});
  doc.setTextColor(...ink);doc.setFontSize(10.5);doc.text(title,28,y+3);
  y+=11;
 }
 background();
 doc.setFillColor(231,239,236);doc.roundedRect(8,32,194,22,3,3,'F');
 doc.setFillColor(...dark);doc.circle(18,43,8,'F');
 doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('!',18,47,{align:'center'});
 doc.setTextColor(...dark);doc.setFontSize(17);
 doc.text(multa?'NOTIFICACIÓN DE MULTA':'NOTIFICACIÓN DE AVISO',30,46);
 doc.setFillColor(248,250,248);doc.roundedRect(151,34,48,17,2,2,'F');
 doc.setTextColor(...ink);doc.setFontSize(8);doc.text('Folio: '+folio,196,40,{align:'right'});
 doc.text('Fecha: '+new Date().toLocaleDateString('es-MX'),196,47,{align:'right'});
 text('Casa: '+(casa?.numero||casa?.nombre||'Sin asignar'),{bold:true});
 text('Identificador del expediente: '+c.id,{size:8});
 text('Motivo: '+c.motivo,{bold:true});
 text('Descripción: '+(c.descripcion||'Sin descripción'));
 text('Estado del expediente: '+c.estado+'   |   Avisos registrados: '+warns.length+' de 3',{bold:true});
 section('HISTORIAL DE AVISOS','1');
 if(!warns.length)text('No se han registrado avisos.');
 for(const w of warns){text('Aviso '+w.numero+' de 3 · '+fecha(w.creado_at),{bold:true});text(w.mensaje);y+=2;}
 section(multa?'MULTA AUTORIZADA':'SITUACIÓN ACTUAL','i');
 if(multa){
  text('Monto: $'+Number(multa.monto).toLocaleString('es-MX',{minimumFractionDigits:2})+' MXN',{bold:true});
  text('Fecha: '+fecha(multa.creada_at)+' · Estado: '+multa.estado);
  text('Fundamento: '+multa.fundamento);
 }else text('Este documento es informativo. No se ha autorizado una multa en este expediente.');
 section('ACLARACIONES DEL RESIDENTE','?');
 if(!notes.length)text('No hay aclaraciones registradas.');
 for(const n of notes){text('Aclaración · '+fecha(n.creada_at),{bold:true});text(n.mensaje);text('Respuesta: '+(n.respuesta||'Pendiente de respuesta'));y+=2;}
 section('CONSTANCIA DE ADMINISTRACIÓN','4');
 next(23);y+=9;
 doc.setDrawColor(75,90,100);doc.line(20,y,94,y);doc.line(115,y,189,y);y+=6;
 text('Firma de administración                         Firma de recibido (opcional)',{size:9});
 text('La firma de recibido solo acredita recepción, no aceptación de los hechos.',{size:8});
 section('INFORMACIÓN IMPORTANTE','i');
 text('Puede presentar una aclaración desde Avisos y multas de Administración Residencial. Las sanciones deben ajustarse al reglamento y acuerdos aplicables.',{size:9});
 const pages=doc.getNumberOfPages();
 for(let i=1;i<=pages;i++){doc.setPage(i);doc.setTextColor(255,255,255);doc.setFontSize(8);doc.text('Página '+i+' de '+pages,197,289,{align:'right'});}
 const name=String(casa?.numero||'casa').replace(/[^a-zA-Z0-9_-]/g,'-');
 doc.save('Avisos-Multas-Casa-'+name+'-'+c.id.slice(0,8)+'.pdf');
}

const areaHandler=async function(e){
 const el=e.target.closest('button[data-warn],button[data-fine],button[data-clarify],button[data-answer],button[data-pdf]');if(!el)return;
 try{
  if(el.dataset.pdf){descargarPDF(el.dataset.pdf);return;}
  if(el.dataset.warn){const text=prompt('Describe el aviso. Quedará registrado y visible para la casa.');if(text===null)return;if(text.trim().length<5)return alert('Escribe al menos 5 caracteres.');await runRpc('disciplina_registrar_aviso',{p_caso_id:el.dataset.warn,p_mensaje:text});}
  if(el.dataset.fine){const monto=prompt('Monto de la multa en pesos (requiere fundamento en el reglamento):');if(monto===null)return;const n=Number(monto);if(!Number.isFinite(n)||n<=0)return alert('Monto inválido.');const fundamento=prompt('Indica el fundamento reglamentario y la razón de la multa:');if(fundamento===null)return;if(fundamento.trim().length<5)return alert('Escribe un fundamento válido.');if(!confirm('¿Autorizar multa de $'+n.toFixed(2)+'? Esta acción quedará registrada.'))return;await runRpc('disciplina_autorizar_multa',{p_caso_id:el.dataset.fine,p_monto:n,p_fundamento:fundamento});}
  if(el.dataset.clarify){const text=prompt('Escribe tu aclaración para la administración:');if(text===null)return;if(text.trim().length<5)return alert('Escribe al menos 5 caracteres.');const {error}=await sb.from('disciplina_aclaraciones').insert({caso_id:el.dataset.clarify,residente_id:me().id,mensaje:text.trim()});if(error)throw error;await load();}
  if(el.dataset.answer){const text=prompt('Escribe la respuesta administrativa:');if(text===null)return;if(text.trim().length<5)return alert('Escribe al menos 5 caracteres.');await runRpc('disciplina_responder_aclaracion',{p_id:el.dataset.answer,p_respuesta:text});}
 }catch(err){alert('No se pudo completar la acción: '+err.message);}
};
document.addEventListener('click',e=>{if(e.target.closest('#disciplinaLista'))areaHandler(e);});
window.disciplinaCargar=load;
})();