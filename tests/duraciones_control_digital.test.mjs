import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js=fs.readFileSync(new URL('../duraciones-control-digital.js', import.meta.url), 'utf8');
const parcel=fs.readFileSync(new URL('../paqueteria-evento.js', import.meta.url), 'utf8');
const db=fs.readFileSync(new URL('../database/duraciones_control_digital_owner_20261123.sql', import.meta.url), 'utf8');

assert.match(html,/id="digitalDurationSettingsBtn"[^>]*class="ownerOnly hidden"/);
assert.match(html,/id="digitalDurationsDialog"/);
assert.match(html,/id="durationGarbageMinutes"[^>]*min="1" max="20"/);
assert.match(html,/id="durationParcelMinutes"[^>]*min="1" max="3"/);
assert.match(html,/duraciones-control-digital\.js\?v=1/);
assert.match(html,/basuraEstado\?\.duration_seconds/);
assert.match(parcel,/current\?\.duration_seconds/);
assert.match(js,/access_window_durations_get/);
assert.match(js,/access_window_durations_set/);
assert.match(js,/document\.body\.dataset\.sessionRole==='owner'/);
assert.match(js,/document\.body\.dataset\.ownerPanel==='owner'/);
assert.match(db,/rol='owner'/);
assert.match(db,/p_garbage_minutes not between 1 and 20/);
assert.match(db,/p_parcel_minutes not between 1 and 3/);
assert.match(db,/pg_advisory_xact_lock/);
assert.match(db,/enable row level security/);
assert.match(db,/garbage_minutes from public\.access_window_durations/);
assert.match(db,/parcel_minutes from public\.access_window_durations/);
assert.match(db,/public\.access_window_durations_audit/);
assert.doesNotMatch(js,/digital_access_request|gpio_set_level/);
console.log('PASS: ventana de configuración, permisos owner, límites y contadores dinámicos');
