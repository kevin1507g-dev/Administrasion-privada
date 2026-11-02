// Ejecutar localmente: node tests/acciones_menu.test.mjs
// Usa únicamente Node.js y un DOM simulado. No toca Supabase ni ejecuta operaciones reales.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../acciones-menu.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../acciones-menu.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
new Function(code);
assert.match(html,/acciones-menu\.js\?v=1/);
assert.match(html,/acciones-menu\.css\?v=1/);
assert.match(css,/position:fixed!important/);
assert.doesNotMatch(css,/inset:auto!important/);
assert.match(code,/new MutationObserver/);
assert.doesNotMatch(code,/sb\.rpc\(|sb\.from\(/);

class Element {
 constructor(tag,text=''){this.tagName=tag.toUpperCase();this.text=text;this.children=[];this.parentNode=null;this.attributes={};this.style={};this.hidden=false;this.disabled=false;this.dataset={};this.listeners={};this.className='';this.colSpan=1;}
 get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}
 set textContent(x){this.text=String(x);this.replaceChildren();}
 get firstChild(){return this.children[0]||null;}
 get isConnected(){let x=this;while(x){if(x===document.body)return true;x=x.parentNode;}return false;}
 get classList(){const e=this;return {contains:x=>e.className.split(' ').includes(x),add:x=>{if(!e.className.split(' ').includes(x))e.className+=' '+x;},remove:x=>e.className=e.className.split(' ').filter(y=>y!==x).join(' ')};}
 appendChild(x){if(x.parentNode)x.parentNode.removeChild(x);this.children.push(x);x.parentNode=this;return x;}
 removeChild(x){this.children=this.children.filter(y=>y!==x);x.parentNode=null;}
 replaceChildren(...items){for(const x of this.children)x.parentNode=null;this.children=[];items.forEach(x=>this.appendChild(x));}
 setAttribute(k,v){this.attributes[k]=String(v);}
 getAttribute(k){return this.attributes[k]??null;}
 matches(q){
  if(q===':disabled,[aria-disabled="true"]')return this.disabled||this.getAttribute('aria-disabled')==='true';
  if(q==='.danger,.btn-danger,[data-danger="true"]')return this.classList.contains('danger');
  if(q==='[data-ar-skip]'||q==='.ar-action-trigger,[data-ar-skip]')return !!this.attributes['data-ar-skip']||this.classList.contains('ar-action-trigger');
  return false;
 }
 closest(q){let x=this;while(x){if(q==='form'&&x.tagName==='FORM')return x;if(q==='[hidden]'&&x.hidden)return x;x=x.parentNode;}return null;}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
 click(){if(this.disabled)return;this.clickCount=(this.clickCount||0)+1;(this.listeners.click||[]).forEach(f=>f({target:this,stopPropagation(){}}));}
 focus(){document.activeElement=this;}
 querySelectorAll(q){
  const a=[];function visit(x){for(const c of x.children){a.push(c);visit(c);}}visit(this);
  if(q==='button,a[href],[role="button"]')return a.filter(x=>['BUTTON','A'].includes(x.tagName));
  if(q==='button:not(:disabled)')return a.filter(x=>x.tagName==='BUTTON'&&!x.disabled);
  return [];
 }
 querySelector(q){
  if(q==='select,input,textarea,[contenteditable="true"]')return null;
  if(q===':scope > .ar-action-source')return this.children.find(x=>x.classList.contains('ar-action-source'))||null;
  if(q==='button:not(:disabled)')return this.querySelectorAll(q)[0]||null;
  return null;
 }
 getBoundingClientRect(){return {top:180,left:300,right:342,bottom:222,width:200,height:this.tagName==='DIV'?120:42};}
}
const document={
 body:new Element('body'),documentElement:{dataset:{}},readyState:'complete',
 activeElement:null,createElement:t=>new Element(t),addEventListener(){},
 querySelectorAll(q){
  if(q==='table')return [table];
  if(q.startsWith('#disciplinaLista'))return [card];
  return [];
 }
};
const table=new Element('table'),head=new Element('thead'),headrow=new Element('tr'),
 tbody=new Element('tbody'),row=new Element('tr'),name=new Element('td'),
 actions=new Element('td'),t0=new Element('th','Casa'),t1=new Element('th','Acciones');
const edit=new Element('button','Editar vencimiento'),remove=new Element('button','🗑️ Eliminar');
remove.className='danger';
headrow.cells=[t0,t1];head.rows=[headrow];table.tHead=head;
row.cells=[name,actions];tbody.rows=[row];table.tBodies=[tbody];
for(const [a,b] of [[table,head],[table,tbody],[head,headrow],[headrow,t0],[headrow,t1],
 [tbody,row],[row,name],[row,actions],[actions,edit],[actions,remove]])a.appendChild(b);
document.body.appendChild(table);
const card=new Element('article'),cardButton=new Element('button','Descargar PDF');
card.className='card';card.appendChild(cardButton);document.body.appendChild(card);
const window={innerWidth:390,innerHeight:800,addEventListener(){},requestAnimationFrame(cb){cb();}};
class MutationObserver{observe(){}}
new Function('document','window','MutationObserver',code)(document,window,MutationObserver);
const trigger=actions.children.find(x=>x.classList.contains('ar-action-trigger'));
assert(trigger);assert.equal(trigger.textContent,'⋮');
assert(actions.children.find(x=>x.classList.contains('ar-action-source')).hidden);
assert(edit.isConnected);
trigger.click();
const popup=document.body.children.find(x=>x.className==='ar-action-popup');
assert.equal(popup.hidden,false);
assert.deepEqual(popup.children.map(x=>x.textContent),['Editar vencimiento','🗑️ Eliminar']);
popup.children[0].click();
assert.equal(edit.clickCount,1);
assert.equal(remove.clickCount||0,0);
assert.equal(popup.hidden,true);
const cardTrigger=card.children.find(x=>x.classList.contains('ar-card-action-control')).children.find(x=>x.classList.contains('ar-action-trigger'));
cardTrigger.click();popup.children[0].click();assert.equal(cardButton.clickCount,1);
// Refrescos: una fila nueva debe recibir el mismo menú sin reinicializar la app.
const second=new Element('tr'),secondName=new Element('td'),secondActions=new Element('td');
const secondButton=new Element('button','Aprobar');
secondActions.appendChild(secondButton);second.appendChild(secondName);second.appendChild(secondActions);
second.cells=[secondName,secondActions];tbody.rows.push(second);tbody.appendChild(second);
window.administracionMenuAcciones.actualizar();
assert(secondActions.children.some(x=>x.classList.contains('ar-action-trigger')));
console.log('PASS: tabla, menú de 3 puntos, acciones originales, tarjeta y refresco dinámico.');
