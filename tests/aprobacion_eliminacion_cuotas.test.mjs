// node tests/aprobacion_eliminacion_cuotas.test.mjs
// Regresión: admin sólo solicita; Sistema Admin aprueba o rechaza.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=f=>readFileSync(new URL("../"+f,import.meta.url),"utf8");
const html=read("index.html");
const hub=read("solicitudes-unificadas.js");
const client=read("solicitudes-baja-cuotas.js");
const poll=read("actualizar-cuadros.js");
const migration=read("database/aprobacion_eliminacion_cuotas_20261113.sql");
new Function(client);new Function(hub);new Function(poll);
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 if(m[1].trim())new Function(m[1]);
}
assert.match(html,/solicitudes-baja-cuotas\.js\?v=1/);
assert.match(html,/solicitudes-unificadas\.js\?v=2/);
assert.match(html,/actualizar-cuadros\.js\?v=3/);
assert.match(html,/id="solicitudesBajaCuotasRows"/);
assert.match(html,/📝 Solicitar eliminación/);
assert.match(html,/onclick="solicitarBajaCuota\('/);
assert.doesNotMatch(html,/onclick="eliminarCuota\(/);
assert.doesNotMatch(html,/async function eliminarCuota\(/);
assert.match(hub,/cuotas:\["owner","admin"\]/);
assert.match(hub,/move\("cuotas",document\.getElementById\("solicitudesBajaCuotasCard"\)\)/);
assert.match(hub,/window\.solicitudesBajaCuotasDatos/);
assert.match(client,/sb\.rpc\("solicitar_baja_cuota"/);
assert.match(client,/sb\.rpc\("resolver_baja_cuota"/);
assert.match(client,/currentRole\(\)!=="owner"/);
assert.match(client,/✅ Aprobar/);
assert.match(client,/❌ Rechazar/);
assert.match(client,/🔒 Esperando Sistema Admin/);
assert.match(poll,/cargarSolicitudesBajaCuotas/);
assert.match(migration,/REVOKE DELETE ON TABLE public\.cuotas FROM PUBLIC, anon, authenticated/);
assert.match(migration,/DROP POLICY IF EXISTS "role_owner_delete"/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.solicitudes_baja_cuota/);
assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
assert.match(migration,/REVOKE ALL ON TABLE public\.solicitudes_baja_cuota/);
assert.match(migration,/GRANT SELECT ON TABLE public\.solicitudes_baja_cuota TO authenticated/);
assert.match(migration,/v_actor\.rol <> 'owner'/);
assert.match(migration,/v_actor\.rol NOT IN \('admin','owner'\)/);
assert.match(migration,/status='review'/);
assert.match(migration,/archivada=true,archivada_el=now\(\),archivada_por=v_actor\.id/);
assert.match(migration,/DELETE FROM public\.cuotas WHERE id=v_cuota\.id/);
assert.match(migration,/WHERE id=v_sol\.id/);
assert.match(migration,/ON CONFLICT DO NOTHING/);
assert.doesNotMatch(client,/sb\.from\("cuotas"\)\.delete\(/);
console.log("PASS: solicitud, aprobación owner y protección de cuotas y pagos.");
