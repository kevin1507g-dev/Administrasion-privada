// Verificación SMS por Twilio Verify para el teléfono PROPIO de Sistema Admin.
// No contiene credenciales Twilio. No habilita llamadas ni aperturas de puertas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
 "Content-Type":"application/json"
};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const configured=()=>Boolean(
 /^AC[0-9a-f]{32}$/i.test(Deno.env.get("TWILIO_ACCOUNT_SID")||"") &&
 (Deno.env.get("TWILIO_AUTH_TOKEN")||"").length>=20 &&
 /^VA[0-9a-f]{32}$/i.test(Deno.env.get("TWILIO_VERIFY_SERVICE_SID")||"")
);
const twilioUrl=()=> "https://verify.twilio.com/v2/Services/"+encodeURIComponent(Deno.env.get("TWILIO_VERIFY_SERVICE_SID")||"");
async function callTwilio(path:string,values:Record<string,string>){
 const auth=btoa((Deno.env.get("TWILIO_ACCOUNT_SID")||"")+":"+(Deno.env.get("TWILIO_AUTH_TOKEN")||""));
 const response=await fetch(twilioUrl()+path,{
  method:"POST",
  headers:{"Authorization":"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams(values).toString(),
  signal:AbortSignal.timeout(12000)
 });
 const result=await response.json().catch(()=>({}));
 return {ok:response.ok,status:String(result?.status||""),http:response.status};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return respond({error:"Método no permitido."},405);
 try{
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/,"").trim();
  if(!token||token.length>8192)return respond({error:"Inicia sesión nuevamente."},401);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service)return respond({error:"Servicio interno no disponible."},503);
  const userClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userClient.auth.getUser(token);
  if(authError||!authData?.user)return respond({error:"Sesión no válida."},401);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:owner,error:ownerErr}=await admin.from("profiles")
   .select("id,rol,activo,estado_registro")
   .eq("id",authData.user.id).maybeSingle();
  if(ownerErr||!owner||owner.rol!=="owner"||owner.activo!==true||
     owner.estado_registro!=="aprobado")return respond({error:"Solo Sistema Admin puede verificar su propio teléfono."},403);
  const body=await req.json().catch(()=>({}));
  const accion=String(body?.accion||"").trim();
  if(!["estado","enviar","comprobar"].includes(accion))return respond({error:"Acción inválida."},400);
  if(accion==="estado")return respond({ok:true,configurado:configured(),llamadas_habilitadas:false});
  // Nunca enviar SMS ni consultar códigos cuando faltan credenciales de servidor.
  if(!configured())return respond({error:"Falta conectar Twilio Verify en Supabase. Solicita a Sistema Admin configurar las claves privadas en Edge Function Secrets.",configurado:false},503);
  const codigo=String(body?.codigo||"").trim();
  if(accion==="comprobar"&&!/^\d{6}$/.test(codigo))return respond({error:"Escribe los seis dígitos del SMS."},400);
  const {data:target,error:targetError}=await admin.rpc("interfon_verify_preparar",{
    p_usuario:owner.id,p_accion:accion==="enviar"?"enviar":"comprobar"
  });
  if(targetError||!target?.numero||!target?.telefono_id||!target?.huella){
    return respond({error:targetError?.message||"No se pudo consultar tu celular registrado."},400);
  }
  if(accion==="enviar"){
   const result=await callTwilio("/Verifications",{To:target.numero,Channel:"sms"});
   if(!result.ok||result.status!=="pending"){
    return respond({error:"Twilio no pudo enviar el código. Revisa los permisos de tu cuenta, el servicio Verify y el número destinatario."},502);
   }
   return respond({ok:true,enviado:true,ultimos4:String(target.numero).slice(-4),llamadas_habilitadas:false});
  }
  const result=await callTwilio("/VerificationCheck",{To:target.numero,Code:codigo});
  if(!result.ok||result.status!=="approved"){
   return respond({ok:false,verificado:false,error:"Código incorrecto, vencido o no aprobado por Twilio."},400);
  }
  const {data:marcado,error:markErr}=await admin.rpc("interfon_verify_aprobar",{
   p_usuario:owner.id,p_telefono_id:target.telefono_id,p_huella:target.huella
  });
  if(markErr||marcado!==true)return respond({error:"Twilio confirmó el código, pero el teléfono cambió antes de guardar. Actualiza y vuelve a verificar."},409);
  return respond({ok:true,verificado:true,llamadas_habilitadas:false});
 }catch{
  return respond({error:"No fue posible completar la verificación. Intenta de nuevo."},500);
 }
});
