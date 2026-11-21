// Interfón WebRTC piloto: audio entre navegador del visitante y panel del residente.
// Sin números telefónicos, grabaciones, acceso a relés ni aperturas.
(function(){
 "use strict";
 if(typeof sb==="undefined"||!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)return;

 const visitPage=!!document.getElementById("waitCard");
 const visitorBox=visitPage?document.createElement("div"):null;
 const residentBox=!visitPage?document.createElement("div"):null;
 const style="border:1px solid #38bdf8;border-radius:14px;background:#102434;padding:14px;color:#f8fafc;z-index:1500;box-shadow:0 10px 30px #0005";
 let visitorToken=null,session=null,residentRequest=null,inboxBusy=false;
 let lastInboxTime=0;
 const baseBtn="border:1px solid #64748b;border-radius:10px;padding:12px;background:#185c64;color:white;font-weight:700;margin:5px;cursor:pointer";
 const button=(label,action)=>{
   const el=document.createElement("button");el.type="button";el.textContent=label;
   el.style.cssText=baseBtn;el.addEventListener("click",action);return el;
 };
 const label=(text)=>{const el=document.createElement("p");el.textContent=text;el.style.margin="8px 0";return el;};
 const call=(accion,extra)=>sb.functions.invoke("interfon-webrtc",{body:Object.assign({accion},extra||{})}).then(async r=>{
   if(r.error||r.data?.ok!==true){
    let message=r.data?.error||r.error?.message||"No se pudo conectar.";
    try{const detail=await r.error?.context?.json?.();if(detail?.error)message=detail.error;}catch(_){}
    throw Error(message);
   }
   return r.data;
 });
 function paint(box){box.style.cssText=style;}
 if(visitorBox){
   paint(visitorBox);visitorBox.style.marginTop="14px";visitorBox.classList.add("hidden");
   const title=label("📞 Llamar por internet al residente");
   title.style.fontWeight="800";
   const desc=label("Después de enviar tu solicitud, puedes conversar por audio desde este celular. Debes aceptar el micrófono y mantener la página abierta. No autoriza ninguna apertura.");
   desc.style.fontSize=".9rem";
   const status=label("");
   status.id="webrtcVisitanteEstado";status.setAttribute("role","status");
   const start=button("📞 Iniciar llamada de voz",iniciarVisitante);
   start.id="webrtcVisitanteIniciar";
   const end=button("Terminar llamada",()=>terminar(true));
   end.id="webrtcVisitanteTerminar";end.hidden=true;
   const listen=button("🔊 Escuchar audio",()=>session?.audio?.play().catch(()=>{}));
   listen.id="webrtcVisitanteEscuchar";listen.hidden=true;
   const audio=document.createElement("audio");audio.autoplay=true;audio.playsInline=true;audio.id="webrtcVisitanteAudio";
   visitorBox.append(title,desc,start,end,listen,status,audio);
   document.getElementById("waitCard").appendChild(visitorBox);
 }
 if(residentBox){
   paint(residentBox);
   residentBox.style.cssText+=";position:fixed;bottom:16px;left:12px;right:12px;max-width:480px;margin:auto;display:none;";
   residentBox.setAttribute("role","dialog");
   residentBox.setAttribute("aria-label","Llamada del portero");
   const title=label("📞 Llamada de visita desde el portero");
   title.style.fontWeight="800";
   const detail=label("");detail.id="webrtcResidenteDetalle";
   const status=label("");status.id="webrtcResidenteEstado";status.setAttribute("role","status");
   const yes=button("🎤 Contestar",contestarResidente);yes.id="webrtcResidenteContestar";
   const no=button("Rechazar",rechazarResidente);no.id="webrtcResidenteRechazar";
   const end=button("Terminar llamada",()=>terminar(true));end.id="webrtcResidenteTerminar";end.hidden=true;
   const listen=button("🔊 Escuchar audio",()=>session?.audio?.play().catch(()=>{}));
   listen.id="webrtcResidenteEscuchar";listen.hidden=true;
   const audio=document.createElement("audio");audio.autoplay=true;audio.playsInline=true;audio.id="webrtcResidenteAudio";
   residentBox.append(title,detail,status,yes,no,end,listen,audio);
   document.body.appendChild(residentBox);
 }
 const v=(suffix)=>document.getElementById("webrtcVisitante"+suffix);
 const r=(suffix)=>document.getElementById("webrtcResidente"+suffix);
 const status=(message)=>{
   const el=visitPage?v("Estado"):r("Estado");
   if(el)el.textContent=message;
 };
 const showControls=(active)=>{
   if(visitPage){v("Iniciar").hidden=active;v("Terminar").hidden=!active;}
   else{r("Contestar").hidden=active;r("Rechazar").hidden=active;r("Terminar").hidden=!active;}
 };
 function remoteAudio(){return visitPage?v("Audio"):r("Audio");}
 function listenButton(){return visitPage?v("Escuchar"):r("Escuchar");}
 function cleanLocal(s){
   if(!s)return;
   if(s.timer)clearInterval(s.timer);
   try{s.pc?.close();}catch(_){}
   s.stream?.getTracks().forEach(track=>track.stop());
   if(s.audio){s.audio.pause();s.audio.srcObject=null;}
 }
 async function terminar(notify){
   const old=session;session=null;cleanLocal(old);
   if(notify&&old?.id)call("finalizar",{id:old.id,...(old.rol==="visitante"?{token:old.token}:{})}).catch(()=>{});
   if(visitPage){if(visitorToken&&visitorBox){showControls(false);status("Llamada finalizada.");listenButton().hidden=true;}}
   else{residentRequest=null;residentBox.style.display="none";showControls(false);}
 }
 async function newPeer(s){
   if(s.pc)return s.pc;
   const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
   s.pc=pc;
   s.stream.getTracks().forEach(track=>pc.addTrack(track,s.stream));
   pc.ontrack=event=>{
     if(session!==s)return;
     s.audio.srcObject=event.streams[0]||new MediaStream([event.track]);
     s.audio.play().then(()=>{listenButton().hidden=true;}).catch(()=>{listenButton().hidden=false;});
     status("🎧 Audio conectado. Pulsa «Escuchar audio» si no se oye.");
   };
   pc.onicecandidate=event=>{
     if(event.candidate&&session===s)send(s,"ice",event.candidate.toJSON()).catch(()=>{});
   };
   pc.onconnectionstatechange=()=>{
     if(session!==s)return;
     if(pc.connectionState==="connected")status("✅ Conversación de voz conectada.");
     if(pc.connectionState==="failed")status("No se pudo establecer audio en esta red. Es posible que necesitemos un servidor TURN.");
     if(pc.connectionState==="disconnected")status("La conexión de audio se interrumpió.");
   };
   return pc;
 }
 function send(s,tipo,contenido){
   return call("senal",{id:s.id,tipo,contenido,...(s.rol==="visitante"?{token:s.token}:{})});
 }
 async function handleSignal(s,m){
   if(session!==s)return;
   const pc=await newPeer(s);
   if(m.tipo==="offer" && s.rol==="residente" && !pc.remoteDescription){
     await pc.setRemoteDescription(m.contenido);
     await flushIce(s);
     const answer=await pc.createAnswer();
     await pc.setLocalDescription(answer);
     await send(s,"answer",{type:answer.type,sdp:answer.sdp});
   }else if(m.tipo==="answer" && s.rol==="visitante" && !pc.remoteDescription){
     await pc.setRemoteDescription(m.contenido);
     await flushIce(s);
   }else if(m.tipo==="ice"){
     if(pc.remoteDescription)await pc.addIceCandidate(m.contenido).catch(()=>{});
     else s.pendingIce.push(m.contenido);
   }
 }
 async function flushIce(s){
   while(s.pendingIce.length&&s.pc?.remoteDescription){
     const ice=s.pendingIce.shift();
     await s.pc.addIceCandidate(ice).catch(()=>{});
   }
 }
 async function poll(s){
   if(session!==s||s.busy)return;
   s.busy=true;
   try{
    const data=await call("estado",{id:s.id,cursor:s.cursor,...(s.rol==="visitante"?{token:s.token}:{})});
    s.failures=0;
    if(session!==s)return;
    if(["rechazada","finalizada","vencida"].includes(data.estado)){
      const reason=data.estado==="rechazada"?"El residente rechazó la llamada.":"La llamada terminó o venció.";
      await terminar(false);if(visitPage)status(reason);return;
    }
    if(data.estado==="conectando"){
      if(s.rol==="visitante"&&!s.offered){
        s.offered=true;
        const pc=await newPeer(s);
        const offer=await pc.createOffer();
        await pc.setLocalDescription(offer);
        await send(s,"offer",{type:offer.type,sdp:offer.sdp});
        status("Conectando el audio con el residente…");
      }
      for(const m of data.senales||[]){
        try{await handleSignal(s,m);}catch(_){status("No se pudo negociar la llamada. Puedes terminar e iniciar otra solicitud.");}
        s.cursor=Math.max(s.cursor,Number(m.id)||0);
      }
    }else status("Sonando en el panel del residente. Esperando respuesta…");
   }catch(e){
    s.failures++;
    if(s.failures===2)status("Esperando conexión con el servidor…");
    if(s.failures>=5){await terminar(false);if(visitPage)status("La llamada no pudo continuar. Actualiza la página para una nueva solicitud.");}
   }finally{s.busy=false;}
 }
 function sessionFor(id,rol,token,stream){
   const s={id,rol,token,stream,audio:remoteAudio(),pc:null,cursor:0,
      offered:false,pendingIce:[],busy:false,failures:0,timer:null};
   session=s;
   s.timer=setInterval(()=>poll(s),1400);
   poll(s);
   return s;
 }
 async function iniciarVisitante(){
   if(!visitorToken||session)return;
   v("Iniciar").disabled=true;status("Solicitando permiso para utilizar el micrófono…");
   let mic=null;
   try{
     mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
     const result=await call("iniciar",{token:visitorToken});
     sessionFor(result.id,"visitante",visitorToken,mic);
     showControls(true);status("Sonando en el panel del residente. Mantén abierta esta página.");
   }catch(err){mic?.getTracks().forEach(t=>t.stop());status(err.message||"No fue posible llamar.");}
   finally{v("Iniciar").disabled=false;}
 }
 async function contestarResidente(){
   if(!residentRequest||session)return;
   const id=residentRequest.id;
   r("Contestar").disabled=true;status("Solicitando permiso de micrófono…");
   let mic=null;
   try{
     mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
     await call("aceptar",{id});
     sessionFor(id,"residente",null,mic);
     showControls(true);status("Conectando al visitante…");
   }catch(err){mic?.getTracks().forEach(t=>t.stop());status(err.message||"No se pudo contestar.");}
   finally{r("Contestar").disabled=false;}
 }
 async function rechazarResidente(){
   if(!residentRequest||session)return;
   const id=residentRequest.id;status("Rechazando llamada…");
   try{await call("rechazar",{id});residentRequest=null;residentBox.style.display="none";}
   catch(err){status(err.message||"No fue posible rechazar.");}
 }
 async function checkInbox(){
   if(visitPage||inboxBusy||session)return;
   if(typeof profile==="undefined"||profile?.rol!=="residente"||typeof user==="undefined"||!user){
     residentBox.style.display="none";residentRequest=null;return;
   }
   inboxBusy=true;
   try{
     const data=await call("inbox");
     const incoming=(data.llamadas||[]).find(c=>c.estado==="sonando");
     if(!incoming){residentRequest=null;residentBox.style.display="none";return;}
     if(residentRequest?.id!==incoming.id)status("Tienes una llamada de voz pendiente.");
     residentRequest=incoming;
     r("Detalle").textContent="Casa solicitada: "+(profile.unidad||"tu casa")+
       ". "+(incoming.nombre||"Visitante")+" · "+(incoming.empresa||incoming.tipo||"visita")+
       ". Datos declarados por el visitante, no verificados.";
     residentBox.style.display="block";
   }catch(_){ /* No mostrar un estado falso de llamada si falla la red. */ }
   finally{inboxBusy=false;lastInboxTime=Date.now();}
 }
 if(visitPage){
   window.webrtcVisitorReady=function(t){
     if(!validLocalToken(t))return;
     visitorToken=t;visitorBox.classList.remove("hidden");
     showControls(false);status("");
   };
   window.webrtcVisitorReset=function(){
     terminar(true);visitorToken=null;visitorBox.classList.add("hidden");
   };
 }else{
   setInterval(checkInbox,4000);
   setTimeout(checkInbox,1500);
 }
 function validLocalToken(t){return typeof t==="string"&&/^[0-9a-f-]{36}$/i.test(t);}
 window.addEventListener("pagehide",()=>{if(session)terminar(false);});
})();