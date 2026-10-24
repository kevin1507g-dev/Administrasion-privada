// Contabilidad Mercado Pago: SOLO conciliación de cargos efectivamente cobrados.
// No puede generar preferencias ni iniciar cobros, ni cambiar el abono de cuota.
const ORIGIN="https://kevin1507g-dev.github.io";
const HEADERS={
 "Access-Control-Allow-Origin":ORIGIN,
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store"
};
function result(status:number,body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:HEADERS})}
function sbKeys(){
 const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
 const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
 return {url:Deno.env.get("SUPABASE_URL")||"",anon:pub.default||Deno.env.get("SUPABASE_ANON_KEY")||"",admin:sec.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
}
function headersFor(key:string){
 return key.startsWith("sb_secret_")?
  {apikey:key,"Content-Type":"application/json"}:
  {apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"}
}
async function rpc(url:string,key:string,fn:string,data:object){
 const r=await fetch(url+"/rest/v1/rpc/"+fn,{method:"POST",headers:headersFor(key),body:JSON.stringify(data)});
 if(!r.ok)throw new Error("Falló la comprobación contable en Supabase");
 return await r.json();
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
 if(req.method!=="POST")return result(405,{error:"Método no permitido"});
 if(req.headers.get("origin")!==ORIGIN)return result(403,{error:"Origen no autorizado"});
 try{
  const k=sbKeys(),auth=req.headers.get("authorization")||"";
  if(!k.url||!k.anon||!k.admin)return result(503,{error:"Configuración incompleta de Supabase"});
  if(!/^Bearer [^ ]+$/.test(auth))return result(401,{error:"Inicia sesión como Owner"});
  const me=await fetch(k.url+"/auth/v1/user",{headers:{apikey:k.anon,Authorization:auth}});
  if(!me.ok)return result(401,{error:"Sesión no válida"});
  const user=await me.json();
  if(!user?.id)return result(401,{error:"Sesión no válida"});
  const p=await fetch(k.url+"/rest/v1/profiles?select=rol,activo,estado_registro&id=eq."+encodeURIComponent(user.id),{
    headers:headersFor(k.admin)
  });
  if(!p.ok)return result(503,{error:"No se pudo comprobar tu autorización"});
  const users=await p.json();
  if(users.length!==1||users[0].rol!=="owner"||users[0].activo!==true||users[0].estado_registro!=="aprobado"){
   return result(403,{error:"Solo Owner puede consultar la conciliación"});
  }
  const token=Deno.env.get("MP_PROD_ACCESS_TOKEN")||"";
  const sellerId=Deno.env.get("MP_PROD_SELLER_ID")||"";
  if(!token.startsWith("APP_USR-")||!/^[0-9]+$/.test(sellerId)){
    return result(503,{error:"No se ha configurado la cuenta vendedora de producción"});
  }
  const pending=await rpc(k.url,k.admin,"mp_pending_verified_settlements",{});
  if(!Array.isArray(pending))return result(502,{error:"La lista de conciliaciones fue inválida"});
  let updated=0,feeSum=0,netSum=0,grossSum=0,underReview=0;
  for(const v of pending.slice(0,20)){
   if(!/^[0-9]+$/.test(String(v.provider_id))||!/^beteles-(?:prod|res)-[0-9a-f-]{36}$/.test(String(v.reference))) {underReview++;continue;}
   let pay;
   try{
    const p=await fetch("https://api.mercadopago.com/v1/payments/"+v.provider_id,{
      headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(10000)
    });
    if(!p.ok){underReview++;continue;}
    pay=await p.json();
   }catch{underReview++;continue;}
   if(pay.status!=="approved"||pay.live_mode!==true||
     String(pay.id)!==String(v.provider_id)||String(pay.collector_id)!==sellerId||
     String(pay.external_reference)!==String(v.reference)||pay.currency_id!=="MXN") {
      underReview++;continue;
   }
   const gross=Number(pay.transaction_amount);
   const rawNet=pay?.transaction_details?.net_received_amount;
   const net=Number(rawNet);
   if(rawNet===null||rawNet===undefined||
      !Number.isFinite(gross)||!Number.isFinite(net)||net<=0||net>gross||
      Math.abs(gross-Number(v.gross))>0.001) {underReview++;continue;}
   const saved=await rpc(k.url,k.admin,"mp_record_verified_settlement",{
    p_reference:v.reference,p_provider_payment_id:String(v.provider_id),
    p_gross:gross,p_net:net
   });
   if(saved?.ok!==true){underReview++;continue;}
   if(saved.duplicate!==true){
    updated++;
    grossSum+=gross;
    feeSum+=Number(saved.fee);
    netSum+=net;
   }
  }
  return result(200,{
    ok:true,reconciled:updated,under_review:underReview,
    gross:Math.round(grossSum*100)/100,
    fees:Math.round(feeSum*100)/100,
    net:Math.round(netSum*100)/100,
    total_pending:pending.length,
    message:"Solo se registraron los montos reales verificados con Mercado Pago. No se generó ningún cobro ni se cambió la cuota."
  });
 }catch(_){return result(500,{error:"No se pudo comprobar la comisión en este momento; no se generó ningún cobro"})}
});
