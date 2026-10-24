const ORIGIN="https://kevin1507g-dev.github.io";
const H={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const respond=(status:number,value:object)=>new Response(JSON.stringify(value),{status,headers:H});
function keys(){const a=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}"),b=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return{url:Deno.env.get("SUPABASE_URL")||"",pub:a.default||Deno.env.get("SUPABASE_ANON_KEY")||"",svc:b.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}}
function serverHeaders(k:string){return k.startsWith("sb_secret_")?{"apikey":k,"Content-Type":"application/json"}:{"apikey":k,"Authorization":"Bearer "+k,"Content-Type":"application/json"}}
async function rpc(base:string,key:string,name:string,body:object){
 const r=await fetch(base+"/rest/v1/rpc/"+name,{method:"POST",headers:serverHeaders(key),body:JSON.stringify(body)});
 if(!r.ok){if(r.status===403||r.status===401)throw Error("No autorizado para esa cuota");throw Error("La cuota o el checkout requieren revisión; no se realizó ningún cobro");}
 return await r.json();
}
function checkoutUrl(raw:unknown){
 const u=new URL(String(raw||""));
 if(u.protocol!=="https:"||!["www.mercadopago.com.mx","www.mercadopago.com"].includes(u.hostname))throw Error("Enlace de Mercado Pago no confiable");
 return u.href;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(req.method!=="POST")return respond(405,{error:"Método no permitido"});
 if(req.headers.get("origin")!==ORIGIN)return respond(403,{error:"Origen no permitido"});
 try{
  const k=keys();if(!k.url||!k.pub||!k.svc)return respond(503,{error:"Servicio no disponible"});
  const bearer=req.headers.get("authorization")||"";
  if(!/^Bearer [^ ]+$/.test(bearer))return respond(401,{error:"Inicia sesión"});
  const auth=await fetch(k.url+"/auth/v1/user",{headers:{apikey:k.pub,Authorization:bearer}});
  if(!auth.ok)return respond(401,{error:"Sesión inválida"});
  const currentUser=await auth.json();
  if(!currentUser?.id)return respond(401,{error:"Sesión inválida"});
  const profiles=await fetch(k.url+"/rest/v1/profiles?select=rol,activo,estado_registro,casa_id&id=eq."+encodeURIComponent(currentUser.id),{headers:serverHeaders(k.svc)});
  if(!profiles.ok)return respond(503,{error:"No se pudo verificar la residencia"});
  const rows=await profiles.json();
  const me=Array.isArray(rows)?rows[0]:null;
  if(rows.length!==1||me?.rol!=="residente"||me?.activo!==true||me?.estado_registro!=="aprobado"||!me?.casa_id){
    return respond(403,{error:"Solo residentes activos y aprobados con casa asignada pueden usar este checkout"});
  }
  const input=await req.json();
  const enabled=Deno.env.get("MP_RESIDENT_PAYMENTS_ENABLED")==="adult-owner-reviewed";
  if(input?.status_only===true)return respond(200,{checked:true,enabled});
  if(!enabled)return respond(503,{error:"Los pagos en línea de residentes todavía no están habilitados por el titular"});
  const quotaId=input?.cuota_id;
  if(!Number.isSafeInteger(quotaId)||quotaId<=0)return respond(400,{error:"Cuota inválida"});
  const token=(Deno.env.get("MP_PROD_ACCESS_TOKEN")||"").trim();
  const sellerId=(Deno.env.get("MP_PROD_SELLER_ID")||"").trim();
  if(!token.startsWith("APP_USR-")||!/^[0-9]+$/.test(sellerId)||!Deno.env.get("MP_PROD_WEBHOOK_SECRET"))
    return respond(503,{error:"Pago en línea no disponible"});
  const seller=await fetch("https://api.mercadopago.com/users/me",{headers:{Authorization:"Bearer "+token}});
  if(!seller.ok)return respond(503,{error:"No se pudo verificar la cuenta de cobro"});
  const sellerInfo=await seller.json();
  if(String(sellerInfo.id)!==sellerId||sellerInfo.tags?.includes("test_user"))
    return respond(503,{error:"La cuenta vendedora requiere revisión"});
  const intent=await rpc(k.url,k.svc,"mp_resident_create_intent",{p_actor_id:currentUser.id,p_cuota_id:quotaId});
  const amount=Number(intent.amount);
  if(!Number.isFinite(amount)||amount<1||amount>10000||Math.abs(amount*100-Math.round(amount*100))>0.0001)
    return respond(409,{error:"El monto de esta cuota no es válido"});
  if(intent.status==="ready"){
    return respond(200,{ready:true,amount,checkout_url:checkoutUrl(intent.checkout_url),existing:true});
  }
  if(intent.status!=="draft"||!/^beteles-res-[0-9a-f-]{36}$/.test(String(intent.reference||"")))
    return respond(409,{error:"La solicitud de pago requiere revisión"});
  const mp=await fetch("https://api.mercadopago.com/checkout/preferences",{
   method:"POST",
   headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","X-Idempotency-Key":String(intent.id)},
   body:JSON.stringify({
    items:[{id:String(quotaId),title:"Cuota de Administración Residencial",quantity:1,currency_id:"MXN",unit_price:amount}],
    external_reference:String(intent.reference),
    binary_mode:true,
    notification_url:k.url+"/functions/v1/mp-real-webhook",
    back_urls:{success:"https://kevin1507g-dev.github.io/Administrasion-privada/?mp_regreso=success",pending:"https://kevin1507g-dev.github.io/Administrasion-privada/?mp_regreso=pending",failure:"https://kevin1507g-dev.github.io/Administrasion-privada/?mp_regreso=failure"},
    auto_return:"approved"
   })
  });
  if(!mp.ok)return respond(502,{error:"Mercado Pago no generó el enlace; no vuelvas a intentarlo si ya existe un pago"});
  const info=await mp.json();
  if(!info.id||!info.init_point)return respond(502,{error:"Preferencia incompleta"});
  const url=checkoutUrl(info.init_point);
  await rpc(k.url,k.svc,"mp_real_store_preference",{p_intent_id:intent.id,p_preference_id:String(info.id),p_checkout_url:url});
  return respond(200,{ready:true,amount,checkout_url:url});
 }catch(e){
  console.warn("MP residente checkout: ",String((e as Error)?.message||"error"));
  return respond(409,{error:"No se pudo preparar el enlace. Comprueba que no haya pagos o intentos pendientes antes de reintentar."});
 }
});