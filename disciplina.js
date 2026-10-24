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
areaHandler=async function(e){
 const el=e.target.closest('button[data-warn],button[data-fine],button[data-clarify],button[data-answer]');if(!el)return;
 try{
  if(el.dataset.warn){const text=prompt('Describe el aviso. Quedará registrado y visible para la casa.');if(text===null)return;if(text.trim().length<5)return alert('Escribe al menos 5 caracteres.');await runRpc('disciplina_registrar_aviso',{p_caso_id:el.dataset.warn,p_mensaje:text});}
  if(el.dataset.fine){const monto=prompt('Monto de la multa en pesos (requiere fundamento en el reglamento):');if(monto===null)return;const n=Number(monto);if(!Number.isFinite(n)||n<=0)return alert('Monto inválido.');const fundamento=prompt('Indica el fundamento reglamentario y la razón de la multa:');if(fundamento===null)return;if(fundamento.trim().length<5)return alert('Escribe un fundamento válido.');if(!confirm('¿Autorizar multa de $'+n.toFixed(2)+'? Esta acción quedará registrada.'))return;await runRpc('disciplina_autorizar_multa',{p_caso_id:el.dataset.fine,p_monto:n,p_fundamento:fundamento});}
  if(el.dataset.clarify){const text=prompt('Escribe tu aclaración para la administración:');if(text===null)return;if(text.trim().length<5)return alert('Escribe al menos 5 caracteres.');const {error}=await sb.from('disciplina_aclaraciones').insert({caso_id:el.dataset.clarify,residente_id:me().id,mensaje:text.trim()});if(error)throw error;await load();}
  if(el.dataset.answer){const text=prompt('Escribe la respuesta administrativa:');if(text===null)return;if(text.trim().length<5)return alert('Escribe al menos 5 caracteres.');await runRpc('disciplina_responder_aclaracion',{p_id:el.dataset.answer,p_respuesta:text});}
 }catch(err){alert('No se pudo completar la acción: '+err.message);}
};
document.addEventListener('click',e=>{if(e.target.closest('#disciplinaLista'))areaHandler(e);});
window.disciplinaCargar=load;
})();