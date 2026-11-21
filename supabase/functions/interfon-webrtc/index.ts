// Interfón WebRTC de solo audio. No llama a números telefónicos ni controla puertas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
 "Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store",
};
const answer=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const validId=(s:unknown)=>typeof s==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const now=()=>new Date().toISOString();
const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const publicKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const authClient=createClient(supabaseUrl,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
type Row={id:string;entrega_id:string;casa_id:string;estado:string;atendida_por:string|null;vence_at:string};
type Participant={rol:"visitante"|"residente";id?:string};
const fail=(message:string,status=400)=>answer({ok:false,error:message},status);

async function resident(req:Request){
 const header=req.headers.get("authorization")||"";
 const bearer=header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()||"";
 if(!bearer||bearer.length>8192)return null;
 const {data:{user},error}=await authClient.auth.getUser(bearer);
 if(error||!user)return null;
 const {data:profile}=await db.from("profiles").select("id,casa_id,rol,activo,estado_registro")
   .eq("id",user.id).maybeSingle();
 if(!profile||profile.rol!=="residente"||profile.activo!==true||
    profile.estado_registro!=="aprobado"||!profile.casa_id)return null;
 return {id:user.id,casa_id:profile.casa_id};
}
async function serviceOn(){
 const {data,error}=await db.rpc("portero_servicio_estado");
 return !error && data?.activo===true;
}
async function cleanup(){
 const {data,error}=await db.from("interfon_webrtc_calls")
  .update({estado:"vencida",actualizado_at:now()})
  .in("estado",["sonando","conectando"]).lt("vence_at",now()).select("id");
 if(error)throw error;
 const ids=(data||[]).map((row:{id:string})=>row.id);
 if(ids.length)await db.from("interfon_webrtc_signals").delete().in("llamada_id",ids);
}
async function getCall(id:unknown):Promise<Row|null>{
 if(!validId(id))return null;
 const {data,error}=await db.from("interfon_webrtc_calls")
  .select("id,entrega_id,casa_id,estado,atendida_por,vence_at").eq("id",id).maybeSingle();
 if(error)throw error;
 return data;
}
async function participant(req:Request,body:any,call:Row):Promise<Participant|null>{
 if(validId(body?.token)){
  const {data}=await db.from("entregas_contacto").select("id")
    .eq("id",call.entrega_id).eq("public_token",body.token).maybeSingle();
  if(data)return {rol:"visitante"};
  return null;
 }
 const user=await resident(req);
 if(user&&user.casa_id===call.casa_id)return {rol:"residente",id:user.id};
 return null;
}
async function purge(id:string){
 await db.from("interfon_webrtc_signals").delete().eq("llamada_id",id);
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return fail("Método no permitido.",405);
 if(!supabaseUrl||!serviceKey||!publicKey)return fail("Servicio no disponible.",503);
 let body:any;
 try{body=await req.json();}catch{return fail("Solicitud inválida.");}
 const action=String(body?.accion||"");
 try{
  if(!["inbox","iniciar","aceptar","rechazar","estado","senal","finalizar"].includes(action))
   return fail("Acción no permitida.");
  await cleanup();
  if(!(await serviceOn()))return fail("Portero Virtual fuera de servicio.",503);
  if(action==="inbox"){
   const usuario=await resident(req);
   if(!usuario)return fail("Solo residentes aprobados pueden recibir llamadas.",403);
   const {data,error}=await db.from("interfon_webrtc_calls")
     .select("id,entrega_id,estado,vence_at")
     .eq("casa_id",usuario.casa_id).in("estado",["sonando","conectando"])
     .gt("vence_at",now()).order("creado_at",{ascending:false}).limit(3);
   if(error)throw error;
   const ids=(data||[]).map((r:{entrega_id:string})=>r.entrega_id);
   let entregas:any[]=[];
   if(ids.length){
     const result=await db.from("entregas_contacto")
      .select("id,tipo,repartidor,empresa,estado").in("id",ids);
     if(result.error)throw result.error;
     entregas=result.data||[];
   }
   return answer({ok:true,llamadas:(data||[]).map((r:any)=>{
     const entrega=entregas.find((e:any)=>e.id===r.entrega_id);
     return {id:r.id,estado:r.estado,vence_at:r.vence_at,
       tipo:entrega?.tipo||"visita",nombre:entrega?.repartidor||"Visitante",
       empresa:entrega?.empresa||""};
   })});
  }
  if(action==="iniciar"){
   if(!validId(body?.token))return fail("Solicitud de visita inválida.",403);
   const {data:entrega,error:deliveryError}=await db.from("entregas_contacto")
     .select("id,casa_id,estado,expires_at")
     .eq("public_token",body.token).maybeSingle();
   if(deliveryError)throw deliveryError;
   if(!entrega||entrega.estado!=="esperando"||Date.parse(entrega.expires_at)<=Date.now())
     return fail("La solicitud de visita no está activa.",409);
   const {data:contacto}=await db.from("profiles").select("id").eq("casa_id",entrega.casa_id)
      .eq("rol","residente").eq("activo",true).eq("estado_registro","aprobado").limit(1);
   if(!contacto?.length)return fail("No hay un residente disponible para este servicio.",409);
   const {data:existing}=await db.from("interfon_webrtc_calls")
     .select("id,estado,vence_at").eq("entrega_id",entrega.id).maybeSingle();
   if(existing){
     if(!["sonando","conectando"].includes(existing.estado))return fail("La llamada de esta solicitud ya finalizó.",409);
     return answer({ok:true,id:existing.id,estado:existing.estado,vence_at:existing.vence_at});
   }
   const vence_at=new Date(Math.min(Date.parse(entrega.expires_at),Date.now()+180000)).toISOString();
   const {data:newCall,error}=await db.from("interfon_webrtc_calls")
     .insert({entrega_id:entrega.id,casa_id:entrega.casa_id,vence_at})
     .select("id,estado,vence_at").single();
   if(error)return fail("Ya hay una llamada activa para esta casa o solicitud.",409);
   return answer({ok:true,id:newCall.id,estado:newCall.estado,vence_at:newCall.vence_at});
  }
  const call=await getCall(body?.id);
  if(!call)return fail("No se encontró la llamada.",404);
  const who=await participant(req,body,call);
  if(!who)return fail("No tienes permiso para esta llamada.",403);
  if(Date.parse(call.vence_at)<=Date.now())return fail("La llamada venció.",410);

  if(action==="aceptar"||action==="rechazar"){
   if(who.rol!=="residente")return fail("Solo el residente puede responder.",403);
   if(call.estado!=="sonando")return fail("La llamada ya fue atendida o finalizó.",409);
   const estado=action==="aceptar"?"conectando":"rechazada";
   const {data,error}=await db.from("interfon_webrtc_calls")
    .update({estado,atendida_por:who.id,actualizado_at:now()})
    .eq("id",call.id).eq("estado","sonando").gt("vence_at",now()).select("id").maybeSingle();
   if(error||!data)return fail("Esta llamada ya no puede atenderse.",409);
   if(estado==="rechazada")await purge(call.id);
   return answer({ok:true,estado});
  }
  if(action==="finalizar"){
   if(["sonando","conectando"].includes(call.estado)){
     const {error}=await db.from("interfon_webrtc_calls")
       .update({estado:"finalizada",actualizado_at:now()}).eq("id",call.id)
       .in("estado",["sonando","conectando"]);
     if(error)throw error;
     await purge(call.id);
   }
   return answer({ok:true,estado:"finalizada"});
  }
  if(action==="senal"){
   if(call.estado!=="conectando")return fail("La llamada aún no fue aceptada.",409);
   const tipo=String(body?.tipo||"");
   if(!["offer","answer","ice"].includes(tipo))return fail("Señal inválida.");
   if((tipo==="offer"&&who.rol!=="visitante")||(tipo==="answer"&&who.rol!=="residente"))
     return fail("Emisor no autorizado.",403);
   const payload=body?.contenido;
   if(!payload||typeof payload!=="object"||Array.isArray(payload))return fail("Señal inválida.");
   const bytes=new TextEncoder().encode(JSON.stringify(payload)).length;
   if(bytes>16000)return fail("Señal demasiado grande.",413);
   const {count,error:countError}=await db.from("interfon_webrtc_signals")
      .select("id",{head:true,count:"exact"}).eq("llamada_id",call.id).eq("emisor",who.rol);
   if(countError)throw countError;
   if((count||0)>=90)return fail("Límite de señalización excedido.",429);
   const {error}=await db.from("interfon_webrtc_signals").insert({
     llamada_id:call.id,emisor:who.rol,tipo,contenido:payload,
   });
   if(error)throw error;
   return answer({ok:true});
  }
  if(action==="estado"){
   const cursor=Number.isSafeInteger(body?.cursor)&&body.cursor>=0?body.cursor:0;
   let senales:any[]=[];
   if(call.estado==="conectando"){
    const {data,error}=await db.from("interfon_webrtc_signals")
       .select("id,emisor,tipo,contenido").eq("llamada_id",call.id)
       .neq("emisor",who.rol).gt("id",cursor).order("id",{ascending:true}).limit(70);
    if(error)throw error;
    senales=data||[];
   }
   return answer({ok:true,estado:call.estado,vence_at:call.vence_at,senales});
  }
  return fail("Acción desconocida.");
 }catch(_error){
  return fail("No fue posible completar la operación de voz.",500);
 }
});