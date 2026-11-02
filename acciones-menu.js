/* Administración Residencial · menús de acciones reutilizables.
 * Presentación: conserva los botones originales (y sus permisos/onclick/delegación).
 * Convierte SOLO las columnas "Acción/Acciones/Opciones/Funciones" de las tablas,
 * no los controles digitales, formularios ni acciones urgentes fuera de tablas.
 */
(function(){
  'use strict';

  const SOURCE_CLASS='ar-action-source';
  const CELL_CLASS='ar-action-cell';
  const BUTTON_CLASS='ar-action-trigger';
  const POP_CLASS='ar-action-popup';
  const HEADER_RE=/^(accion|acciones|opciones|funciones)$/;
  let pop=null,activeTrigger=null,activeCell=null,activeOriginals=[];
  let pending=false;

  function label(text){
    return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim().toLowerCase();
  }
  function actionColumnIndexes(table){
    const head=table.tHead;
    if(!head||!head.rows.length)return [];
    const row=head.rows[head.rows.length-1];
    const result=[];
    let index=0;
    for(const cell of row.cells){
      const txt=label(cell.textContent);
      if(HEADER_RE.test(txt))result.push(index);
      index+=Math.max(1,Number(cell.colSpan)||1);
    }
    return result;
  }
  function actionElements(source){
    return [...source.querySelectorAll('button,a[href],[role="button"]')].filter(el=>
      !el.matches('.ar-action-trigger,[data-ar-skip]') &&
      // La fuente tiene aria-hidden y display:none para no duplicar botones
      // accesibles; eso NO debe excluir a las acciones originales.
      !el.hidden && el.getAttribute('aria-hidden')!=='true' &&
      el.style.display!=='none' && !el.classList.contains('hidden')
    );
  }
  function targetLabel(el){
    return (el.getAttribute('aria-label')||el.getAttribute('title')||
      el.textContent||'Acción').replace(/\s+/g,' ').trim().slice(0,130)||'Acción';
  }
  function isDanger(el){
    return el.matches('.danger,.btn-danger,[data-danger="true"]') ||
      /(?:eliminar|borrar|rechazar|suspender|cancelar|desactivar|archivar)/i.test(targetLabel(el));
  }
  function createPopup(){
    if(pop)return;
    pop=document.createElement('div');
    pop.className=POP_CLASS;
    pop.setAttribute('role','menu');
    pop.setAttribute('aria-label','Opciones de la fila');
    pop.setAttribute('tabindex','-1');
    pop.hidden=true;
    document.body.appendChild(pop);
  }
  function closeMenu(restoreFocus=false){
    if(!pop||pop.hidden)return;
    pop.hidden=true;
    pop.replaceChildren();
    if(activeTrigger){
      activeTrigger.setAttribute('aria-expanded','false');
      activeTrigger.classList.remove('ar-open');
      if(restoreFocus && activeTrigger.isConnected)activeTrigger.focus();
    }
    activeCell=null;activeTrigger=null;activeOriginals=[];
  }
  function positionPopup(){
    if(!pop||pop.hidden||!activeTrigger?.isConnected)return;
    const r=activeTrigger.getBoundingClientRect();
    const viewport=window.visualViewport;
    const leftEdge=viewport?viewport.offsetLeft:0;
    const topEdge=viewport?viewport.offsetTop:0;
    const width=viewport?viewport.width:window.innerWidth;
    const height=viewport?viewport.height:window.innerHeight;
    const padding=9;
    // max-height y scroll mantienen los controles utilizables incluso con teclado iOS.
    const maxHeight=Math.max(120,height-2*padding);
    pop.style.maxHeight=maxHeight+'px';
    const naturalWidth=Math.min(270,Math.max(190,width-2*padding));
    pop.style.width=naturalWidth+'px';
    const rect=pop.getBoundingClientRect();
    const targetLeft=r.right-rect.width;
    pop.style.left=Math.max(leftEdge+padding,Math.min(targetLeft,leftEdge+width-rect.width-padding))+'px';
    const spaceBelow=topEdge+height-r.bottom;
    const spaceAbove=r.top-topEdge;
    const fitsBelow=spaceBelow>=rect.height+10;
    const y=fitsBelow||spaceBelow>=spaceAbove?r.bottom+6:r.top-rect.height-6;
    pop.style.top=Math.max(topEdge+padding,Math.min(y,topEdge+height-rect.height-padding))+'px';
  }
  function openMenu(trigger,cell){
    createPopup();
    if(activeTrigger===trigger&&!pop.hidden){closeMenu(true);return;}
    closeMenu(false);
    const source=cell.querySelector(':scope > .'+SOURCE_CLASS);
    if(!source)return;
    const originals=actionElements(source);
    if(!originals.length)return;
    activeTrigger=trigger;activeCell=cell;activeOriginals=originals;
    pop.replaceChildren();
    for(const original of originals){
      const item=document.createElement('button');
      item.type='button';
      item.setAttribute('role','menuitem');
      item.className='ar-action-item'+(isDanger(original)?' ar-danger':'');
      item.textContent=targetLabel(original);
      item.disabled=original.matches(':disabled,[aria-disabled="true"]');
      item.addEventListener('click',()=>{
        // Cerrar antes de ejecutar: las acciones existentes pueden rerenderizar la fila.
        closeMenu();
        if(original.isConnected && !original.matches(':disabled,[aria-disabled="true"]')){
          // Click sobre el botón ORIGINAL para preservar onclick, dataset,
          // eventos delegados y comprobaciones actuales de autorización.
          original.click();
        }
      });
      pop.appendChild(item);
    }
    pop.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    trigger.classList.add('ar-open');
    positionPopup();
    const first=pop.querySelector('button:not(:disabled)');
    if(first)first.focus({preventScroll:true});
  }
  function processCell(cell){
    if(cell.classList.contains(CELL_CLASS))return;
    if(cell.querySelector('select,input,textarea,[contenteditable="true"]'))return;
    const originals=[...cell.querySelectorAll('button,a[href],[role="button"]')]
      .filter(el=>!el.closest('form')&&!el.closest('[hidden]')&&!el.matches('[data-ar-skip]'));
    if(!originals.length)return;
    // No tocar celdas que incluyan controles más complejos (p.ej. formularios).
    const source=document.createElement('span');
    source.className=SOURCE_CLASS;
    source.setAttribute('aria-hidden','true');
    // Los nodos originales permanecen dentro de la celda:
    // el onclick y el event bubbling continúan funcionando.
    while(cell.firstChild)source.appendChild(cell.firstChild);
    cell.appendChild(source);
    const trigger=createTrigger(cell);
    cell.appendChild(trigger);
    cell.classList.add(CELL_CLASS);
  }
  function createTrigger(cell){
    const trigger=document.createElement('button');
    trigger.type='button';
    trigger.className=BUTTON_CLASS;
    trigger.textContent='⋮';
    trigger.setAttribute('aria-label','Ver acciones');
    trigger.setAttribute('title','Ver acciones');
    trigger.setAttribute('aria-haspopup','menu');
    trigger.setAttribute('aria-expanded','false');
    trigger.addEventListener('click',event=>{
      event.stopPropagation();
      openMenu(trigger,cell);
    });
    return trigger;
  }
  function processCard(card){
    if(card.dataset.arActionCard==='1')return;
    const buttons=[...card.children].filter(el=>el.tagName==='BUTTON'&&!el.matches('[data-ar-skip]'));
    if(!buttons.length)return;
    const area=document.createElement('div');
    area.className='ar-card-action-control';
    const source=document.createElement('span');
    source.className=SOURCE_CLASS;
    source.setAttribute('aria-hidden','true');
    for(const button of buttons)source.appendChild(button);
    area.appendChild(source);
    area.appendChild(createTrigger(area));
    card.appendChild(area);
    card.dataset.arActionCard='1';
  }
  function refresh(){
    pending=false;
    document.querySelectorAll('table').forEach(table=>{
      const cols=actionColumnIndexes(table);
      if(!cols.length)return;
      for(const body of table.tBodies){
        for(const row of body.rows){
          if(row.querySelector('td[colspan]'))continue;
          for(const col of cols){
            const cell=row.cells[col];
            if(cell && cell.tagName==='TD')processCell(cell);
          }
        }
      }
    });
    document.querySelectorAll('#disciplinaLista > article.card, #avisosLista > .card.notice')
      .forEach(processCard);
    if(activeTrigger && !activeTrigger.isConnected)closeMenu();
  }
  function schedule(){
    if(pending)return;
    pending=true;
    window.requestAnimationFrame(refresh);
  }
  function setup(){
    if(document.documentElement.dataset.arMenuReady==='1')return;
    document.documentElement.dataset.arMenuReady='1';
    createPopup();
    document.addEventListener('pointerdown',event=>{
      if(!pop.hidden && !pop.contains(event.target) &&
         !(activeTrigger && activeTrigger.contains(event.target)))closeMenu();
    },true);
    document.addEventListener('keydown',event=>{
      if(pop.hidden)return;
      if(event.key==='Escape'){event.preventDefault();closeMenu(true);return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        const items=[...pop.querySelectorAll('button:not(:disabled)')];
        if(!items.length)return;
        const idx=items.indexOf(document.activeElement);
        const next=(idx+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        items[next].focus();
      }
    });
    window.addEventListener('scroll',()=>closeMenu(),true);
    window.addEventListener('resize',()=>closeMenu());
    window.visualViewport?.addEventListener('resize',()=>closeMenu());
    const observer=new MutationObserver(records=>{
      // Ignorar cambios exclusivamente del propio panel flotante.
      if(records.every(x=>pop.contains(x.target)))return;
      schedule();
    });
    observer.observe(document.body,{subtree:true,childList:true});
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
  window.administracionMenuAcciones={actualizar:schedule,cerrar:closeMenu};
})();
