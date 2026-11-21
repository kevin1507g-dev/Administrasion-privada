// Demo de Twilio Voice: una llamada iniciada manualmente al celular verificado de Sistema Admin.
// El teclado solo devuelve mensajes de simulación. NUNCA ejecuta acciones de apertura ni llama a residentes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}
});
const xml=(s:string,status=200)=>new Response(s,{
 status,headers:{"Content-Type":"application/xml; charset=utf-8"}
});
const accountSid=()=>Deno.env.get("TWILIO_ACCOUNT_SID")||"";
const authToken=()=>Deno.env.get("TWILIO_AUTH_TOKEN")||"";
const fromNumber=()=>Deno.env.get("TWILIO_VOICE_FROM")||"";
const ready=()=> /^AC[0-9a-f]{32}$/i.test(accountSid())
  && authToken().length>=20 && /^\+[1-9]\d{7,14}$/.test(fromNumber());
const publicVoiceUrl=()=>new URL(
 "/functions/v1/interfon-voice-prueba?modo=menu",
 Deno.env.get("SUPABASE_URL")||"https://invalid.example"
).href;
const say=(message:string)=>'<Say language="es-MX">'+message+'</Say>';

async function validTwilioSignature(req:Request,params:URLSearchParams):Promise<boolean>{
 const incoming=req.headers.get("X-Twilio-Signature")||"";
 if(!incoming||!authToken())return false;
 // Twilio HMAC-SHA1: URL completa y parámetros POST ordenados alfabéticamente.
 const ordered=Array.from(new Set(params.keys())).sort();
 let signedText=publicVoiceUrl();
 for(const key of ordered){signedText+=key+(params.get(key)||"");}
 const hmac=await crypto.subtle.importKey(
  "raw",new TextEncoder().encode(authToken()),{name:"HMAC",hash:"SHA-1"},false,["sign"]
 );
 const mac=new Uint8Array(await crypto.subtle.sign("HMAC",hmac,new TextEncoder().encode(signedText)));
 const expected=btoa(String.fromCharCode(...mac));
 if(expected.length!==incoming.length)return false;
 let diff=0;
 for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^incoming.charCodeAt(i);
 return diff===0;
}

async function digitsDemo(req:Request){
 const contentType=req.headers.get("Content-Type")||"";
 if(!contentType.includes("application/x-www-form-urlencoded"))return xml("<Response><Hangup/></Response>",415);
 const params=new URLSearchParams(await req.text());
 if(!(await validTwilioSignature(req,params)))return xml("<Response><Hangup/></Response>",403);
 const digit=params.get("Digits")||"";
 const response = digit==="1"
  ? "Opción uno recibida. Esta es una prueba de comunicación. Nadie ha respondido en vivo y el portón permanece cerrado."
  : digit==="2"
    ? "Opción dos recibida. Se simuló una autorización de acceso. No se enviaron órdenes al portón ni a ninguna puerta."
    : digit==="3"
      ? "Opción tres recibida. Se simuló el rechazo de acceso. No se realizaron cambios en el sistema."
      : "No se recibió una opción válida. La prueba termina sin modificar los accesos.";
 return xml('<?xml version="1.0" encoding="UTF-8"?><Response>'+say(response)+'<Hangup/></Response>');
}

async function callTwilio(to:string){
 const greeting="Hola. Esta es una llamada de prueba del interfón de Privada Valle de los Beteles. "+
  "No hay ninguna visita solicitando entrada y el portón no se abrirá. "+
  "Marca uno para probar comunicación. Marca dos para simular una autorización sin abrir. "+
  "Marca tres para simular un rechazo.";
 const twiml='<?xml version="1.0" encoding="UTF-8"?><Response>'+
  '<Gather input="dtmf" numDigits="1" timeout="9" actionOnEmptyResult="true" method="POST" action="'+publicVoiceUrl()+'">'+
  say(greeting)+'</Gather>'+say("Prueba terminada sin cambios.")+'<Hangup/></Response>';
 const data=new URLSearchParams({
  To:to,From:fromNumber(),Twiml:twiml,Timeout:"25",TimeLimit:"70"
 });
 const res=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+accountSid()+"/Calls.json",{
  method:"POST",
  headers:{"Authorization":"Basic "+btoa(accountSid()+":"+authToken()),"Content-Type":"application/x-www-form-urlencoded"},
  body:data.toString(),
  signal:AbortSignal.timeout(18000)
 });
 const body=await res.json().catch(()=>({}));
 return {ok:res.ok,code:Number(body?.code)||null,status:String(body?.status||""),sid:String(body?.sid||"")};
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Método no permitido."},405);
 try{
  const url=new URL(req.url);
  if(url.searchParams.get("modo")==="menu")return await digitsDemo(req);
  const auth=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/,"").trim();
  if(!auth||auth.length>8192)return json({error:"Inicia sesión en Administración Residencial."},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!anon||!service)return json({error:"El servicio interno no está disponible."},503);
  const client=createClient(supabaseUrl,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error:sessionError}=await client.auth.getUser(auth);
  if(sessionError||!session?.user)return json({error:"Sesión inválida."},401);
  const internal=createClient(supabaseUrl,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:owner,error:ownerError}=await internal.from("profiles")
   .select("id,rol,activo,estado_registro").eq("id",session.user.id).maybeSingle();
  if(ownerError||!owner||owner.rol!=="owner"||owner.activo!==true||
   owner.estado_registro!=="aprobado")return json({error:"Solo Sistema Admin puede iniciar llamadas de prueba."},403);
  const body=await req.json().catch(()=>({}));
  const accion=String(body?.accion||"");
  if(accion==="estado")return json({
   ok:true,configurado:ready(),falta_origen:!/^\+[1-9]\d{7,14}$/.test(fromNumber()),
   solo_demo:true,puede_abrir_porton:false
  });
  if(accion!=="llamar")return json({error:"Acción no permitida."},400);
  if(body?.confirmacion!==true)return json({error:"Confirma que quieres recibir una llamada de prueba sin aperturas."},400);
  if(!ready())return json({
    error:"Falta configurar un número de origen válido en TWILIO_VOICE_FROM (Secrets de Supabase). No se hizo ninguna llamada.",
    configurado:false
  },503);
  const {data:target,error:targetError}=await internal.rpc("interfon_voice_prueba_preparar",{p_usuario:owner.id});
  if(targetError||!target?.numero){
    return json({error:targetError?.message||"No se pudo preparar tu teléfono verificado."},400);
  }
  // Único destino posible: número verificado y cifrado de Sistema Admin, obtenido en servidor.
  const result=await callTwilio(target.numero);
  if(!result.ok||!/^CA[0-9a-f]{32}$/i.test(result.sid)){
   return json({error:"Twilio no pudo iniciar la llamada. Verifica el número de origen, los permisos de Voice y los límites de la cuenta de prueba.",
     codigo_twilio:result.code},502);
  }
  return json({ok:true,solicitada:true,ultimos4:target.ultimos4,
    mensaje:"Twilio aceptó la solicitud de llamada. Atiende tu celular para escuchar las opciones de prueba.",
    sin_aperturas:true});
 }catch(_){
  return json({error:"No se pudo completar la prueba de llamada."},500);
 }
});
