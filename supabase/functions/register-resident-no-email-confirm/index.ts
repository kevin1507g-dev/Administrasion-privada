import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const URL=Deno.env.get("SUPABASE_URL")??"";
let secrets: Record<string,string>={};
try { secrets=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}"); } catch {}
const KEY=secrets.default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const headers={"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:object,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return reply({error:"Metodo no permitido."},405);
  if(!admin)return reply({error:"Servicio temporalmente no disponible."},503);
  const ip=request.headers.get("cf-connecting-ip")??"";
  if(!ip || ip.length>90 || !/^[0-9a-fA-F:.]+$/.test(ip))return reply({error:"No se pudo verificar la solicitud."},403);
  let body;
  try {
    const raw=await request.text();
    if(raw.length>1300)return reply({error:"Datos demasiado extensos."},413);
    body=JSON.parse(raw);
  }catch{return reply({error:"Datos no validos."},400);}
  const nombre=typeof body?.nombre==="string"?body.nombre.trim().replace(/\s+/g," "):"";
  const unidad=typeof body?.unidad==="string"?body.unidad.trim():"";
  const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
  const password=body?.password;
  const casa=/^[0-9]{1,6}$/.test(unidad)?String(Number(unidad)):"";
  if(!nombre||nombre.length>100||!/^(4[0-9]|5[0-9]|6[0-6])$/.test(casa)||
    email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
    typeof password!=="string"||password.length<12||password.length>128) {
    return reply({error:"Revisa el nombre, casa, correo y contraseña."},400);
  }
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("resident-register:v1:"+ip));
  const fingerprint=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
  const {data:allowed,error:limitError}=await admin.rpc("resident_signup_rate_gate",{p_fingerprint:fingerprint});
  if(limitError)return reply({error:"No se pudo procesar el registro. Intenta mas tarde."},503);
  if(!allowed)return reply({error:"Demasiados registros desde esta conexion. Intenta mas tarde."},429);
  // Verificar la existencia real antes de intentar crear un usuario en Auth.
  const {data:house,error:houseError}=await admin.from("casas")
    .select("id").eq("numero",casa).eq("activo",true).maybeSingle();
  if(houseError)return reply({error:"No fue posible verificar la casa. Intenta más tarde."},503);
  if(!house)return reply({error:"La casa indicada no existe o no está activa."},400);

  const {error:createError}=await admin.auth.admin.createUser({
    email, password, email_confirm:true, user_metadata:{nombre,unidad:casa,rol:"residente"}
  });
  if(createError){
    const code=String(createError.code??"");
    const details=String(createError.message??"").toLowerCase();
    if(code==="email_exists"||details.includes("already registered")||details.includes("already exists"))
      return reply({error:"Este correo ya tiene una cuenta. Inicia sesion o contacta a la administracion."},409);
    return reply({error:"No se pudo crear la solicitud. Revisa los datos o contacta a la administracion."},400);
  }
  return reply({ok:true,message:"Solicitud registrada. No necesitas confirmar tu correo. Espera la aprobacion de la administracion."},201);
});