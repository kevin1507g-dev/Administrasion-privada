// Registro de proveedores retirado a solicitud de Administración.
// Conservamos este endpoint inactivo para rechazar enlaces y clientes antiguos.
// El Portero Virtual para repartidores, técnicos y visitas funciona por separado.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
Deno.serve(async (req: Request) => {
  if(req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  if(req.method !== "POST") return new Response(JSON.stringify({error:"Método no permitido."}),{status:405,headers:cors});
  try {
    const action = (req.headers.get("content-type")||"").includes("application/json")
      ? String((await req.json().catch(()=>({})))?.accion || "")
      : "";
    if(action === "capacidades"){
      return new Response(JSON.stringify({
        ok:true,registro_habilitado:false,registro_basico_habilitado:false,
        retirado:true,aviso_privacidad_url:null,
        apertura_automatica:false
      }),{status:200,headers:cors});
    }
  }catch{ /* Rechazar sin procesar datos ni archivos */ }
  return new Response(JSON.stringify({
    ok:false,retirado:true,
    error:"El registro de proveedores fue retirado. Para solicitar ingreso utiliza el Portero Virtual de repartidores y visitas, sin registro previo."
  }),{status:410,headers:cors});
});
