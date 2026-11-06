import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2";

const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Cache-Control":"no-store",
 "Content-Type":"application/json",
};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const enabled=()=>Deno.env.get("PORTERO_FOTO_EVIDENCIA_ACTIVA")==="true" &&
 /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(Deno.env.get("PORTERO_AVISO_PRIVACIDAD_URL")||"");
const sha256=async(value:string)=>{
 const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return Array.from(new Uint8Array(h)).map(v=>v.toString(16).padStart(2,"0")).join("");
};
const mimeFromBytes=(bytes:Uint8Array):string|null=>{
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return "image/png";
 if(bytes.length>=12&&new TextDecoder().decode(bytes.subarray(0,4))==="RIFF"&&
    new TextDecoder().decode(bytes.subarray(8,12))==="WEBP")return "image/webp";
 return null;
};
const service=()=>{
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)throw Error("Configuración incompleta.");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
};
async function ownerIdentity(db:any,req:Request):Promise<string|null>{
 const token=/^Bearer (\S+)$/i.exec(req.headers.get("authorization")||"")?.[1];
 if(!token)return null;
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user?.id)return null;
 const {data:profile}=await db.from("profiles").select("id").eq("id",user.id)
  .eq("rol","owner").eq("activo",true).eq("estado_registro","aprobado").maybeSingle();
 return profile?.id||null;
}
async function sourceForToken(db:any,origin:string,token:string){
 if(origin==="entrega"&&uuid(token)){
  const {data:d,error}=await db.from("entregas_contacto")
   .select("id,casa_id,estado,expires_at").eq("public_token",token).maybeSingle();
  if(error||!d||!["esperando","respondido"].includes(d.estado)||
    new Date(d.expires_at).getTime()<=Date.now())return null;
  const {data:casa}=await db.from("casas").select("numero").eq("id",d.casa_id).eq("activo",true).maybeSingle();
  if(!casa||!/^(4[0-9]|5[0-9]|6[0-6])$/.test(casa.numero))return null;
  return {origen:"entrega",entrega_id:d.id,chat_id:null,casa_numero:casa.numero};
 }
 if(origin==="chat"&&/^[a-f0-9]{64}$/.test(token)){
  const {data:chat,error}=await db.from("portero_owner_chats")
   .select("id,casa_numero,estado,expires_at").eq("token_hash",await sha256(token)).maybeSingle();
  if(error||!chat||chat.estado!=="abierto"||new Date(chat.expires_at).getTime()<=Date.now())
   return null;
  return {origen:"chat",entrega_id:null,chat_id:chat.id,casa_numero:chat.casa_numero};
 }
 return null;
}
// No recolectamos datos de la credencial; solo una foto voluntaria con fin de
// registro de visitas. No identifica personas ni autoriza comandos físicos.
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return out({error:"Método no permitido."},405);
 if(Number(req.headers.get("content-length")||0)>3600000)return out({error:"Imagen demasiado grande."},413);
 const kind=req.headers.get("content-type")||"";
 try{
  if(kind.includes("application/json")){
   const body=await req.json().catch(()=>({}));
   const action=String(body?.action||"");
   if(action==="capabilities")return out({
    ok:true,enabled:enabled(),max_bytes:3145728,retencion_dias:7,
    notice_url:enabled()?Deno.env.get("PORTERO_AVISO_PRIVACIDAD_URL"):null,
    nota:"No se comprueba identidad ni autenticidad de credenciales. No concede apertura."
   });
   if(!enabled())return out({error:"La captura de fotos no está disponible hasta completar el aviso de privacidad."},503);
   if(!["list","view","delete"].includes(action))return out({error:"Acción no admitida."},400);
   const db=service();
   if(!await ownerIdentity(db,req))return out({error:"Solo Sistema Admin puede consultar las evidencias."},403);
   if(action==="list"){
    const {data,error}=await db.from("portero_fotos_evidencia")
     .select("id,origen,casa_numero,tipo,creado_at,vence_at,entrega_id,chat_id")
     .gt("vence_at",new Date().toISOString())
     .order("creado_at",{ascending:false}).limit(50);
    if(error)return out({error:"No se pudieron consultar las evidencias."},503);
    return out({ok:true,items:data||[]});
   }
   if(!uuid(body?.id))return out({error:"Registro inválido."},400);
   const {data:row,error}=await db.from("portero_fotos_evidencia")
    .select("id,ruta,vence_at").eq("id",body.id).maybeSingle();
   if(error||!row||new Date(row.vence_at).getTime()<=Date.now())
    return out({error:"Evidencia no disponible o vencida."},404);
   if(action==="view"){
    const {data,error:signError}=await db.storage.from("portero-evidencia").createSignedUrl(row.ruta,60);
    if(signError||!data?.signedUrl)return out({error:"No se pudo abrir la foto."},503);
    return out({ok:true,url:data.signedUrl,expires_in_seconds:60});
   }
   const {error:removeError}=await db.storage.from("portero-evidencia").remove([row.ruta]);
   if(removeError)return out({error:"No se pudo borrar la foto."},503);
   const {error:deleteError}=await db.from("portero_fotos_evidencia").delete().eq("id",row.id);
   if(deleteError)return out({error:"Foto borrada, pero quedó pendiente limpiar su registro."},503);
   return out({ok:true,deleted:true});
  }
  if(!kind.includes("multipart/form-data"))return out({error:"Formato de solicitud no admitido."},415);
  if(!enabled())return out({error:"No está habilitada la captura de evidencias. No envíes fotos personales."},503);
  const form=await req.formData();
  const origin=String(form.get("origen")||""),token=String(form.get("token")||"");
  const type=String(form.get("tipo")||""),consent=form.get("consentimiento")==="si";
  if(!["entrega","chat"].includes(origin)||!["ine","rostro"].includes(type)||!consent)
   return out({error:"Debes seleccionar el tipo de foto y aceptar el aviso de privacidad."},400);
  const file=form.get("foto");
  if(!(file instanceof File)||file.size<1024||file.size>3145728)
   return out({error:"La imagen debe ocupar entre 1 KB y 3 MB."},400);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const mime=mimeFromBytes(bytes);
  if(!mime||mime!==file.type)return out({error:"Solo se admiten fotos JPG, PNG o WebP válidas."},415);
  const db=service(),source=await sourceForToken(db,origin,token);
  if(!source)return out({error:"Necesitas una solicitud o conversación vigente para adjuntar la fotografía."},403);
  const col=origin==="entrega"?"entrega_id":"chat_id";
  const identifier=origin==="entrega"?source.entrega_id:source.chat_id;
  const {data:existing}=await db.from("portero_fotos_evidencia")
   .select("id").eq(col,identifier).maybeSingle();
  if(existing)return out({ok:true,registrada:true,ya_existia:true});
  const id=crypto.randomUUID();
  const ext=mime==="image/jpeg"?"jpg":mime==="image/png"?"png":"webp";
  const filepath=origin+"/"+id+"."+ext;
  const {error:storageError}=await db.storage.from("portero-evidencia")
   .upload(filepath,bytes,{contentType:mime,cacheControl:"no-store",upsert:false});
  if(storageError)return out({error:"No se pudo guardar la foto privada."},503);
  const {error:saveError}=await db.from("portero_fotos_evidencia")
   .insert({...source,id,tipo:type,ruta:filepath,mime,bytes:bytes.length,
    consentimiento_at:new Date().toISOString()});
  if(saveError){
   await db.storage.from("portero-evidencia").remove([filepath]);
   return out({error:"No se pudo asociar la foto con la solicitud."},503);
  }
  return out({ok:true,registrada:true,retencion_dias:7,
   nota:"Imagen guardada como evidencia. No equivale a identidad verificada ni apertura autorizada."});
 }catch(_){
  return out({error:"No fue posible procesar la evidencia de manera segura."},500);
 }
});
