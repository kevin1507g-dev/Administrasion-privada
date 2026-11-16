// node tests/centro_conocimientos_ia.test.mjs
// Confirmar integración sin alterar datos reales.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=load('index.html'),client=load('centro-conocimientos-ia.js'),
 css=load('centro-conocimientos-ia.css'),backend=load('supabase/functions/asistente-residencial-ia/index.ts'),
 sql=load('database/centro_conocimientos_ia_20261115.sql'),
 refresh=load('actualizar-cuadros.js');
new Function(client);new Function(refresh);
new Function(backend.replace(/^import [^\n]*\n/,''));
for(const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)){
 if(m[1].trim())new Function(m[1]);
}
assert.match(html,/show\('conocimientosIA'\)/);
assert.match(html,/<section id="conocimientosIA" class="ownerOnly hidden">/);
assert.match(html,/centro-conocimientos-ia\.css\?v=2/);
assert.match(html,/centro-conocimientos-ia\.js\?v=2/);
assert.match(html,/actualizar-cuadros\.js\?v=4/);
for(const id of ['iaConocimientoForm','iaConocimientoTitulo','iaConocimientoTipo',
 'iaConocimientoCategoria','iaConocimientoPregunta','iaConocimientoRespuesta',
 'iaConocimientoContenido','iaConocimientoActivo','iaConocimientoAudiencia',
 'iaConocimientoArchivo','iaConocimientosLista','iaConocimientoFiltro']){
 assert.ok(html.includes('id="'+id+'"'),'Falta: '+id);
}
assert.match(client,/profile\?\.rol!=="owner"/);
assert.match(client,/async function importFile/);
assert.ok(client.includes("(txt|md)"),"Importación de archivos .txt y .md");
assert.match(client,/window\.cargarConocimientosIA=async function/);
assert.match(client,/sb\.from\("ia_conocimientos"\)/);
assert.match(client,/Guardar conocimiento/);
assert.match(client,/roles:audiences\[rol\]/);
assert.match(client,/actualizado_por:user\.id/);
assert.match(client,/confirm\("¿Eliminar definitivamente/);
assert.doesNotMatch(client,/service_role|digital_access_request|garbage_window_manage/);
assert.match(refresh,/case "conocimientosIA"/);
assert.match(css,/@media\(max-width:560px\)/);
assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/current_user_role\(\)\)='owner'/);
assert.match(sql,/FOR SELECT TO authenticated/);
assert.match(sql,/FOR INSERT TO authenticated/);
assert.match(sql,/FOR UPDATE TO authenticated/);
assert.match(sql,/FOR DELETE TO authenticated/);
assert.match(sql,/LANGUAGE sql STABLE SECURITY INVOKER/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.ia_buscar_conocimientos\(text,integer\) TO authenticated/);
assert.match(backend,/async function responderConocimiento/);
assert.match(backend,/ctx\.db\.rpc\("ia_buscar_conocimientos"/);
assert.match(backend,/preguntaDeReglamento\(message,route\.tool,direct,intent,route\.action\)/);
assert.match(backend,/if\(direct\|\|intent\|\|action\)return false/);
assert.match(backend,/route\.action\?await propose/);
console.log('PASS: conocimiento IA conectado, validado por rol y sin comandos físicos.');
