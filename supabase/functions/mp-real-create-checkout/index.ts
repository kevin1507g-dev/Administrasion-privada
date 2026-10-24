
const origin="https://kevin1507g-dev.github.io";
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const answer=(code:number,x:object)=>new Response(JSON.stringify(x),{status:code,headers});
function keys(){const a=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}"),b=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return{url:Deno.env.get("SUPABASE_URL")||"",pub:a.default||Deno.env.get("SUPABASE_ANON_KEY")||"",secret:b.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}}
function adminHeaders(key:string){return key.startsWith("sb_secret_")?{"apikey":key,"Content-Type":"application/json"}:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json"}}
async function rpc(url:string,key:string,name:string,params:object){const r=await fetch(url+"/rest/v1/rpc/"+name,{method:"POST",headers:adminHeaders(key),body:JSON.stringify(params)});if(!r.ok)throw Error("Falló la operación protegida de la base de datos");return await r.json();}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return answer(405,{error:"Método no permitido"});
 if(req.headers.get("origin")!==origin)return answer(403,{error:"Origen no permitido"});
 if(Deno.env.get("MP_PROD_PILOT_ENABLED")!=="authorized-owner-pilot-63")return answer(503,{error:"Cobros reales DESACTIVADOS; no se ha autorizado la fase de producción."});
 const token=Deno.env.get("MP_PROD_ACCESS_TOKEN")?.trim()||"";
 const sellerId=Deno.env.get("MP_PROD_SELLER_ID")||"";
 if(!token.startsWith("APP_USR-")||!/^[0-9]+$/.test(sellerId)||!Deno.env.get("MP_PROD_WEBHOOK_SECRET"))
 return answer(503,{error:"Faltan las credenciales verificadas del titular y su webhook."});
 try {
  const k=keys();if(!k.url||!k.pub||!k.secret)return answer(503,{error:"Supabase incompleto"});
  const auth=req.headers.get("authorization")||"";
  if(!/^Bearer [^ ]+$/.test(auth))return answer(401,{error:"Owner debe iniciar sesión"});
  const userRes=await fetch(k.url+"/auth/v1/user",{headers:{"apikey":k.pub,"authorization":auth}});
  if(!userRes.ok)return answer(401,{error:"Sesión no válida"});
  const user=await userRes.json();
  if(!user?.id)return answer(401,{error:"Sesión no válida"});
  const sellerRes=await fetch("https://api.mercadopago.com/users/me",{headers:{"authorization":"Bearer "+token}});
  if(!sellerRes.ok)return answer(503,{error:"Credencial de producción rechazada"});
  const seller=await sellerRes.json();
  if(String(seller.id)!==sellerId||seller.tags?.includes("test_user"))return answer(403,{error:"Vendedor real no coincide con la cuenta autorizada"});
  const payload=await req.json();const quotaId=payload?.cuota_id;
  if(!Number.isSafeInteger(quotaId)||quotaId<=0)return answer(400,{error:"Cuota inválida"});
  const intent=await rpc(k.url,k.secret,"mp_real_create_intent",{p_actor_id:user.id,p_cuota_id:quotaId});
  if(Number(intent.amount)!==15)return answer(409,{error:"Este piloto está limitado a quince pesos"});
  if(intent.status==="ready"){
   const u=new URL(intent.checkout_url);if(u.protocol!=="https:"||!["www.mercadopago.com.mx","www.mercadopago.com"].includes(u.hostname))return answer(502,{error:"El enlace previo no es confiable"});
   return answer(200,{pilot:true,amount:15,checkout_url:u.href,existing:true});
  }
  if(intent.status!=="draft")return answer(409,{error:"Operación pendiente de revisión"});
  const ref=String(intent.reference);
  if(!/^beteles-prod-[0-9a-f-]{36}$/.test(ref))return answer(409,{error:"Referencia inválida"});
  const mp=await fetch("https://api.mercadopago.com/checkout/preferences",{
   method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","X-Idempotency-Key":String(intent.id)},
   body:JSON.stringify({items:[{id:String(quotaId),title:"Cuota de mantenimiento Casa 63",quantity:1,currency_id:"MXN",unit_price:15}],binary_mode:true,
    external_reference:ref,notification_url:k.url+"/functions/v1/mp-real-webhook",
    back_urls:{success:"https://kevin1507g-dev.github.io/Administrasion-privada/?mp_regreso=success",pending:"https://kevin1507g-dev.github.io/Administrasion-privada/?mp_regreso=pending",failure:"https://kevin1507g-dev.github.io/Administrasion-privada/?mp_regreso=failure"},
    auto_return:"approved"})
  });
  if(!mp.ok)return answer(502,{error:"Mercado Pago no aceptó la preferencia, sin registrar ningún pago"});
  const info=await mp.json();if(!info.id||!info.init_point)return answer(502,{error:"Respuesta de proveedor incompleta"});
  const checkoutUrl=new URL(info.init_point);
  if(checkoutUrl.protocol!=="https:"||!["www.mercadopago.com.mx","www.mercadopago.com"].includes(checkoutUrl.hostname))return answer(502,{error:"Enlace de pago inesperado"});
  await rpc(k.url,k.secret,"mp_real_store_preference",{p_intent_id:intent.id,p_preference_id:String(info.id),p_checkout_url:checkoutUrl.href});
  return answer(200,{pilot:true,amount:15,checkout_url:checkoutUrl.href});
 }catch(_){return answer(500,{error:"No se pudo crear el cobro; solicita revisión antes de reintentarlo"})}
});
