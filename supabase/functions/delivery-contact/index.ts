import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Servicio no disponible." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    // La casa es obligatoria. No aceptar cadenas mixtas como "45abc",
    // ni asignar NULL si el número no existe en la privada.
    const casaIngresada = clean(body?.casa, 10);
    if (!/^[0-9]{1,10}$/.test(casaIngresada) || Number(casaIngresada) <= 0) {
      return json({ error: "El número de casa es obligatorio y debe ser válido." }, 400);
    }
    const casaNumero = casaIngresada.replace(/^0+/, "");

    const tipoRaw = clean(body?.tipo, 30).toLowerCase();
    const tipo = ["comida", "paqueteria", "farmacia", "visita", "otro"].includes(tipoRaw)
      ? tipoRaw
      : "otro";

    const empresa = clean(body?.empresa, 80) || null;
    const repartidor = clean(body?.repartidor, 80) || null;
    const mensaje = clean(body?.mensaje, 240) || null;

    const forwarded = req.headers.get("x-forwarded-for") || "";
    const ip = (req.headers.get("cf-connecting-ip") ||
      forwarded.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "sin-ip").trim();
    const ua = req.headers.get("user-agent") || "sin-ua";
    const rateKey = await sha256(ip + "|" + ua);

    const haceDiez = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("entregas_contacto")
      .select("id", { count: "exact", head: true })
      .eq("rate_key", rateKey)
      .gte("created_at", haceDiez);

    if ((count || 0) >= 5) {
      return json({ error: "Demasiados intentos. Espera unos minutos antes de volver a intentar." }, 429);
    }

    const { data: casa, error: casaError } = await admin
      .from("casas")
      .select("id,numero,activo")
      .eq("numero", casaNumero)
      .eq("activo", true)
      .maybeSingle();

    if (casaError) {
      return json({ error: "No se pudo verificar la casa. Intenta nuevamente." }, 503);
    }
    if (!casa?.id) {
      return json({ error: "No se encontró una casa activa con ese número. Compruébalo e intenta nuevamente." }, 400);
    }

    const { data: requestRow, error: insertError } = await admin
      .from("entregas_contacto")
      .insert({
        casa_id: casa.id,
        tipo,
        empresa,
        repartidor,
        mensaje,
        estado: "esperando",
        rate_key: rateKey,
      })
      .select("id,public_token,expires_at")
      .single();

    if (insertError || !requestRow) {
      return json({ error: "No se pudo enviar la solicitud." }, 500);
    }

    if (casa?.id) {
      const { data: residentes } = await admin
        .from("profiles")
        .select("id")
        .eq("casa_id", casa.id)
        .eq("rol", "residente")
        .eq("activo", true)
        .eq("estado_registro", "aprobado");

      if (residentes?.length) {
        const descripcion =
          tipo === "comida" ? "Un repartidor de comida" :
          tipo === "paqueteria" ? "Un repartidor de paquetería" :
          tipo === "farmacia" ? "Un repartidor de farmacia" :
          tipo === "visita" ? "Una visita" :
          "Un repartidor";

        await admin.from("notificaciones_push").insert(
          residentes.map((r: { id: string }) => ({
            user_id: r.id,
            titulo: tipo === "visita" ? "🚶 Visita en la entrada" : "🛵 Repartidor en la entrada",
            mensaje: descripcion + " está esperando respuesta para tu casa.",
            tipo: "entrega_entrada",
            referencia: "entrega:" + requestRow.id + ":" + r.id,
            destino: "entregas",
          }))
        );
      }
    }

    return json({
      ok: true,
      token: requestRow.public_token,
      expires_at: requestRow.expires_at,
      mensaje: "Solicitud enviada. Espera la respuesta del residente.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error inesperado." }, 500);
  }
});