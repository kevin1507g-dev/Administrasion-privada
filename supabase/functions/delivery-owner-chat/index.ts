import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
 "Access-Control-Allow-Origin": "*",
 "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods": "POST, OPTIONS",
 "Content-Type": "application/json",
 "Cache-Control": "no-store",
};
function reply(payload: unknown, code=200): Response {
 return new Response(JSON.stringify(payload), {status:code,headers:cors});
}
const clean=(x: unknown,max:number)=>String(x??"").trim().slice(0,max+1);
const uuid=(x:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x||""));
const companyKey=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("es-MX");
async function sha256(t:string):Promise<string>{
 const bytes=new TextEncoder().encode(t);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
function secretToken():string{
 const b=crypto.getRandomValues(new Uint8Array(32));
 return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function ownerIdentity(admin:any,req:Request):Promise<string|null>{
 const auth=req.headers.get("authorization")||"";
 const token=/^Bearer (\S+)$/i.exec(auth)?.[1];
 if(!token)return null;
 const {data:{user},error}=await admin.auth.getUser(token);
 if(error||!user?.id)return null;
 const {data:profile}=await admin.from("profiles").select("id").eq("id",user.id)
  .eq("rol","owner").eq("activo",true).eq("estado_registro","aprobado").maybeSingle();
 return profile?.id||null;
}
async function notify(admin:any,userId:string,title:string,message:string,reference:string){
 const {error}=await admin.from("notificaciones_push").insert({
  user_id:userId,titulo:title.slice(0,160),mensaje:message.slice(0,900),
  tipo:"portero_chat_owner",referencia:reference.slice(0,350),destino:"ownerPanel",
 });
 if(error)console.warn("No se pudo encolar el aviso de chat especial");
}
Deno.serve(async (req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Método no permitido."},405);
 try{
  if(Number(req.headers.get("content-length")||0)>4096)return reply({error:"Solicitud demasiado larga."},413);
  const url=Deno.env.get("SUPABASE_URL");
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply({error:"Chat temporalmente no disponible."},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"");

  if(action==="start"){
   const casa=clean(body?.casa,20),tipo=clean(body?.tipo,30);
   const empresa=clean(body?.empresa,80),repartidor=clean(body?.repartidor,80);
   const motivo=clean(body?.mensaje,240);
   if(!/^(4[0-9]|5[0-9]|6[0-6])$/.test(casa)||!["comida","paqueteria","farmacia","visita","otro"].includes(tipo)
    ||!empresa||empresa.length>80||!repartidor||repartidor.length>80||!motivo||motivo.length>240){
    return reply({error:"Completa casa, tipo, empresa, nombre y motivo de visita."},400);
   }
   // El catálogo solo determina el DESTINATARIO. Nunca verifica identidad,
   // nunca autoriza aperturas ni crea órdenes para el ESP32.
   const {data:empresas,error:empresaError}=await admin.from("empresas_reparto_autorizadas")
    .select("nombre,hora_inicio,hora_fin").eq("activa",true).limit(500);
   if(empresaError)return reply({error:"No se pudieron consultar las empresas. Intenta más tarde."},503);
   const hhmm=new Intl.DateTimeFormat("en-GB",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
   const autorizada=(empresas||[]).some((e:any)=>
    companyKey(String(e.nombre))===companyKey(empresa) &&
    hhmm>=String(e.hora_inicio||"").slice(0,5) && hhmm<String(e.hora_fin||"").slice(0,5));
   const solicitudToken=String(body?.solicitud_token||"");
   const escalacion=autorizada&&solicitudToken.length>0;
   let entregaId: string|null=null;
   // Normalmente las empresas autorizadas siguen el flujo del residente.
   // Si pasaron 2 minutos SIN respuesta, el token original de esa solicitud
   // permite escalar a Sistema Admin; no concede ninguna orden de apertura.
   if(autorizada&&!escalacion)return reply({ok:true,autorizada:true});
   if(escalacion&&!uuid(solicitudToken))
    return reply({error:"Solicitud de reparto no válida."},400);

   const {data:house,error:houseError}=await admin.from("casas").select("id").eq("numero",casa).eq("activo",true).maybeSingle();
   if(houseError||!house)return reply({error:"Casa no disponible para recibir solicitudes."},400);
   if(escalacion){
    const {data:delivery,error:deliveryError}=await admin.from("entregas_contacto")
     .select("id,casa_id,tipo,empresa,repartidor,mensaje,estado,created_at,expires_at,portero_modo_mixto")
     .eq("public_token",solicitudToken).maybeSingle();
    if(deliveryError)return reply({error:"No se pudo verificar la solicitud pendiente."},503);
    const valid=delivery&&delivery.casa_id===house.id&&delivery.tipo===tipo&&
     companyKey(String(delivery.empresa||""))===companyKey(empresa)&&
     companyKey(String(delivery.repartidor||""))===companyKey(repartidor)&&
     String(delivery.mensaje||"").trim()===motivo&&
     delivery.estado==="esperando"&&delivery.portero_modo_mixto===true&&
     Date.now()>=new Date(delivery.created_at).getTime()+120000&&
     Date.now()<new Date(delivery.expires_at).getTime();
    if(!valid)return reply({error:"Este chat requiere una solicitud vigente y 2 minutos sin respuesta del residente."},403);
    entregaId=delivery.id;
    // La tarea automática puede haber abierto este chat aunque el repartidor
    // haya dejado de consultar la página. Reutilizarlo, nunca duplicarlo.
    const {data:exists,error:existingError}=await admin.from("portero_owner_chats")
     .select("id,expires_at,estado").eq("entrega_id",entregaId).maybeSingle();
    if(existingError)return reply({error:"No se pudo recuperar el chat de esta entrega."},503);
    if(exists){
     if(exists.estado!=="abierto"||new Date(exists.expires_at).getTime()<=Date.now())
      return reply({error:"La conversación de esta entrega ya terminó."},410);
     return reply({ok:true,autorizada:false,escalado:true,chat_token:solicitudToken,expires_at:exists.expires_at});
    }
   }
   const {data:owners,error:ownerError}=await admin.from("profiles")
    .select("id").eq("rol","owner").eq("activo",true).eq("estado_registro","aprobado")
    .order("created_at",{ascending:true}).limit(1);
   if(ownerError||!owners?.length)return reply({error:"Sistema Admin no está disponible para recibir el chat."},503);

   const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||
     (req.headers.get("x-forwarded-for")||"").split(",")[0]||"unknown").trim();
   const ua=(req.headers.get("user-agent")||"unknown").slice(0,240);
   const rateKey=await sha256(ip+"|"+ua);
   const since=new Date(Date.now()-10*60*1000).toISOString();
   const {count,error:rateError}=await admin.from("portero_owner_chats")
     .select("id",{count:"exact",head:true}).eq("rate_key",rateKey).gte("created_at",since);
   if(rateError)return reply({error:"Servicio de chat no disponible."},503);
   if(!escalacion&&(count||0)>=3)return reply({error:"Demasiados chats recientes. Espera unos minutos."},429);

   const token=escalacion?solicitudToken:secretToken();
   const hash=await sha256(token);
   const {data:chat,error:chatError}=await admin.from("portero_owner_chats").insert({
    owner_id:owners[0].id,token_hash:hash,casa_numero:casa,empresa,repartidor,tipo,motivo,rate_key:rateKey,
    ...(entregaId?{entrega_id:entregaId}:{})
   }).select("id,expires_at").single();
   if(chatError||!chat){
    if(escalacion&&entregaId){
     const {data:created}=await admin.from("portero_owner_chats")
       .select("id,estado,expires_at").eq("entrega_id",entregaId).maybeSingle();
     if(created&&created.estado==="abierto"&&new Date(created.expires_at).getTime()>Date.now())
      return reply({ok:true,autorizada:false,escalado:true,chat_token:solicitudToken,expires_at:created.expires_at});
    }
    return reply({error:"No se pudo crear el chat especial."},503);
   }
   const {error:messageError}=await admin.from("portero_owner_chat_mensajes").insert({
    chat_id:chat.id,autor:escalacion?"sistema":"repartidor",
    mensaje:escalacion?"El residente no respondió después de 2 minutos. Sistema Admin puede atender la entrega; no se ha autorizado la apertura del portón.":motivo
   });
   if(messageError)return reply({error:"No se pudo iniciar la conversación."},503);
   await notify(admin,owners[0].id,
    escalacion?"💬 Repartidor sin respuesta: atención de Sistema Admin":"💬 Chat especial: empresa no autorizada",
    "Casa "+casa+" · "+empresa+" · "+repartidor+
      (escalacion?". El residente no respondió en 2 minutos.":". Solicita atención de Sistema Admin."),
    "portero_chat:"+chat.id+":"+owners[0].id);
   return reply({ok:true,autorizada:false,escalado:escalacion,chat_token:token,expires_at:chat.expires_at});
  }

  if(["poll","send","report_exit"].includes(action)){
   const token=String(body?.token||"");
   if(!/^[0-9a-f]{64}$/.test(token)&&!uuid(token))return reply({error:"Conversación no encontrada."},404);
   const hash=await sha256(token);
   const {data:chat}=await admin.from("portero_owner_chats")
    .select("id,owner_id,estado,expires_at,autorizado_at,salida_reportada_at").eq("token_hash",hash).maybeSingle();
   if(!chat)return reply({error:"Conversación no encontrada."},404);
   const active=chat.estado==="abierto"&&new Date(chat.expires_at).getTime()>Date.now();
   if(action==="report_exit"){
    if(!chat.autorizado_at)return reply({error:"Esta entrega aún no tiene autorización de entrada."},403);
    if(chat.salida_reportada_at)return reply({ok:true,registrado:true,salida_at:chat.salida_reportada_at});
    const elapsed=Date.now()-new Date(chat.autorizado_at).getTime();
    if(elapsed<0||elapsed>=7*60*1000)return reply({error:"Terminó el plazo de 7 minutos para confirmar la salida."},410);
    const {data:updated,error:exitError}=await admin.from("portero_owner_chats")
     .update({salida_reportada_at:new Date().toISOString(),updated_at:new Date().toISOString()})
     .eq("id",chat.id).is("salida_reportada_at",null)
     .gte("autorizado_at",new Date(Date.now()-7*60*1000).toISOString())
     .lte("autorizado_at",new Date().toISOString())
     .select("salida_reportada_at").maybeSingle();
    if(exitError)return reply({error:"No se pudo registrar la salida."},503);
    if(!updated)return reply({error:"El plazo de confirmación terminó o ya fue registrado."},409);
    await admin.from("portero_owner_chat_mensajes").insert({
     chat_id:chat.id,autor:"sistema",
     mensaje:"El repartidor declaró que ya está fuera de la privada. Esta declaración no confirma su ubicación ni cierra el portón."
    });
    return reply({ok:true,registrado:true,salida_at:updated.salida_reportada_at});
   }
   if(action==="send"){
    if(!active)return reply({error:"El chat ha terminado. Solicita una nueva atención."},410);
    const mensaje=clean(body?.mensaje,600);
    if(!mensaje||mensaje.length>600)return reply({error:"Escribe un mensaje de hasta 600 caracteres."},400);
    const since=new Date(Date.now()-60*60*1000).toISOString();
    const {count}=await admin.from("portero_owner_chat_mensajes").select("id",{count:"exact",head:true})
     .eq("chat_id",chat.id).eq("autor","repartidor").gte("created_at",since);
    if((count||0)>=12)return reply({error:"Se alcanzó el límite de mensajes de esta conversación."},429);
    const {data:last}=await admin.from("portero_owner_chat_mensajes").select("created_at")
      .eq("chat_id",chat.id).eq("autor","repartidor").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(last&&Date.now()-new Date(last.created_at).getTime()<2500)return reply({error:"Espera unos segundos para enviar otro mensaje."},429);
    const {data:msg,error:msgError}=await admin.from("portero_owner_chat_mensajes")
     .insert({chat_id:chat.id,autor:"repartidor",mensaje}).select("id").single();
    if(msgError||!msg)return reply({error:"No se pudo enviar el mensaje."},503);
    const now=new Date().toISOString();
    await admin.from("portero_owner_chats").update({last_visitor_at:now,updated_at:now}).eq("id",chat.id);
    await notify(admin,chat.owner_id,"💬 Nuevo mensaje del repartidor",
      "Tienes un mensaje pendiente en el chat especial de repartidores.",
      "portero_chat_msg:"+chat.id+":"+msg.id+":"+chat.owner_id);
   }
   const {data:messages,error:msgListError}=await admin.from("portero_owner_chat_mensajes")
    .select("id,autor,mensaje,created_at").eq("chat_id",chat.id)
    .order("created_at",{ascending:true}).order("id",{ascending:true}).limit(80);
   if(msgListError)return reply({error:"No se pudieron leer los mensajes."},503);
   return reply({ok:true,estado:active?"abierto":"cerrado",expires_at:chat.expires_at,autorizado_at:chat.autorizado_at,salida_reportada_at:chat.salida_reportada_at,messages:messages||[]});
  }

  if(["owner_list","owner_read","owner_reply","owner_close"].includes(action)){
   const ownerId=await ownerIdentity(admin,req);
   if(!ownerId)return reply({error:"Acceso exclusivo de Sistema Admin."},403);
   if(action==="owner_list"){
    const after=new Date(Date.now()-24*60*60*1000).toISOString();
    const {data,error}=await admin.from("portero_owner_chats")
     .select("id,entrega_id,casa_numero,empresa,repartidor,tipo,motivo,estado,created_at,expires_at,updated_at,last_visitor_at,last_owner_read_at,autorizado_at,salida_reportada_at")
     .eq("owner_id",ownerId).gte("created_at",after)
     .order("updated_at",{ascending:false}).limit(50);
    if(error)return reply({error:"No se pudieron obtener tus conversaciones."},503);
    return reply({ok:true,items:data||[]});
   }
   if(!uuid(body?.chat_id))return reply({error:"Conversación no válida."},400);
   const {data:chat}=await admin.from("portero_owner_chats")
    .select("id,owner_id,estado,expires_at,autorizado_at,salida_reportada_at").eq("id",body.chat_id).eq("owner_id",ownerId).maybeSingle();
   if(!chat)return reply({error:"Conversación no encontrada."},404);
   if(action==="owner_reply"){
    if(chat.estado!=="abierto"||new Date(chat.expires_at).getTime()<=Date.now())
     return reply({error:"Esta conversación ya terminó."},410);
    const mensaje=clean(body?.mensaje,600);
    if(!mensaje||mensaje.length>600)return reply({error:"Escribe un mensaje de hasta 600 caracteres."},400);
    const {error}=await admin.from("portero_owner_chat_mensajes")
     .insert({chat_id:chat.id,autor:"owner",mensaje});
    if(error)return reply({error:"No se pudo enviar tu respuesta."},503);
    await admin.from("portero_owner_chats").update({updated_at:new Date().toISOString()}).eq("id",chat.id);
   }
   if(action==="owner_close"){
    await admin.from("portero_owner_chats").update({estado:"cerrado",updated_at:new Date().toISOString()}).eq("id",chat.id);
    return reply({ok:true});
   }
   const {data:messages,error}=await admin.from("portero_owner_chat_mensajes")
    .select("id,autor,mensaje,created_at").eq("chat_id",chat.id)
    .order("created_at",{ascending:true}).order("id",{ascending:true}).limit(80);
   if(error)return reply({error:"No se pudo leer el chat."},503);
   await admin.from("portero_owner_chats").update({last_owner_read_at:new Date().toISOString()}).eq("id",chat.id);
   return reply({ok:true,messages:messages||[],estado:chat.estado,expires_at:chat.expires_at,autorizado_at:chat.autorizado_at,salida_reportada_at:chat.salida_reportada_at});
  }
  return reply({error:"Acción desconocida."},400);
 }catch{
  return reply({error:"No se pudo procesar el chat en este momento."},500);
 }
});