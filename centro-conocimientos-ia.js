/* Centro de conocimientos IA · Sólo Sistema Admin puede administrar.
   El asistente consulta únicamente documentos activos y visibles por rol.
   Archivos admitidos: .txt y .md (texto); no se procesan PDF automáticamente. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id);
 let loaded=false,busy=false,rows=[],lastData="";
 const readonly=()=>profile?.rol!=="owner"||profile?.activo!==true||
  (profile?.estado_registro&&profile.estado_registro!=="aprobado");
 const audiences={
  todos:["owner","admin","residente"],
  administracion:["owner","admin"],
  residentes:["owner","residente"],
  sistema:["owner"]
 };
 const escapeText=s=>String(s??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 }[c]));
 function feedback(message,error=false){
  const el=$("iaConocimientoEstado");
  if(!el)return;
  el.textContent=message;el.dataset.error=String(error);
 }
 function tipoCambio(){
  const t=$("iaConocimientoTipo")?.value;
  if(!t)return;
  const qa=t==="pregunta";
  $("iaKbPreguntaWrap").hidden=!qa;
  $("iaKbRespuestaWrap").hidden=!qa;
  $("iaKbContenidoWrap").hidden=qa;
  $("iaConocimientoPregunta").required=qa;
  $("iaConocimientoRespuesta").required=qa;
  $("iaConocimientoContenido").required=!qa;
  const hint=$("iaKbArchivoHint");
  if(hint)hint.hidden=t!=="documento";
 }
 function resetForm(){
  $("iaConocimientoForm")?.reset();
  $("iaConocimientoId").value="";
  $("iaConocimientoGuardar").textContent="Guardar conocimiento";
  $("iaConocimientoCancelar").hidden=true;
  tipoCambio();feedback("");
 }
 function audienciaDe(registro){
  const roles=registro.roles||[];
  return Object.keys(audiences).find(k=>
   roles.length===audiences[k].length&&roles.every(x=>audiences[k].includes(x))
  )||"sistema";
 }
 function labelAudiencia(a){
  return ({todos:"Todos",administracion:"Administración",residentes:"Residentes",sistema:"Solo Sistema Admin"})[a]||a;
 }
 function render(){
  const list=$("iaConocimientosLista");
  if(!list)return;
  const filtro=($("iaConocimientoFiltro")?.value||"").trim().toLocaleLowerCase("es");
  list.replaceChildren();
  const found=rows.filter(x=>(x.titulo+" "+x.categoria+" "+x.pregunta+" "+x.contenido)
   .toLocaleLowerCase("es").includes(filtro));
  $("iaConocimientoContador").textContent=found.length+" entradas de "+rows.length;
  if(!found.length){
   const p=document.createElement("p");p.className="muted";
   p.textContent=rows.length?"No coinciden conocimientos con esa búsqueda.":"Todavía no has enseñado conocimientos a la IA. Agrega la primera regla o pregunta.";
   list.appendChild(p);return;
  }
  for(const x of found){
   const article=document.createElement("article");article.className="card ia-kb-item";
   const heading=document.createElement("div");heading.className="ia-kb-item-head";
   const info=document.createElement("div");
   const title=document.createElement("h3");title.textContent=x.titulo;
   const meta=document.createElement("p");meta.className="muted";
   meta.textContent=x.categoria+" · "+
     ({regla:"Regla",pregunta:"Pregunta y respuesta",documento:"Documento de texto"}[x.tipo]||x.tipo)+
     " · "+labelAudiencia(audienciaDe(x))+" · "+(x.activo?"Publicado":"Borrador");
   info.append(title,meta);heading.appendChild(info);
   const controls=document.createElement("div");controls.className="ia-kb-actions";
   const edit=document.createElement("button");edit.type="button";edit.textContent="✏️ Editar";
   edit.onclick=()=>editItem(x.id);
   const toggle=document.createElement("button");toggle.type="button";
   toggle.textContent=x.activo?"Despublicar":"Publicar";
   toggle.onclick=()=>void toggleItem(x.id);
   const del=document.createElement("button");del.type="button";del.className="danger";
   del.textContent="Eliminar";
   del.onclick=()=>void deleteItem(x.id);
   controls.append(edit,toggle,del);heading.appendChild(controls);
   article.appendChild(heading);
   const preview=document.createElement("p");preview.className="ia-kb-preview";
   preview.textContent=(x.tipo==="pregunta"?x.pregunta+" — "+x.respuesta:x.contenido).slice(0,350);
   article.appendChild(preview);
   list.appendChild(article);
  }
 }
 function editItem(id){
  if(readonly())return;
  const x=rows.find(r=>r.id===id);
  if(!x)return;
  $("iaConocimientoId").value=x.id;
  $("iaConocimientoTipo").value=x.tipo;
  $("iaConocimientoCategoria").value=x.categoria;
  $("iaConocimientoTitulo").value=x.titulo;
  $("iaConocimientoPregunta").value=x.pregunta||"";
  $("iaConocimientoRespuesta").value=x.respuesta||"";
  $("iaConocimientoContenido").value=x.contenido||"";
  $("iaConocimientoAudiencia").value=audienciaDe(x);
  $("iaConocimientoActivo").checked=!!x.activo;
  $("iaConocimientoGuardar").textContent="Guardar cambios";
  $("iaConocimientoCancelar").hidden=false;
  tipoCambio();
  $("iaConocimientoForm").scrollIntoView({block:"start",behavior:"smooth"});
  $("iaConocimientoTitulo").focus();
 }
 async function saveItem(e){
  e?.preventDefault();
  if(readonly()||busy)return;
  const tipo=$("iaConocimientoTipo").value;
  const categoria=$("iaConocimientoCategoria").value.trim();
  const titulo=$("iaConocimientoTitulo").value.trim();
  const pregunta=$("iaConocimientoPregunta").value.trim();
  const respuesta=$("iaConocimientoRespuesta").value.trim();
  const contenido=$("iaConocimientoContenido").value.trim();
  const id=$("iaConocimientoId").value;
  const activo=$("iaConocimientoActivo").checked;
  const rol=$("iaConocimientoAudiencia").value;
  if(!audiences[rol]||!["regla","pregunta","documento"].includes(tipo)){
   feedback("Selecciona un tipo y una audiencia válidos.",true);return;
  }
  if(titulo.length<4||titulo.length>160||categoria.length<2||categoria.length>70){
   feedback("El título debe tener 4–160 caracteres y la categoría 2–70.",true);return;
  }
  if(tipo==="pregunta"&&(!pregunta||!respuesta)){
   feedback("Completa la pregunta y su respuesta.",true);return;
  }
  if(tipo!=="pregunta"&&!contenido){
   feedback("Escribe el contenido de la regla o documento.",true);return;
  }
  if(pregunta.length>500||respuesta.length>6000||contenido.length>16000){
   feedback("El texto es demasiado largo. Divide el documento en varias entradas.",true);return;
  }
  const values={tipo,categoria,titulo,pregunta:tipo==="pregunta"?pregunta:"",
   respuesta:tipo==="pregunta"?respuesta:"",contenido:tipo==="pregunta"?"":contenido,
   roles:audiences[rol],activo,actualizado_por:user.id,updated_at:new Date().toISOString()};
  busy=true;$("iaConocimientoGuardar").disabled=true;
  feedback("Guardando el conocimiento…");
  try{
   let result;
   if(id)result=await sb.from("ia_conocimientos").update(values).eq("id",id).select("id").single();
   else result=await sb.from("ia_conocimientos").insert({...values,creado_por:user.id}).select("id").single();
   if(result.error)throw result.error;
   resetForm();
   await window.cargarConocimientosIA(true);
   feedback("✅ Conocimiento guardado. La IA puede consultar las entradas publicadas según el rol.");
  }catch(err){feedback("No se pudo guardar: "+(err?.message||"Error de conexión"),true);}
  finally{busy=false;$("iaConocimientoGuardar").disabled=false;}
 }
 async function toggleItem(id){
  if(readonly()||busy)return;
  const x=rows.find(r=>r.id===id);if(!x)return;
  busy=true;
  try{
   const {error}=await sb.from("ia_conocimientos").update({
    activo:!x.activo,actualizado_por:user.id,updated_at:new Date().toISOString()
   }).eq("id",id);
   if(error)throw error;
   await window.cargarConocimientosIA(true);
   feedback(x.activo?"Conocimiento despublicado.":"Conocimiento publicado.");
  }catch(err){feedback("No se pudo cambiar el estado: "+err.message,true);}
  finally{busy=false;}
 }
 async function deleteItem(id){
  if(readonly()||busy)return;
  const x=rows.find(r=>r.id===id);if(!x)return;
  if(!confirm("¿Eliminar definitivamente «"+x.titulo+"»? No se podrá recuperar."))return;
  busy=true;
  try{
   const {error}=await sb.from("ia_conocimientos").delete().eq("id",id);
   if(error)throw error;
   if($("iaConocimientoId").value===id)resetForm();
   await window.cargarConocimientosIA(true);
   feedback("Conocimiento eliminado.");
  }catch(err){feedback("No se pudo eliminar: "+err.message,true);}
  finally{busy=false;}
 }
 async function importFile(e){
  if(readonly())return;
  const file=e?.target?.files?.[0];
  if(!file)return;
  if(!/\.(txt|md)$/i.test(file.name)||file.size>100000){
   feedback("Usa archivos .txt o .md de hasta 100 KB. Los PDF requieren extracción de texto previa.",true);
   e.target.value="";return;
  }
  try{
   const text=await file.text();
   if(!text.trim()||text.length>16000){
    feedback("El texto debe contener entre 1 y 16,000 caracteres. Divide documentos largos en secciones.",true);
    return;
   }
   $("iaConocimientoTipo").value="documento";
   $("iaConocimientoTitulo").value=file.name.replace(/\.(txt|md)$/i,"").slice(0,160);
   $("iaConocimientoContenido").value=text;
   tipoCambio();feedback("Archivo de texto cargado. Revisa el contenido y pulsa Guardar conocimiento.");
  }catch(err){feedback("No se pudo leer el archivo: "+err.message,true);}
  finally{e.target.value="";}
 }
 window.cargarConocimientosIA=async function(silent=false){
  if(readonly()||!user||busy)return;
  const actor=user.id;
  try{
   const {data,error}=await sb.from("ia_conocimientos")
    .select("id,tipo,categoria,titulo,pregunta,respuesta,contenido,roles,activo,created_at,updated_at")
    .order("updated_at",{ascending:false}).limit(500);
   if(error)throw error;
   if(user?.id!==actor||readonly())return;
   const next=JSON.stringify(data||[]);
   if(!loaded||next!==lastData){
    rows=data||[];lastData=next;render();
   }
   loaded=true;
  }catch(err){if(!silent)feedback("No se pudo cargar: "+err.message,true);}
 };
 function init(){
  const form=$("iaConocimientoForm");
  if(!form||form.dataset.ready==="true")return;
  form.dataset.ready="true";
  form.addEventListener("submit",saveItem);
  $("iaConocimientoTipo").addEventListener("change",tipoCambio);
  $("iaConocimientoFiltro").addEventListener("input",render);
  $("iaConocimientoCancelar").addEventListener("click",resetForm);
  $("iaConocimientoArchivo").addEventListener("change",importFile);
  tipoCambio();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
 else init();
})();
