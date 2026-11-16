/* Ajustes de voz del asistente · Web Speech API.
   Muestra sólo las voces reales que el navegador ofrece.
   Las voces naturales/neuronales se identifican por su nombre; no se simulan.
   Preferencias de cada usuario en ia_preferencias (RLS por usuario_id). */
(function(){
 "use strict";
 const KEY="ia-voces-2026";
 const defaults={voz_activada:false,voz_id:"",voz_nombre:"",voz_perfil:"todas",
  voz_velocidad:1,voz_tono:1,voz_volumen:1};
 const feminine=/(?:^|\b)(paulina|monica|mónica|luciana|helena|sabina|dalia|elvira|paloma|lola|marisol|natalia|lucia|lucía|sofia|sofía|conchita|sandra|belen|belén|ines|inés|ana|isabel|victoria|alicia|ximena|gabriela|aurora|clara|valeria|catalina|abril|maite|pilar|cora|mariela|karina|maria|maría|marta|laura|silvia|female|mujer)(?:\b|$)/i;
 const masculine=/(?:^|\b)(jorge|juan|pablo|raul|raúl|carlos|diego|enrique|mateo|fernando|alvaro|álvaro|nicolas|nicolás|emilio|miguel|sergio|antonio|daniel|eduardo|mario|pedro|hector|héctor|andres|andrés|luis|tomas|tomás|alonso|borja|manuel|male|hombre)(?:\b|$)/i;
 let ui={},settings={...defaults},draft={...defaults};
 let activeUser=null,loadedFor=null,loading=null;
 let available=[],allVoices=[],initialized=false,onToggle=null;
 const allowedProfile=new Set(["todas","femeninas","masculinas","naturales"]);
 const byId=id=>ui[id];
 const speech=()=>window.speechSynthesis;
 const supported=()=>("speechSynthesis" in window&&"SpeechSynthesisUtterance" in window);
 const isNatural=v=>/\b(neural|neuronal|natural|enhanced|premium)\b/i.test(v.name||"");
 function voiceId(v){return String(v.voiceURI||v.name||"").slice(0,500);}
 function voiceSex(v){
  const name=v.name||"";
  if(feminine.test(name))return "femeninas";
  if(masculine.test(name))return "masculinas";
  return "no-identificada";
 }
 function allAvailable(){
  if(!supported())return [];
  try{return speech().getVoices().filter(v=>/^es(?:-|_|$)/i.test(v.lang||""))
   .sort((a,b)=>Number(isNatural(b))-Number(isNatural(a))||
    Number((b.lang||"")==="es-MX")-Number((a.lang||"")==="es-MX")||
    a.name.localeCompare(b.name,"es"));}catch{return [];}
 }
 function selectVoice(preferred=settings){
  const voices=allAvailable();
  return voices.find(v=>voiceId(v)===preferred.voz_id&&v.name===preferred.voz_nombre)||
   voices.find(v=>v.name===preferred.voz_nombre&&preferred.voz_nombre)||
   voices.find(v=>voiceId(v)===preferred.voz_id&&preferred.voz_id)||
   voices.find(v=>v.lang==="es-MX")||voices[0]||null;
 }
 function configure(utterance,values=settings,chosen=null){
  const voice=chosen||selectVoice(values);
  if(voice){utterance.voice=voice;utterance.lang=voice.lang||"es-MX";}
  else utterance.lang="es-MX";
  utterance.rate=Number(values.voz_velocidad)||1;
  utterance.pitch=Number(values.voz_tono)||1;
  utterance.volume=values.voz_volumen==null?1:Number(values.voz_volumen);
  return utterance;
 }
 function node(tag,className,text,parent){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!=null)el.textContent=text;
  if(parent)parent.appendChild(el);
  return el;
 }
 function label(text,htmlFor,parent){
  const l=node("label","ia-voice-label",text,parent);
  if(htmlFor)l.htmlFor=htmlFor;return l;
 }
 function inputRange(id,labelText,min,max,step,parent){
  const wrap=node("div","ia-voice-range",null,parent);
  const header=node("div","ia-voice-range-title",null,wrap);
  label(labelText,id,header);
  const out=node("output","ia-voice-output","1.00",header);out.htmlFor=id;
  const control=node("input","",null,wrap);
  control.id=id;control.type="range";control.min=String(min);control.max=String(max);control.step=String(step);
  control.addEventListener("input",()=>{out.textContent=Number(control.value).toFixed(2);});
  return control;
 }
 function showMessage(text,error=false){
  if(!ui.feedback)return;
  ui.feedback.textContent=text;ui.feedback.dataset.error=String(error);
 }
 function loadInputs(){
  if(!initialized)return;
  draft={...settings};
  const profile=allowedProfile.has(draft.voz_perfil)?draft.voz_perfil:"todas";
  ui.filters.forEach((button,key)=>{
   const active=key===profile;
   button.setAttribute("aria-pressed",String(active));
   button.classList.toggle("ia-voice-filter-selected",active);
  });
  ui.speed.value=String(draft.voz_velocidad);
  ui.pitch.value=String(draft.voz_tono);
  ui.volume.value=String(draft.voz_volumen);
  for(const slider of [ui.speed,ui.pitch,ui.volume])slider.dispatchEvent(new Event("input",{bubbles:false}));
  refreshVoices();
  showMessage("");
 }
 function updateProfile(p){
  if(!allowedProfile.has(p))return;
  draft.voz_perfil=p;
  draft.voz_id="";draft.voz_nombre="";
  ui.filters.forEach((button,key)=>{
   const active=p===key;button.setAttribute("aria-pressed",String(active));
   button.classList.toggle("ia-voice-filter-selected",active);
  });
  refreshVoices();
 }
 function refreshVoices(){
  if(!initialized)return;
  const prev=ui.select.value||"";
  allVoices=allAvailable();
  available=allVoices.filter(v=>{
   if(draft.voz_perfil==="naturales")return isNatural(v);
   if(draft.voz_perfil==="femeninas"||draft.voz_perfil==="masculinas")
    return voiceSex(v)===draft.voz_perfil;
   return true;
  });
  ui.select.replaceChildren();
  if(!supported()){
   node("option","", "La voz no está disponible en este navegador",ui.select).value="";
  }else if(!allVoices.length){
   node("option","","El dispositivo no ha proporcionado voces en español",ui.select).value="";
  }else if(!available.length){
   node("option","","No se encontraron voces de esta categoría",ui.select).value="";
  }else{
   const option=node("option","","Automática · español del dispositivo",ui.select);
   option.value="auto";
   available.forEach((voice,index)=>{
    const label=voice.name+" · "+(voice.lang||"Español")+
     (isNatural(voice)?" · Natural/Neuronal":"");
    node("option","",label,ui.select).value=String(index);
   });
  }
  ui.select.disabled=!available.length;
  ui.preview.disabled=!supported()||!available.length;
  ui.save.disabled=!supported();
  const exact=available.findIndex(v=>voiceId(v)===draft.voz_id&&v.name===draft.voz_nombre);
  ui.select.value=exact>=0?String(exact):available.length?(draft.voz_perfil==="todas"?"auto":"0"):"";
  if(prev&&ui.select.value!==prev){} // La selección guardada tiene prioridad.
  ui.count.textContent=allVoices.length
   ?available.length+" de "+allVoices.length+" voces disponibles en español."
   :"Sin voces detectadas todavía. En iPhone puede requerir iniciar una prueba.";
  if(draft.voz_perfil==="naturales"&&!available.length&&allVoices.length)
   showMessage("No hay voces identificadas como naturales o neuronales en este dispositivo.",false);
  else if(["femeninas","masculinas"].includes(draft.voz_perfil)&&!available.length&&allVoices.length)
   showMessage("Este navegador no identifica voces de esta categoría por nombre. Prueba la pestaña Todas.",false);
 }
 function picked(){
  if(ui.select.value==="auto")return null;
  const index=Number(ui.select.value);
  return Number.isInteger(index)&&index>=0?available[index]||null:null;
 }
 function readForm(){
  const chosen=picked();
  return{
   voz_activada:!!settings.voz_activada,
   voz_id:chosen?voiceId(chosen):"",
   voz_nombre:chosen?String(chosen.name||"").slice(0,200):"",
   voz_perfil:draft.voz_perfil,
   voz_velocidad:Number(ui.speed.value),
   voz_tono:Number(ui.pitch.value),
   voz_volumen:Number(ui.volume.value)
  };
 }
 function playPreview(){
  if(!supported()){showMessage("La lectura de voz no está disponible en este navegador.",true);return;}
  const values=readForm();
  const chosen=picked();
  const sample=new SpeechSynthesisUtterance(
   "Hola. Soy tu asistente de Administración Residencial. Puedo ayudarte con cuotas, reservaciones y avisos de la privada.");
  configure(sample,values,chosen);
  sample.onerror=()=>showMessage("No se pudo reproducir la muestra. Comprueba el volumen de tu dispositivo.",true);
  sample.onstart=()=>showMessage("Reproduciendo muestra…");
  sample.onend=()=>showMessage("Muestra terminada. Puedes guardar esta voz.");
  try{speech().cancel();speech().speak(sample);}
  catch(e){showMessage("El navegador no permitió reproducir la voz: "+(e?.message||"Error"),true);}
 }
 function safeSettings(value){
  const s={...defaults,...value};
  if(!allowedProfile.has(s.voz_perfil))s.voz_perfil="todas";
  s.voz_id=String(s.voz_id||"").slice(0,500);
  s.voz_nombre=String(s.voz_nombre||"").slice(0,200);
  for(const [key,min,max] of [["voz_velocidad",.70,1.40],["voz_tono",.70,1.40],["voz_volumen",0,1]]){
   const n=Number(s[key]);s[key]=Number.isFinite(n)?Math.max(min,Math.min(max,n)):1;
  }
  s.voz_activada=!!s.voz_activada;return s;
 }
 async function save(values,silent=false){
  if(!activeUser||typeof sb==="undefined")return;
  const actor=activeUser;
  const toSave={usuario_id:actor,...safeSettings(values),updated_at:new Date().toISOString()};
  try{
   const {error}=await sb.from("ia_preferencias").upsert(toSave,{onConflict:"usuario_id"});
   if(error)throw error;
   if(activeUser!==actor)return;
   if(!silent)showMessage("✅ Voz y ajustes guardados para tu cuenta.");
  }catch(err){
   if(!silent)showMessage("No se pudieron guardar las preferencias: "+(err?.message||"Error"),true);
   else console.warn("IA: no se pudo guardar la preferencia de voz",err?.message||err);
  }
 }
 async function loadForUser(id){
  if(!id||typeof sb==="undefined")return;
  if(loadedFor===id)return;
  if(loading&&activeUser===id)return loading;
  activeUser=id;settings={...defaults};loadedFor=null;
  if(initialized)loadInputs();
  loading=(async()=>{
   try{
    const {data,error}=await sb.from("ia_preferencias")
     .select("voz_activada,voz_id,voz_nombre,voz_perfil,voz_velocidad,voz_tono,voz_volumen")
     .eq("usuario_id",id).maybeSingle();
    if(error)throw error;
    if(activeUser!==id)return;
    settings=safeSettings(data||defaults);
    loadedFor=id;
    if(onToggle)onToggle(settings.voz_activada);
    if(initialized&&!ui.overlay.hidden)return;
    loadInputs();
   }catch(err){
    if(activeUser===id)showMessage("Preferencias locales: no se pudieron consultar los ajustes guardados.",true);
    console.warn("IA: preferencias de voz",err?.message||err);
   }finally{loading=null;}
  })();
  return loading;
 }
 function isOpen(){return initialized&&!ui.overlay.hidden;}
 function close(){
  if(!isOpen())return;
  ui.overlay.hidden=true;
  if(supported())speech().cancel();
  ui.trigger.focus();
 }
 function open(){
  if(!initialized)return;
  loadInputs();
  ui.overlay.hidden=false;
  ui.select.focus();
  refreshVoices();
 }
 function setEnabled(enabled){
  settings.voz_activada=!!enabled;
  void save(settings,true);
 }
 function init({panel,toolbar,onVoiceChange}){
  if(initialized||!panel||!toolbar)return;
  onToggle=onVoiceChange;
  ui.trigger=node("button","ia-voice-settings-trigger","Voz",toolbar);
  ui.trigger.type="button";ui.trigger.title="Elegir y probar la voz";
  ui.trigger.setAttribute("aria-label","Configurar voz del asistente");
  ui.trigger.onclick=open;
  ui.overlay=node("div","ia-voice-overlay",null,panel);
  ui.overlay.hidden=true;
  ui.overlay.setAttribute("role","presentation");
  const sheet=node("section","ia-voice-sheet",null,ui.overlay);
  sheet.setAttribute("role","dialog");
  sheet.setAttribute("aria-modal","true");
  sheet.setAttribute("aria-labelledby","iaVoiceTitle");
  const header=node("div","ia-voice-head",null,sheet);
  const texts=node("div","",null,header);
  const heading=node("h2","", "Personalizar voz",texts);heading.id="iaVoiceTitle";
  node("p","", "Selecciona una voz disponible en tu dispositivo.",texts);
  const closeButton=node("button","ia-voice-close","×",header);
  closeButton.type="button";closeButton.setAttribute("aria-label","Cerrar ajustes de voz");
  closeButton.onclick=close;
  node("p","ia-voice-section-caption","TIPO DE VOZ",sheet);
  const filters=node("div","ia-voice-filters",null,sheet);
  ui.filters=new Map();
  for(const [key,name] of [["todas","Todas"],["femeninas","Femeninas"],["masculinas","Masculinas"],["naturales","Naturales / neuronales"]]){
   const btn=node("button","ia-voice-filter",name,filters);
   btn.type="button";btn.setAttribute("aria-pressed","false");
   btn.onclick=()=>updateProfile(key);ui.filters.set(key,btn);
  }
  label("Voces en español","iaVoiceSelector",sheet);
  ui.select=node("select","ia-voice-select",null,sheet);ui.select.id="iaVoiceSelector";
  ui.select.setAttribute("aria-label","Selecciona una voz para el asistente");
  ui.count=node("p","ia-voice-note","Consultando voces…",sheet);
  node("p","ia-voice-note",
   "Las voces femeninas y masculinas se clasifican por nombre. Las opciones naturales o neuronales solo aparecen si el dispositivo las anuncia. Algunas requieren conexión.",sheet);
  const sliders=node("div","ia-voice-sliders",null,sheet);
  ui.speed=inputRange("iaVoiceSpeed","Velocidad",.70,1.40,.05,sliders);
  ui.pitch=inputRange("iaVoicePitch","Tono",.70,1.40,.05,sliders);
  ui.volume=inputRange("iaVoiceVolume","Volumen",0,1,.05,sliders);
  ui.feedback=node("p","ia-voice-feedback","",sheet);ui.feedback.setAttribute("role","status");
  ui.feedback.setAttribute("aria-live","polite");
  const buttons=node("div","ia-voice-actions",null,sheet);
  ui.preview=node("button","ia-voice-preview","▶ Escuchar muestra",buttons);
  ui.preview.type="button";ui.preview.onclick=playPreview;
  ui.save=node("button","ia-voice-save","Guardar mi voz",buttons);
  ui.save.type="button";ui.save.onclick=async()=>{
   const values=readForm();
   ui.save.disabled=true;
   settings=safeSettings({...values,voz_activada:true});
   if(onToggle)onToggle(true);
   try{await save(settings);}
   finally{ui.save.disabled=false;}
  };
  ui.overlay.addEventListener("click",ev=>{if(ev.target===ui.overlay)close();});
  ui.overlay.addEventListener("keydown",event=>{
   if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();return;}
   if(event.key==="Tab"){
    const focusable=[...sheet.querySelectorAll("button:not(:disabled),select:not(:disabled),input:not(:disabled)")];
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  });
  initialized=true;
  if(supported()){
   const synth=speech();
   if(typeof synth.addEventListener==="function")synth.addEventListener("voiceschanged",refreshVoices);
   else synth.onvoiceschanged=refreshVoices;
  }
  loadInputs();
 }
 window.IAVoces={init,open,close,isOpen,configure,loadForUser,setEnabled};
})();
