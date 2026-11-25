// Control Digital: toque breve para activar; pulsación sostenida para cancelar.
// El servidor sigue siendo la autoridad para identidad, permisos, horario y estado.
(() => {
  'use strict';
  const HOLD_MS = 1500;
  const MOVE_CANCEL_PX = 18;

  function bindButton(id, activeClass, toggle) {
    const button = document.getElementById(id);
    if(!button || button.dataset.holdBound === '1') return;
    button.dataset.holdBound = '1';

    let holdTimer = null;
    let holdingPointer = null;
    let holdingKey = null;
    let startX = 0;
    let startY = 0;
    let suppressNextClick = false;
    let suppressTimer = null;

    const isActive = () => !button.disabled && button.classList.contains(activeClass);
    const clearHold = () => {
      if(holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      button.classList.remove('digitalHoldArming');
    };
    const suppressClick = () => {
      suppressNextClick = true;
      if(suppressTimer !== null) clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressNextClick = false; suppressTimer = null; }, 850);
    };
    const startHold = () => {
      clearHold();
      if(!isActive()) return;
      button.classList.add('digitalHoldArming');
      holdTimer = setTimeout(() => {
        holdTimer = null;
        button.classList.remove('digitalHoldArming');
        if(!isActive()) return;
        suppressClick(); // Evitar que el click generado al soltar reactive la ventana.
        void toggle('hold');
      }, HOLD_MS);
    };

    button.addEventListener('click', event => {
      if(!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    button.addEventListener('pointerdown', event => {
      if(holdingPointer !== null || (event.button !== undefined && event.button !== 0) ||
        !isActive()) return;
      holdingPointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startHold();
      try { button.setPointerCapture?.(event.pointerId); } catch(_){}
    });
    button.addEventListener('pointermove', event => {
      if(holdingPointer !== event.pointerId) return;
      if(Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_CANCEL_PX)
        clearHold();
    });
    const finishPointer = event => {
      if(holdingPointer !== event.pointerId) return;
      holdingPointer = null;
      clearHold();
      try {
        if(button.hasPointerCapture?.(event.pointerId))
          button.releasePointerCapture(event.pointerId);
      } catch(_){}
    };
    button.addEventListener('pointerup', finishPointer);
    button.addEventListener('pointercancel', finishPointer);
    button.addEventListener('lostpointercapture', event => {
      if(holdingPointer === event.pointerId) {
        holdingPointer = null;
        clearHold();
      }
    });
    button.addEventListener('contextmenu', event => {
      if(holdingPointer === null && holdingKey === null) return;
      event.preventDefault();
    });

    // Compatible con teclado: mantener Espacio o Enter durante 1.5 segundos.
    button.addEventListener('keydown', event => {
      if(![' ', 'Enter'].includes(event.key) || !isActive()) return;
      event.preventDefault(); // Suprimir la activación de click nativa mientras está activa.
      if(holdingKey !== null || event.repeat) return;
      holdingKey = event.key;
      startHold();
    });
    button.addEventListener('keyup', event => {
      if(event.key !== holdingKey) return;
      event.preventDefault();
      holdingKey = null;
      clearHold();
    });
    button.addEventListener('blur', () => {
      holdingKey = null;
      holdingPointer = null;
      clearHold();
    });
    document.addEventListener('visibilitychange', () => {
      if(document.hidden) {
        holdingKey = null;
        holdingPointer = null;
        clearHold();
      }
    });
  }

  function init() {
    bindButton('basuraStartBtn', 'basuraActiva', mode => window.basuraAlternar?.(mode));
    bindButton('paqueteriaStartBtn', 'paqueteriaActiva', mode => window.paqueteriaAlternar?.(mode));
  }
  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
