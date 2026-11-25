import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html=readFileSync(new URL('../index.html', import.meta.url),'utf8');
const css=readFileSync(new URL('../accesos-secciones.css', import.meta.url),'utf8');
const js=readFileSync(new URL('../accesos-secciones.js', import.meta.url),'utf8');

test('Historial de accesos presenta pestañas como Cuotas',()=>{
 assert.match(html,/accesos-secciones\.css\?v=1/);
 assert.match(html,/accesos-secciones\.js\?v=1/);
 assert.match(html,/window\.accesosSeccionesAbrir\?\.\(\)/);
 assert.match(css,/#accesos \.ac-tabs/);
 assert.match(css,/#accesos \.ac-panel\[hidden\]/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(js,/setAttribute\("role","tablist"\)/);
 assert.match(js,/setAttribute\("role","tabpanel"\)/);
});

test('Se conservan los siete cuadros originales en seis categorías',()=>{
 const anchors=['visitasRows','entregasRows','vcHistorialRows','aPersona',
  'accesosRows','esp32HistoryRows','garbageHistoryCard'];
 for(const anchor of anchors){
  assert.match(html,new RegExp('id="'+anchor+'"'));
  assert.match(js,new RegExp('"'+anchor+'"'));
 }
 const tabs=[...js.matchAll(/\{id:"(?:visitas|entregas|codigos|manual|esp32|basura)",label:/g)];
 assert.equal(tabs.length,6);
 assert.match(js,/anchors:\["aPersona","accesosRows"\]/);
});

test('Los permisos de las pestañas siguen los roles originales',()=>{
 assert.match(js,/id:"basura".*roles:\["owner"\]/);
 assert.match(js,/id:"esp32".*roles:\["admin","owner"\]/);
 assert.match(js,/id:"manual".*roles:\["guardia","admin","owner"\]/);
 assert.match(js,/roles:\["residente","admin","owner"\]/);
 assert.match(js,/panel\.appendChild\(card\)/);
 assert.match(js,/tab\.hidden=!allowedTab/);
 assert.match(js,/panel\.hidden=!active/);
});

test('Controles y registros de historial mantienen su ID y sus funciones',()=>{
 assert.match(html,/onclick="addAcceso\(\)"/);
 assert.match(html,/onclick="refreshEsp32History\(\)"/);
 assert.match(html,/onclick="cargarHistorialBasuraOwner\(\)"/);
 assert.match(html,/id="entregasRows"/);
});
