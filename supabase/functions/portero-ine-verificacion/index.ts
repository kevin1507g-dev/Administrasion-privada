import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const headers = {
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Content-Type":"application/json",
 "Cache-Control":"no-store",
};
function respond(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers});}
const clean=(x:unknown,n:number)=>String(x??"").trim().slice(0,n+1);
const norm=(s:string)=>s.normalize("NFKC").toLocaleLowerCase("es-MX").replace(/\s+/g," ").trim();
const sha=async(s:string)=>{
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
 return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
};
const secret=()=>{
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
};
const validHttps=(s:string)=>{
 try{const u=new URL(s);return u.protocol==="https:"&&Boolean(u.hostname)&&!u.username&&!u.password;}catch{return false;}
};
const enabled=()=>{
 const api=Deno.env.get("VERIFF_API_BASE_URL")||"";
 const key=Deno.env.get("VERIFF_API_KEY")||"";
 const shared=Deno.env.get("VERIFF_SHARED_SECRET")||"";
 const notice=Deno.env.get("PORTERO_AVISO_PRIVACIDAD_URL")||"";
 return Deno.env.get("PORTERO_VERIFICACION_INE_ACTIVA")==="true"&&
  validHttps(api)&&validHttps(notice)&&Boolean(key)&&Boolean(shared);
};
const client=()=>{
 const u=Deno.env.get("SUPABASE_URL"),k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!u||!k)throw Error("backend");
 return createClient(u,k,{auth:{persistSession:false,autoRefreshToken:false}});
};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return respond({error:"Método no permitido."},405);
 if(Number(req.headers.get("content-length")||0)>1500)return respond({error:"Datos demasiado extensos."},413);
 try{
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"");
  if(action==="capabilities"){
   const active=enabled();
   return respond({ok:true,enabled:active,provider:active?"veriff":null,
    notice_url:active?Deno.env.get("PORTERO_AVISO_PRIVACIDAD_URL"):null});
  }
  // Prohibido aceptar documentos, fotos, CURP, datos biométricos o resultados
  // declarados por el navegador: solo el proveedor captura y firma su decisión.
  if(!enabled())return respond({error:"El servicio de verificación de INE todavía no está configurado. Puedes continuar con la solicitud habitual."},503);
  const db=client();
  if(action==="status"){
   const token=String(body?.token||"");
   const casa=clean(body?.casa,20),empresa=clean(body?.empresa,80);
   if(!/^[a-f0-9]{64}$/.test(token))return respond({error:"Referencia de verificación inválida."},400);
   const {data,error}=await db.from("portero_identidad_verificaciones")
    .select("estado,vence_at,casa_numero,empresa,verificada_at")
    .eq("consulta_hash",await sha(token)).maybeSingle();
   if(error)return respond({error:"No se pudo consultar el estado."},503);
   if(!data||data.casa_numero!==casa||norm(data.empresa)!==norm(empresa))
    return respond({error:"No existe verificación para esa casa y plataforma."},404);
   const vigente=new Date(data.vence_at).getTime()>Date.now();
   return respond({ok:true,estado:vigente?data.estado:"vencida",
    verificada:vigente&&data.estado==="aprobada"&&!!data.verificada_at,
    expires_at:data.vence_at});
  }
  if(action!=="start")return respond({error:"Acción desconocida."},400);
  const casa=clean(body?.casa,20),empresa=clean(body?.empresa,80);
  if(!/^(4[0-9]|5[0-9]|6[0-6])$/.test(casa)||!empresa||empresa.length>80)
   return respond({error:"Selecciona una casa válida y escribe la plataforma."},400);
  if(body?.consent!==true)return respond({error:"Debes aceptar expresamente el aviso de privacidad y la verificación biométrica de INE."},400);
  const {data:home,error:houseError}=await db.from("casas").select("id")
    .eq("numero",casa).eq("activo",true).maybeSingle();
  if(houseError||!home)return respond({error:"Casa no disponible."},400);
  const {data:companies,error:companyError}=await db.from("empresas_reparto_autorizadas")
    .select("nombre,hora_inicio,hora_fin").eq("activa",true).limit(100);
  if(companyError)return respond({error:"No fue posible consultar plataformas."},503);
  const time=new Intl.DateTimeFormat("en-GB",{
   timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).format(new Date());
  const authorized=(companies||[]).some((e:any)=>norm(e.nombre)===norm(empresa)&&
    time>=String(e.hora_inicio||"").slice(0,5)&&
    time<String(e.hora_fin||"").slice(0,5));
  if(!authorized)return respond({error:"La empresa no está en el horario autorizado. Usa el chat de Sistema Admin."},403);
  const ip=req.headers.get("cf-connecting-ip")||
   (req.headers.get("x-forwarded-for")||"").split(",")[0]||"no-ip";
  const rateHash=await sha(ip+"|"+(req.headers.get("user-agent")||"").slice(0,180));
  const since=new Date(Date.now()-10*60*1000).toISOString();
  const {count,error:countError}=await db.from("portero_identidad_verificaciones")
   .select("id",{count:"exact",head:true}).eq("limite_hash",rateHash).gte("creado_at",since);
  if(countError)return respond({error:"No se pudo iniciar la verificación."},503);
  if((count||0)>=4)return respond({error:"Demasiados intentos recientes. Espera unos minutos."},429);
  const token=secret();
  const now=new Date().toISOString();
  const {data:row,error:insertError}=await db.from("portero_identidad_verificaciones")
   .insert({casa_numero:casa,empresa,consulta_hash:await sha(token),
    consentimiento_at:now,limite_hash:rateHash})
   .select("id,vence_at").single();
  if(insertError||!row)return respond({error:"No se pudo preparar la verificación."},503);
  const base=(Deno.env.get("VERIFF_API_BASE_URL")||"").replace(/\/$/,"");
  const callback=Deno.env.get("PORTERO_VERIFF_RETORNO_URL")||"";
  const verification:any={
   vendorData:row.id,
   consents:[{type:"ine",approved:true}],
  };
  if(validHttps(callback))verification.callback=callback;
  // Las credenciales nunca salen al QR; Veriff captura documento y selfie.
  let sessionId:string|undefined,sessionUrl:string|undefined;
  try{
   const response=await fetch(base+"/v1/sessions",{
    method:"POST",
    headers:{"X-AUTH-CLIENT":Deno.env.get("VERIFF_API_KEY")||"",
     "Content-Type":"application/json"},
    body:JSON.stringify({verification}),
    signal:AbortSignal.timeout(11000)
   });
   if(!response.ok)throw Error("provider");
   const payload=await response.json();
   sessionId=payload?.verification?.id;
   sessionUrl=payload?.verification?.url;
   if(!/^[a-f0-9-]{36}$/i.test(String(sessionId))||!validHttps(String(sessionUrl)))throw Error("provider");
  }catch{
   await db.from("portero_identidad_verificaciones").update({estado:"rechazada"})
     .eq("id",row.id).eq("estado","pendiente");
   return respond({error:"No se pudo conectar con el verificador de INE. Intenta más tarde."},503);
  }
  const {error:updated}=await db.from("portero_identidad_verificaciones")
   .update({sesion_proveedor:sessionId}).eq("id",row.id).eq("estado","pendiente");
  if(updated)return respond({error:"No se pudo completar la sesión de verificación."},503);
  return respond({ok:true,provider:"veriff",token,url:sessionUrl,expires_at:row.vence_at});
 }catch{
  return respond({error:"Servicio de verificación temporalmente no disponible."},500);
 }
});
