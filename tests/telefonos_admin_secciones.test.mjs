import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../telefonos-admin-secciones.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../telefonos-admin-secciones.js', import.meta.url), 'utf8');

test('Teléfonos Admin sigue la distribución de pestañas de Cuotas', () => {
 assert.match(html, /telefonos-admin-secciones\.css\?v=1/);
 assert.match(html, /telefonos-admin-secciones\.js\?v=1/);
 assert.match(html, /window\.telefonosAdminSeccionesAbrir\?\.\(\)/);
 assert.match(css, /#interfonTelefonos \.ta-tabs/);
 assert.match(css, /#interfonTelefonos \.ta-panel\[hidden\]/);
 assert.match(css, /@media\(max-width:560px\)/);
 assert.match(js, /setAttribute\("role","tablist"\)/);
 assert.match(js, /setAttribute\("role","tabpanel"\)/);
});

test('Los cinco cuadros originales se conservan sin duplicar formularios', () => {
 const anchors = [
   'interfonResidentesOwner', 'interfonTelConfigCard', 'interfonVoiceDemo',
   'interfonAdminDatosCard', 'interfonTelInfoCard'
 ];
 for (const id of anchors) {
  assert.match(html, new RegExp('id="'+id+'"'));
  assert.match(js, new RegExp('anchor:"'+id+'"'));
 }
 assert.equal([...js.matchAll(/\{id:"(?:casas|mio|llamadas|datos|informacion)",label:/g)].length, 5);
 assert.match(js, /panels\.get\(item\.id\)\.appendChild\(cards\.get\(item\.id\)\)/);
 assert.match(html, /id="interfonTelFormulario"/);
 assert.match(html, /id="interfonOwnerFormulario"/);
 assert.match(html, /id="interfonVoiceLlamar"/);
});

test('Los roles mantienen sus tarjetas visibles sin cambiar permisos del servidor', () => {
 assert.match(js, /id:"casas".*roles:\["owner"\]/);
 assert.match(js, /id:"llamadas".*roles:\["owner"\]/);
 assert.match(js, /id:"datos".*roles:\["owner"\]/);
 assert.match(js, /id:"mio".*roles:\["residente","owner","admin"\]/);
 assert.match(js, /id:"informacion".*roles:\["residente","owner","admin"\]/);
 assert.match(js, /tab\.hidden=!shown/);
 assert.match(js, /panel\.hidden=!active/);
 assert.doesNotMatch(js, /sb\.|fetch\(|\.rpc\(/);
});
