import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../panel-admin-secciones.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../panel-admin-secciones.css',import.meta.url),'utf8');

test('El Panel Administrador utiliza pestañas como Cuotas',()=>{
 assert.match(html,/panel-admin-secciones\.css\?v=3/);
 assert.match(html,/panel-admin-secciones\.js\?v=3/);
 assert.match(html,/window\.panelAdminSeccionesAbrir\?\.\('admin'\)/);
 assert.match(html,/window\.panelAdminSeccionesActualizar\?\.\(\)/);
 assert.match(css,/#inicio \.pa-tabs/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(js,/setAttribute\("role","tablist"\)/);
 assert.match(js,/setAttribute\("role","tabpanel"\)/);
});
test('El Centro de control Sistema Admin tiene seis categorías',()=>{
 for(const name of ['metricas','gestion','usuarios','repartidores','avisos','panel'])
  assert.match(js,new RegExp('id:"'+name+'",label:'));
 assert.match(html,/window\.panelAdminSeccionesAbrir\?\.\('owner'\)/);
 assert.match(js,/document\.body\.dataset\.ownerPanel==="owner"/);
 assert.match(js,/profile\?\.rol==="owner"/);
});
test('Los bloques originales y sus controles permanecen disponibles',()=>{
 const ids=['inicioIndicadores','houseOccupancyCard','inicioNotifCard','avisosInicio',
 'ownerAnalyticsDashboard','ownerGeneralAccessCard','ownerAdminDataCard',
 'ownerUsersRoleCard','ownerEmpresasReparto','ownerChatEspecialListaCard',
 'ownerEvidenciasFotograficas','ownerNotificationsCard','ownerAuditCard','ownerModeCard'];
 for(const id of ids){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(js,new RegExp('"'+id+'"'));
 }
 assert.match(html,/id="ownerRoleUser"/);
 assert.match(html,/id="ownerAnalyticsRefresh"/);
 assert.match(html,/id="empresaRepartoNombre"/);
 assert.match(js,/panel\.appendChild\(node\)/);
});
test('Los residentes no reciben pestañas ni cambios de permisos',()=>{
 assert.match(js,/\["admin","owner"\]\.includes\(profile\.rol\)/);
 assert.match(js,/if\(kind==="admin" && !staff\(\)\)return false/);
 assert.match(js,/if\(kind==="owner" && !ownerAllowed\(\)\)return false/);
 assert.doesNotMatch(js,/\.rpc\(|sb\.|fetch\(/);
});

test('Gestión general agrupa accesos y conserva los enlaces originales',()=>{
 assert.match(html,/class="ownerQuickLinks" role="navigation"/);
 for(const category of ['Casas y residentes','Cobros y finanzas','Accesos y seguridad','Comunidad y servicios'])
  assert.ok(html.includes(category));
 const groups=(html.match(/<details class="ownerQuickGroup"/g)||[]);
 assert.equal(groups.length,4);
 assert.match(html,/Historial de Paquetería/);
 assert.match(html,/window\.accesosSeccionesAbrir\?\.\('basura'\)/);
 assert.match(js,/anchors:\["ownerUsersRoleCard","ownerAdminDataCard"\]/);
 assert.match(js,/anchors:\["ownerGeneralAccessCard"\]/);
});

test('Sistema Admin tolera los cuadros movidos por Solicitudes sin abortar sus pestañas',()=>{
 assert.match(js,/\["ownerEmpresasReparto","ownerChatEspecialListaCard"\]\.includes\(anchor\)/);
 assert.match(js,/document\.getElementById\("solicitudes"\)\?\.contains\(element\)/);
 assert.match(js,/root\.insertBefore\(region,root\.querySelector\("h2"\)\?\.nextElementSibling\|\|null\)/);
 assert.match(js,/window\.solicitudesIr\?\.\(category\)/);
 assert.match(js,/function moveOwnerShortcut\(\)/);
 assert.match(js,/document\.addEventListener\("DOMContentLoaded",bootstrap/);
 assert.match(html,/<h2>👑 Panel Sistema Admin<\/h2>/);
});
