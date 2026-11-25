import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const parcel = readFileSync(new URL('../paqueteria-evento.js', import.meta.url), 'utf8');
const gesture = readFileSync(new URL('../control-digital-pulsacion.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('botones de basura y paquetería: toque activa, pulsación larga cancela', () => {
  assert.match(html, /onclick="basuraAlternar\('tap'\)"/);
  assert.match(html, /onclick="paqueteriaAlternar\('tap'\)"/);
  assert.match(html, /async function basuraAlternar\(modo='tap'\)/);
  assert.match(html, /accion==='start'&&modo!=='tap'/);
  assert.match(html, /accion==='stop'&&modo!=='hold'/);
  assert.match(parcel, /async function toggle\(mode='tap'\)/);
  assert.match(parcel, /intended==='start'&&mode!=='tap'/);
  assert.match(parcel, /intended==='stop'&&mode!=='hold'/);
  assert.match(gesture, /HOLD_MS = 1500/);
  assert.match(gesture, /pointercancel/);
  assert.match(gesture, /event\.stopImmediatePropagation\(\)/);
  assert.match(gesture, /keydown/);
  assert.match(html, /control-digital-pulsacion\.js\?v=1/);
  assert.match(sw, /v45-mantener-presionado-cancelar/);
  assert.equal((html.match(/Mantén 1\.5 s para cancelar/g) ?? []).length, 2);
});

test('el gesto de cancelación no se activa con un toque breve', () => {
  const listeners = new Map();
  const timers = new Map();
  let clock = 0, id = 0;
  const addTimer = (fn, ms) => { const key = ++id; timers.set(key, { time: clock + ms, fn }); return key; };
  const clearTimer = key => timers.delete(key);
  const advance = ms => {
    const end = clock + ms;
    while (true) {
      const due = [...timers].filter(([, task]) => task.time <= end)
        .sort((a,b) => a[1].time-b[1].time)[0];
      if (!due) break;
      clock = due[1].time;
      timers.delete(due[0]);
      due[1].fn();
    }
    clock = end;
  };
  const classes = new Set(['basuraActiva']);
  const button = {
    dataset: {}, disabled: false,
    classList: { contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x) },
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
    setPointerCapture() {}, hasPointerCapture() { return true; }, releasePointerCapture() {}
  };
  const document = {
    readyState: 'complete', hidden: false,
    getElementById: x => x === 'basuraStartBtn' ? button : null,
    addEventListener() {}
  };
  const actions = [];
  const window = { basuraAlternar: action => actions.push(action) };
  new Function('document', 'window', 'setTimeout', 'clearTimeout', gesture)(
    document, window, addTimer, clearTimer
  );
  const fire = (event, props = {}) => {
    const e = {
      pointerId: 1, button: 0, clientX: 100, clientY: 100,
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; }, ...props
    };
    for (const fn of listeners.get(event) ?? []) {
      if (e.stopped) break;
      fn(e);
    }
    return e;
  };
  fire('pointerdown'); advance(800); fire('pointerup'); fire('click');
  assert.deepEqual(actions, []);
  fire('pointerdown'); advance(1500); fire('pointerup');
  assert.equal(fire('click').stopped, true);
  assert.deepEqual(actions, ['hold']);
  fire('pointerdown'); fire('pointermove', {clientX: 151}); advance(1800); fire('pointerup');
  assert.deepEqual(actions, ['hold']);
  fire('keydown', {key: ' '}); advance(1500); fire('keyup', {key: ' '});
  assert.deepEqual(actions, ['hold', 'hold']);
});
