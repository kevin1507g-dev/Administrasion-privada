import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Registro y solicitudes de proveedores. No emite órdenes al ESP32.
// Las aperturas siguen estando sujetas a la autorización del residente.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
const url = () => Deno.env.get("PROVEEDORES_AVISO_PRIVACIDAD_URL") || "";
const enabled = () => Deno.env.get("PROVEEDORES_REGISTRO_ACTIVO") === "true" && /^https:\/\/[^\s/]+\/[^\s]+$/i.test(url());
const basicEnabled = () => Deno.env.get("PROVEEDORES_REGISTRO_BASICO_ACTIVO") === "true" &&
  Deno.env.get("PROVEEDORES_AVISO_VALIDADO") === "true" && /^https:\/\/[^\s/]+\/[^\s]+$/i.test(url());
const codeOK = (v: unknown) => /^PR-[A-F0-9]{20}$/.test(String(v || "").trim().toUpperCase());
const idOK = (v: unknown) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(v || ""));
const houseOK = (v: unknown) => /^(4[0-9]|5[0-9]|6[0-6])$/.test(String(v || ""));
const db = () => {
  const u = Deno.env.get("SUPABASE_URL"), k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!u || !k) throw Error("Configuración del servidor incompleta.");
  return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
};
async function sha(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
}
function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return "PR-" + [...bytes].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function norm(v: unknown) { return String(v || "").trim().normalize("NFC").replace(/\s+/g, " "); }
function validName(v: string) { return v.length >= 2 && v.length <= 70 && /^[\p{L}\p{M} .'-]+$/u.test(v); }
function validCompany(v: string) { return v.length >= 2 && v.length <= 80 && !/[<>\x00-\x1F]/.test(v); }
const fullName = (p: any) => [p.nombre, p.apellido_paterno, p.apellido_materno].join(" ");
function mimeFromBytes(b: Uint8Array) {
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i)=>b[i] === n)) return "image/png";
  if (b.length >= 12 && new TextDecoder().decode(b.slice(0,4)) === "RIFF" && new TextDecoder().decode(b.slice(8,12)) === "WEBP") return "image/webp";
  return "";
}
async function owner(db: any, req: Request) {
  const token = /^Bearer (\S+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!token) return null;
  const {data:{user},error} = await db.auth.getUser(token);
  if (error || !user?.id) return null;
  const {data:p} = await db.from("profiles").select("id").eq("id",user.id)
    .eq("rol","owner").eq("activo",true).eq("estado_registro","aprobado").maybeSingle();
  return p?.id || null;
}
async function rateKey(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0] ||
    req.headers.get("x-real-ip") || "desconocido";
  return sha(ip.trim() + "|" + (req.headers.get("user-agent") || "").slice(0,150));
}
async function throttle(db: any, req: Request) {
  const key = await rateKey(req);
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await db.from("proveedores_consultas_rate")
    .select("id",{count:"exact",head:true}).eq("rate_key",key).gte("creado_at",since);
  if (error || (count || 0) >= 12) throw Error("Demasiados intentos. Espera 10 minutos.");
  await db.from("proveedores_consultas_rate").insert({rate_key:key});
  return key;
}
async function findProvider(db: any, raw: unknown) {
  if (!codeOK(raw)) return null;
  const {data,error} = await db.from("proveedores_registrados")
    .select("id,casa_id,nombre,apellido_paterno,apellido_materno,empresa,estado,modalidad,caduca_at,creado_at")
    .eq("codigo_hash",await sha(String(raw).trim().toUpperCase())).maybeSingle();
  if (error) throw Error("No se pudo consultar el proveedor.");
  return data;
}
async function removeImages(db: any, p: any) {
  const paths = [p.ine_frente_ruta,p.ine_reverso_ruta,p.rostro_ruta].filter(Boolean);
  if (paths.length) {
    const {error} = await db.storage.from("proveedores-identidad").remove(paths);
    if (error) throw Error("No se pudieron eliminar las imágenes privadas.");
  }
  await db.from("proveedores_registrados")
    .update({ine_frente_ruta:null,ine_reverso_ruta:null,rostro_ruta:null})
    .eq("id",p.id);
}
// Limpieza de solicitudes pendientes sin resolver (se ejecuta al usar el servicio).
async function cleanOld(db: any) {
  // Destruir datos personales básicos al vencer el piloto (30 días).
  const {data:expired} = await db.from("proveedores_registrados")
    .select("id").eq("modalidad","basico").lt("caduca_at",new Date().toISOString()).limit(50);
  const expiredIds = (expired || []).map((p:any)=>p.id);
  if (expiredIds.length) {
    const {error:linkError} = await db.from("proveedores_solicitudes_acceso").delete().in("proveedor_id",expiredIds);
    if (!linkError) await db.from("proveedores_registrados").delete().in("id",expiredIds);
  }
  // Imágenes de registros ya revisados: reintentar borrado si una llamada falló.
  const {data:resolved} = await db.from("proveedores_registrados")
    .select("id,ine_frente_ruta,ine_reverso_ruta,rostro_ruta")
    .in("estado",["aprobado","rechazado","revocado"])
    .or("ine_frente_ruta.not.is.null,ine_reverso_ruta.not.is.null,rostro_ruta.not.is.null")
    .limit(20);
  for (const p of resolved || []) {
    try { await removeImages(db,p); } catch { /* próximo ciclo */ }
  }
  const deadline = new Date(Date.now()-7*24*60*60*1000).toISOString();
  const {data} = await db.from("proveedores_registrados")
    .select("id,ine_frente_ruta,ine_reverso_ruta,rostro_ruta")
    .eq("estado","pendiente").lt("creado_at",deadline).limit(20);
  for (const p of data || []) {
    try {
      await removeImages(db,p);
      await db.from("proveedores_registrados").update({estado:"rechazado",actualizado_at:new Date().toISOString()}).eq("id",p.id).eq("estado","pendiente");
    } catch { /* registro sigue inaccesible y se reintentará */ }
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({error:"Método no permitido."},405);
  try {
    const contentType = req.headers.get("content-type") || "";
    const database = db();
    if (contentType.includes("multipart/form-data")) {
      if (!enabled()) return json({error:"El registro con fotografías requiere un aviso de privacidad publicado por Administración."},503);
      if (Number(req.headers.get("content-length") || 0) > 10500000) return json({error:"Archivos demasiado grandes."},413);
      const form = await req.formData();
      if (form.get("accion") !== "registro" || form.get("consentimiento") !== "si")
        return json({error:"Debes aceptar el aviso de privacidad para enviar fotografías."},400);
      const casa = norm(form.get("casa"));
      const nombre = norm(form.get("nombre"));
      const paterno = norm(form.get("apellido_paterno"));
      const materno = norm(form.get("apellido_materno"));
      const empresa = norm(form.get("empresa"));
      if (!houseOK(casa) || !validName(nombre) || !validName(paterno) || !validName(materno) || !validCompany(empresa))
        return json({error:"Verifica los nombres y el número de casa (40 a 66)."},400);
      const files: [string, string][] = [
        ["ine_frente","frente"],["ine_reverso","reverso"],["rostro","rostro"]
      ];
      const pictures: { field:string, suffix:string, mime:string, data:Uint8Array }[] = [];
      for (const [field,suffix] of files) {
        const f = form.get(field);
        if (!(f instanceof File) || f.size < 1024 || f.size > 3145728)
          return json({error:"Adjunta tres imágenes válidas de hasta 3 MB cada una."},400);
        const bytes = new Uint8Array(await f.arrayBuffer());
        const mime = mimeFromBytes(bytes);
        if (!mime || mime !== f.type) return json({error:"Solo se admiten JPG, PNG o WebP reales."},415);
        pictures.push({field,suffix,mime,data:bytes});
      }
      const key = await rateKey(req);
      const since = new Date(Date.now()-24*60*60*1000).toISOString();
      const {count,error:limitError} = await database.from("proveedores_registrados")
        .select("id",{count:"exact",head:true}).eq("rate_key",key).gte("creado_at",since);
      if (limitError || (count || 0) >= 3) return json({error:"Límite de registros alcanzado. Contacta a Administración."},429);
      const {data:house,error:houseError} = await database.from("casas")
        .select("id").eq("numero",casa).eq("activo",true).maybeSingle();
      if (houseError || !house) return json({error:"Esa casa no está disponible."},400);
      await cleanOld(database);
      const id = crypto.randomUUID(), code = createCode();
      const paths: string[] = [];
      try {
        const uploadPaths: Record<string,string> = {};
        for (const p of pictures) {
          const ext = p.mime === "image/jpeg" ? "jpg" : p.mime === "image/png" ? "png" : "webp";
          const path = id + "/" + p.suffix + "." + ext;
          const {error} = await database.storage.from("proveedores-identidad")
            .upload(path,p.data,{contentType:p.mime,upsert:false,cacheControl:"no-store"});
          if (error) throw Error("No se pudieron guardar las fotografías privadas.");
          paths.push(path); uploadPaths[p.field] = path;
        }
        const {error} = await database.from("proveedores_registrados").insert({
          id,casa_id:house.id,nombre,apellido_paterno:paterno,apellido_materno:materno,empresa,
          codigo_hash:await sha(code),estado:"pendiente",rate_key:key,
          ine_frente_ruta:uploadPaths.ine_frente,
          ine_reverso_ruta:uploadPaths.ine_reverso,
          rostro_ruta:uploadPaths.rostro,
          consentimiento_at:new Date().toISOString()
        });
        if (error) throw Error("No se pudo finalizar el registro.");
        return json({ok:true,codigo:code,estado:"pendiente",
          mensaje:"Registro recibido. Conserva tu código; Sistema Admin debe aprobarlo antes de poder solicitar acceso."});
      } catch (e) {
        if (paths.length) await database.storage.from("proveedores-identidad").remove(paths);
        throw e;
      }
    }
    if (!contentType.includes("application/json")) return json({error:"Formato inválido."},415);
    const body = await req.json().catch(()=>({}));
    const action = String(body?.accion || "");
    if (action === "registro_basico") {
      if (!basicEnabled()) return json({error:"El registro real requiere completar y validar el aviso de privacidad, incluido el domicilio del responsable."},503);
      if (body?.consentimiento !== true) return json({error:"Debes leer y aceptar el aviso de privacidad."},400);
      const casa=norm(body.casa),nombre=norm(body.nombre),paterno=norm(body.apellido_paterno),
        materno=norm(body.apellido_materno),empresa=norm(body.empresa);
      if (!houseOK(casa)|| !validName(nombre)|| !validName(paterno)|| !validName(materno)|| !validCompany(empresa))
        return json({error:"Verifica nombre, apellidos, empresa y casa (40 a 66)."},400);
      const key=await rateKey(req);
      const since=new Date(Date.now()-24*60*60*1000).toISOString();
      const {count,error:limitError}=await database.from("proveedores_registrados")
        .select("id",{count:"exact",head:true}).eq("rate_key",key).gte("creado_at",since);
      if (limitError || (count||0)>=3)
        return json({error:"Límite de registros alcanzado. Contacta a Administración."},429);
      const {data:house,error:houseError}=await database.from("casas")
        .select("id").eq("numero",casa).eq("activo",true).maybeSingle();
      if (houseError || !house) return json({error:"Esa casa no está disponible."},400);
      const codigo=createCode();
      const {error}=await database.from("proveedores_registrados").insert({
        casa_id:house.id,nombre,apellido_paterno:paterno,apellido_materno:materno,empresa,
        codigo_hash:await sha(codigo),estado:"pendiente",modalidad:"basico",
        caduca_at:new Date(Date.now()+30*24*60*60*1000).toISOString(),
        rate_key:key,consentimiento_at:new Date().toISOString()
      });
      if (error) return json({error:"No se pudo completar el registro. Vuelve a intentar."},503);
      return json({ok:true,codigo,estado:"pendiente",caduca_at:new Date(Date.now()+30*24*60*60*1000).toISOString(),
        mensaje:"Registro recibido. Sistema Admin deberá aprobarlo antes de poder solicitar acceso al residente."});
    }

    if (action === "mantenimiento") {
      const token = req.headers.get("x-cron-token") || "";
      if (!/^[a-f0-9]{64}$/.test(token)) return json({error:"No autorizado."},403);
      const {data:valid,error:verificationError} = await database.rpc("proveedores_cron_validar",{p_token:token});
      if (verificationError || valid !== true) return json({error:"No autorizado."},403);
      await cleanOld(database);
      return json({ok:true,limpieza:"ejecutada"});
    }
    if (action === "capacidades") {
      return json({ok:true,registro_basico_habilitado:basicEnabled(),registro_habilitado:enabled(),
        aviso_privacidad_url:enabled()?url():null,retencion_pendientes_dias:7,
        acceso_solicitud_minutos:3,apertura_automatica:false});
    }
    if (action === "consultar" || action === "solicitar_acceso") {
      await throttle(database,req);
      const p = await findProvider(database,body.codigo);
      if (!p) return json({error:"Código no reconocido."},404);
      if (p.estado !== "aprobado") return json({error:"El registro aún no está autorizado o ya no está vigente.",estado:p.estado},403);
      if (p.modalidad==="basico" && (!basicEnabled() || !p.caduca_at || Date.parse(p.caduca_at)<=Date.now())) return json({error:"Este registro básico ya no está vigente o fue deshabilitado."},403);
      const {data:house} = await database.from("casas").select("numero,activo")
        .eq("id",p.casa_id).maybeSingle();
      if (!house || !house.activo || !houseOK(house.numero))
        return json({error:"La casa ya no está disponible."},403);
      if (action === "consultar") {
        return json({ok:true,nombre:p.nombre,apellido_paterno:p.apellido_paterno,
          apellido_materno:p.apellido_materno,nombre_completo:fullName(p),casa:house.numero,
          tipo:"otro",empresa:p.empresa || "Proveedor registrado",estado:"aprobado"});
      }
      const since = new Date(Date.now()-10*60*1000).toISOString();
      const {count} = await database.from("proveedores_solicitudes_acceso")
        .select("id",{count:"exact",head:true}).eq("proveedor_id",p.id).gte("creado_at",since);
      if ((count||0) >= 3) return json({error:"Ya realizaste varias solicitudes. Espera unos minutos."},429);
      const {data:existing} = await database.from("proveedores_solicitudes_acceso")
        .select("entrega:entregas_contacto!inner(estado,expires_at)")
        .eq("proveedor_id",p.id).gte("creado_at",new Date(Date.now()-3*60*1000).toISOString()).limit(3);
      if ((existing||[]).some((x:any)=>x.entrega?.estado==="esperando"&&Date.parse(x.entrega.expires_at)>Date.now()))
        return json({error:"Ya tienes una solicitud en curso. Espera su respuesta."},429);
      const {data:delivery,error:insertError} = await database.from("entregas_contacto")
        .insert({casa_id:p.casa_id,tipo:"otro",empresa:p.empresa || "Proveedor registrado",
          repartidor:fullName(p),mensaje:"Proveedor de "+(p.empresa || "empresa no declarada")+". Solicitud de acceso (3 minutos), con autorización del residente.",
          estado:"esperando",expires_at:new Date(Date.now()+3*60*1000).toISOString()})
        .select("id,public_token,expires_at").single();
      if (insertError || !delivery) return json({error:"No se pudo crear la solicitud."},503);
      const {error:linkError} = await database.from("proveedores_solicitudes_acceso")
        .insert({proveedor_id:p.id,entrega_id:delivery.id});
      if (linkError) {
        await database.from("entregas_contacto").delete().eq("id",delivery.id);
        return json({error:"No se pudo vincular el registro."},503);
      }
      const {data:residents} = await database.from("profiles")
        .select("id").eq("casa_id",p.casa_id).eq("rol","residente")
        .eq("activo",true).eq("estado_registro","aprobado");
      if (residents?.length) {
        const {error:notificationError} = await database.from("notificaciones_push").insert(
          residents.map((r:any)=>({
            user_id:r.id,titulo:"🛠️ Proveedor solicita acceso",
            mensaje:"Proveedor de "+(p.empresa || "empresa no declarada")+" solicita autorización para Casa "+house.numero+". Vigencia: 3 minutos.",
            tipo:"entrega_entrada",referencia:"entrega:"+delivery.id+":"+r.id,destino:"entregas"
          }))
        );
        if (notificationError) {
          await database.from("proveedores_solicitudes_acceso").delete().eq("entrega_id",delivery.id);
          await database.from("entregas_contacto").delete().eq("id",delivery.id);
          return json({error:"No se pudo notificar al residente. Vuelve a intentar."},503);
        }
      }
      return json({ok:true,token:delivery.public_token,expires_at:delivery.expires_at,
        mensaje:"Solicitud enviada. Necesitas autorización del residente; el código no abre el portón."});
    }
    if (action.startsWith("admin_")) {
      const uid = await owner(database,req);
      if (!uid) return json({error:"Solo Sistema Admin puede revisar registros."},403);
      await cleanOld(database);
      if (action === "admin_listar") {
        const {data,error} = await database.from("proveedores_registrados")
          .select("id,nombre,apellido_paterno,apellido_materno,empresa,modalidad,caduca_at,estado,creado_at,revisado_at,casa:casas!proveedores_registrados_casa_id_fkey(numero)")
          .order("creado_at",{ascending:false}).limit(100);
        if (error) return json({error:"No se pudieron consultar los registros."},503);
        return json({ok:true,registros:data || []});
      }
      if (!idOK(body.id)) return json({error:"ID no válido."},400);
      const {data:p,error} = await database.from("proveedores_registrados")
        .select("*").eq("id",body.id).maybeSingle();
      if (error || !p) return json({error:"Registro no encontrado."},404);
      if (action === "admin_ver") {
        if (p.estado !== "pendiente") return json({error:"Las fotos ya no están disponibles tras la revisión."},410);
        if (p.modalidad === "basico") return json({ok:true,modalidad:"basico",documentos:{},mensaje:"Registro básico sin documentos. Empresa declarada, no verificada."});
        const docs: Record<string,string> = {};
        for (const [k,path] of Object.entries({
          frente:p.ine_frente_ruta,reverso:p.ine_reverso_ruta,rostro:p.rostro_ruta
        })) {
          if (!path) continue;
          const {data, error:signError} = await database.storage.from("proveedores-identidad")
            .createSignedUrl(String(path),60);
          if (signError || !data?.signedUrl) return json({error:"No se pudieron abrir los documentos."},503);
          docs[k] = data.signedUrl;
        }
        return json({ok:true,documentos:docs,segundos:60});
      }
      if (action === "admin_estado") {
        const estado = String(body.estado||"");
        if (p.modalidad==="basico" && (!p.caduca_at || Date.parse(p.caduca_at)<=Date.now())) return json({error:"Registro básico vencido."},410);
        if (!(p.estado==="pendiente" && ["aprobado","rechazado"].includes(estado)) &&
            !(p.estado==="aprobado" && estado==="revocado"))
          return json({error:"Cambio de estado no permitido."},400);
        const {data:updated,error:saveError} = await database.from("proveedores_registrados")
          .update({estado,revisado_por:uid,revisado_at:new Date().toISOString(),actualizado_at:new Date().toISOString()})
          .eq("id",p.id).eq("estado",p.estado).select("id").maybeSingle();
        if (saveError || !updated) return json({error:"El estado cambió simultáneamente. Recarga."},409);
        try { await removeImages(database,p); }
        catch { return json({ok:true,estado,advertencia:"Estado actualizado; revisa la limpieza pendiente de documentos."}); }
        return json({ok:true,estado,documentos_eliminados:true});
      }
    }
    return json({error:"Acción desconocida."},400);
  } catch (e) {
    return json({error: e instanceof Error ? e.message : "No se pudo completar la solicitud."},500);
  }
});
