
const answer=(status:number,x:object)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function keys(){const b=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return{url:Deno.env.get("SUPABASE_URL")||"",secret:b.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}}
function adminHeaders(key:string){return key.startsWith("sb_secret_")?{"apikey":key,"Content-Type":"application/json"}:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json"}}
async function verify(req:Request,id:string,secret:string){
 const sig=Object.fromEntries((req.headers.get("x-signature")||"").split(",").map(x=>x.trim().split("=")));
 const requestId=req.headers.get("x-request-id")||"";
 if(!sig.ts||!sig.v1||!requestId||!/^[a-f0-9]{64}$/i.test(sig.v1))return false;
 const t=Number(sig.ts);if(!Number.isFinite(t)||Math.abs(Date.now()-t*(t<1e11?1000:1))>48*3600*1000)return false;
 const manifest="id:"+id.toLowerCase()+";request-id:"+requestId+";ts:"+sig.ts+";";
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const bytes=new Uint8Array(32);for(let i=0;i<32;i++)bytes[i]=parseInt(sig.v1.slice(i*2,i*2+2),16);
 return crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(manifest));
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return answer(405,{error:"Método no permitido"});
 const enabled=Deno.env.get("MP_PROD_PILOT_ENABLED")==="authorized-owner-pilot-63" ||
   Deno.env.get("MP_RESIDENT_PAYMENTS_ENABLED")==="adult-owner-reviewed";
 const token=Deno.env.get("MP_PROD_ACCESS_TOKEN")||"",webhookSecret=Deno.env.get("MP_PROD_WEBHOOK_SECRET")||"",sellerId=Deno.env.get("MP_PROD_SELLER_ID")||"";
 if(!webhookSecret)return answer(503,{error:"Falta firma secreta del Webhook"});
 // La verificación HMAC puede probarse aun con el piloto real desactivado.
 if(enabled&&(!token.startsWith("APP_USR-")||!/^[0-9]+$/.test(sellerId)))return answer(503,{error:"Configuración de producción incompleta"});
 try{
  const payload=await req.json();
  if(payload.type!=="payment")return answer(200,{ignored:true});
  const id=String(payload?.data?.id||"");
  const queryId=new URL(req.url).searchParams.get("data.id")||new URL(req.url).searchParams.get("data_id")||"";
  if(!/^[0-9]+$/.test(id)||queryId!==id)return answer(400,{error:"ID de webhook inconsistente"});
  if(!await verify(req,queryId,webhookSecret))return answer(401,{error:"Firma inválida"});
  if(!enabled){
    // Sin crear pagos ni modificar cuotas. La prueba del simulador acredita
    // únicamente transporte HTTP y firma; no conciliación financiera.
    console.info("MP_WEBHOOK_PROBE_VERIFIED_READ_ONLY");
    return answer(200,{ok:true,mode:"read_only",firma_verificada:true,pago_aplicado:false});
  }
  const provider=await fetch("https://api.mercadopago.com/v1/payments/"+id,{headers:{"Authorization":"Bearer "+token}});
  if(!provider.ok)return answer(502,{error:"Proveedor no disponible"});
  const payment=await provider.json();
  if(String(payment.id)!==id||String(payment.collector_id)!==sellerId||payment.live_mode!==true)return answer(403,{error:"Pago no pertenece al vendedor real autorizado"});
  if(payment.status!=="approved")return answer(200,{ignored:true,status:String(payment.status)});
  const reference=String(payment.external_reference||"");
  if(!/^beteles-(?:prod|res)-[0-9a-f-]{36}$/.test(reference))return answer(200,{ignored:true,reason:"Pago ajeno al piloto"});
  const k=keys();if(!k.url||!k.secret)return answer(503,{error:"Sin acceso a conciliación"});
  const response=await fetch(k.url+"/rest/v1/rpc/mp_real_finalize_verified",{
   method:"POST",headers:adminHeaders(k.secret),
   body:JSON.stringify({p_reference:reference,p_provider_payment_id:id,p_amount:payment.transaction_amount,p_currency:payment.currency_id,p_status:payment.status,p_live_mode:payment.live_mode})
  });
  if(!response.ok)return answer(502,{error:"No se pudo conciliar; reintento requerido"});
  const result=await response.json();
  if(!result.applied){
    console.warn("Pago real pendiente de revisión",result.reason);
    return answer(200,{ok:true,applied:false,reason:result.reason});
  }
  // Registra POR SEPARADO el ingreso neto y la comisión real informada
  // por Mercado Pago; la cuota ya fue abonada por su importe bruto.
  // No inventar costos ni usar estimaciones cuando el proveedor no los entrega.
  const net=payment?.transaction_details?.net_received_amount;
  const gross=payment?.transaction_amount;
  if(typeof net==="number" && Number.isFinite(net) && net>0 &&
     typeof gross==="number" && Number.isFinite(gross) && gross>=net) {
    const feeResp=await fetch(k.url+"/rest/v1/rpc/mp_record_verified_settlement",{
      method:"POST",headers:adminHeaders(k.secret),
      body:JSON.stringify({p_reference:reference,p_provider_payment_id:id,p_gross:gross,p_net:net})
    });
    if(!feeResp.ok) {
      console.warn("Comisión de Mercado Pago sin conciliar: respuesta RPC "+feeResp.status);
      return answer(502,{error:"Pago registrado. Comisión por conciliar; se requiere un nuevo intento de notificación."});
    }
    const feeResult=await feeResp.json();
    if(feeResult.ok!==true) {
      console.warn("Comisión pendiente de revisión:",feeResult.reason);
      return answer(200,{ok:true,applied:true,commission_review:true});
    }
  } else {
    console.info("MP_NET_NOT_YET_AVAILABLE: payment is registered; fee pending verified settlement");
  }
  return answer(200,{ok:true,applied:true,duplicate:!!result.duplicate});
 }catch(_){return answer(500,{error:"Error al procesar notificación"})}
});
