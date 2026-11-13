// node tests/huella_owner_delete.test.mjs
// Sistema Admin elimina solo solicitudes pendientes; no modifica el lector físico.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('biometrico.js'),html=read('index.html'),hub=read('solicitudes-unificadas.js');
new Function(source);
new Function(hub);
assert.match(html,/biometrico\.js\?v=2/);
assert.match(html,/solicitudes-unificadas\.js\?v=3/);
assert.match(source,/eliminarSolicitudHuellaSistemaAdmin\('/);
assert.match(source,/profile\?\.rol!=='owner'/);
assert.match(source,/solicitud\.estado!=='pendiente_captura'/);
assert.match(source,/\.eq\('estado','pendiente_captura'\)/);
assert.match(source,/\.select\('id'\)/);
assert.doesNotMatch(hub,/↻ Actualizar huellas/);
assert.doesNotMatch(source,/digital_access_manage|garbage_window_manage|registrar_huella_esp32/);

async function escenario(rol,estado){
 let borrados=0,confirmados=0,avisos=[];
 const perfil={rol,activo:true,estado_registro:'aprobado',casa_id:'house'};
 const user={id:'actor'};
 const fila={innerHTML:''};
 const rows=[{id:'request',residente_id:'resident',casa_id:'house',
    dedo:'pulgar_derecho',estado,created_at:'2026-11-13T00:00:00.000Z'}];
 const sb={from(tabla){
  assert.equal(tabla,'solicitudes_huella');
  return {
   select(){return this},order(){return this},limit(){return Promise.resolve({data:rows,error:null})},
   delete(){borrados++;return this},eq(){return this},
   then(done,fail){return Promise.resolve({data:[{id:'request'}],error:null}).then(done,fail)}
  };
 }};
 const init=new Function('profile','user','profiles','document','isAdminProfileRole',
  'casaNumero','casaPorId','sb','esc','alert','confirm','window',
  source+'\nreturn {set:items=>{bioSolicitudesActuales=items},act:eliminarSolicitudHuellaSistemaAdmin};');
 const state=init(perfil,user,[{id:'resident',nombre:'Prueba'}],
  {getElementById:id=>id==='bioAdminSolicitudes'?fila:null},()=>true,()=>63,
  ()=>({activo:true}),sb,x=>String(x),x=>avisos.push(x),
  ()=>{confirmados++;return true},{solicitudesUnificadasActualizar:()=>{}});
 state.set(rows);
 await state.act('request');
 return {borrados,confirmados,avisos};
}
const propietario=await escenario('owner','pendiente_captura');
assert.equal(propietario.borrados,1);
assert.equal(propietario.confirmados,1);
const administrador=await escenario('admin','pendiente_captura');
assert.equal(administrador.borrados,0);
assert.equal(administrador.confirmados,0);
const registrada=await escenario('owner','registrada');
assert.equal(registrada.borrados,0);
assert.equal(registrada.confirmados,0);
console.log('PASS: Sistema Admin borra pendientes; admin y huellas registradas protegidos.');
