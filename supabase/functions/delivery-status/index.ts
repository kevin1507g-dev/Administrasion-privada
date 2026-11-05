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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ estado: "esperando" });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();

    if (!/^[0-9a-fA-F-]{36}$/.test(token)) {
      return json({ estado: "esperando" });
    }

    const { data: row } = await admin
      .from("entregas_contacto")
      .select("estado,respuesta,respondido_at,expires_at,created_at,portero_modo_mixto,portero_intervino_at,portero_resultado")
      .eq("public_token", token)
      .maybeSingle();

    if (!row) return json({ estado: "esperando" });

    if (row.estado === "respondido" && row.respuesta) {
      return json({
        estado: "respondido",
        respuesta: row.respuesta,
        respondido_at: row.respondido_at,
      });
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      if (row.estado === "esperando") {
        await admin
          .from("entregas_contacto")
          .update({ estado: "expirado" })
          .eq("public_token", token)
          .eq("estado", "esperando");
      }
      return json({ estado: "expirado" });
    }

    return json({
      estado: "esperando",
      expires_at: row.expires_at,
      portero_mixto: row.portero_modo_mixto === true,
      portero_intervencion_at: row.portero_modo_mixto === true
        ? new Date(new Date(row.created_at).getTime() + 120000).toISOString()
        : null,
      portero_intervino_at: row.portero_intervino_at,
      portero_resultado: row.portero_resultado,
    });
  } catch (_) {
    return json({ estado: "esperando" });
  }
});