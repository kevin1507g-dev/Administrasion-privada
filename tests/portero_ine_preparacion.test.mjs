// Ejecutar con Node: node tests/portero_ine_preparacion.test.mjs
// Comprueba que el módulo aún no captura INE ni autoriza apertura física.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const backend=readFileSync(new URL("../supabase/functions/portero-ine-verificacion/index.ts",import.meta.url),"utf8");
const schema=readFileSync(new URL("../database/portero_verificacion_ine_veriff_20261105.sql",import.meta.url),"utf8");
assert.match(backend,/PORTERO_VERIFICACION_INE_ACTIVA/);
assert.match(backend,/VERIFF_API_KEY/);
assert.match(backend,/PORTERO_AVISO_PRIVACIDAD_URL/);
assert.match(backend,/body\?\.consent!==true/);
assert.match(backend,/action==="capabilities"/);
assert.match(backend,/action==="status"/);
assert.match(backend,/action!=="start"/);
assert.match(backend,/new TextEncoder\(\)\.encode\(s\)/);
assert.doesNotMatch(backend,/digital_access_request|visitor_pass_request|access_private\.commands/);
assert.match(schema,/ENABLE ROW LEVEL SECURITY/);
assert.match(schema,/REVOKE ALL ON public\.portero_identidad_verificaciones/);
assert.doesNotMatch(schema,/documento_foto|selfie|curp|cic\s+text/i);
console.log("PASS: preparación INE cerrada por configuración y sin acceso físico automático.");
