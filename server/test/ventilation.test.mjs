import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteHumidity, evaluateRoom, sanitizeVentilation, autoRooms, kioskRooms, ventilationStateIds, VentilationService } from '../src/ventilation.js';

const cfg = sanitizeVentilation({ enabled: true });
const room = (o) => ({ temperature: 21, humidity: 50, co2: null, windowOpen: null, ...o });

test('absolute humidity (Magnus)', () => {
  assert.ok(Math.abs(absoluteHumidity(20, 50) - 8.6) < 0.1);
  assert.ok(Math.abs(absoluteHumidity(0, 100) - 4.8) < 0.1);
  assert.equal(absoluteHumidity(null, 50), null);
});

test('humid room: ventilate only if the outdoor air is drier', () => {
  const cold = { temperature: 5, humidity: 85 }; // ~5.8 g/m³
  const muggy = { temperature: 24, humidity: 80 }; // ~17.4 g/m³
  const r = evaluateRoom(room({ humidity: 65 }), cold, cfg); // ~11.9 g/m³
  assert.equal(r.status, 'ventilate');
  assert.deepEqual(r.reasons, ['humidity']);
  const m = evaluateRoom(room({ humidity: 65 }), muggy, cfg);
  assert.equal(m.status, 'ok');
  assert.equal(m.humidOutside, true);
});

test('CO₂ with hysteresis and warning level', () => {
  const out = { temperature: 10, humidity: 70 };
  assert.equal(evaluateRoom(room({ co2: 990 }), out, cfg).status, 'ok');
  const r = evaluateRoom(room({ co2: 1100 }), out, cfg);
  assert.deepEqual([r.status, r.severity], ['ventilate', 'info']);
  assert.equal(evaluateRoom(room({ co2: 950 }), out, cfg, r).status, 'ventilate'); // within 100 ppm
  assert.equal(evaluateRoom(room({ co2: 890 }), out, cfg, r).status, 'ok');
  assert.equal(evaluateRoom(room({ co2: 1500 }), out, cfg).severity, 'warning');
});

test('open window: airing instead of a hint, close it when the outdoor air is more humid', () => {
  const out = { temperature: 10, humidity: 70 };
  assert.equal(evaluateRoom(room({ co2: 1200, windowOpen: true }), out, cfg).status, 'airing');
  const muggy = { temperature: 26, humidity: 85 };
  assert.equal(evaluateRoom(room({ windowOpen: true }), muggy, cfg).status, 'close');
  assert.equal(evaluateRoom(room({ windowOpen: false }), muggy, cfg).status, 'ok');
});

test('cooling only when enabled', () => {
  const hot = room({ temperature: 27, humidity: 45 });
  const evening = { temperature: 19, humidity: 60 };
  assert.equal(evaluateRoom(hot, evening, cfg).status, 'ok');
  assert.deepEqual(evaluateRoom(hot, evening, { ...cfg, cooling: true }).reasons, ['cooling']);
  assert.equal(evaluateRoom(hot, { temperature: 26, humidity: 60 }, { ...cfg, cooling: true }).status, 'ok');
});

test('rooms are derived from the devices when none are configured', () => {
  const full = {
    rooms: [{ id: 'wz', name: 'Wohnzimmer' }, { id: 'garten', name: 'Garten' }, { id: 'bad', name: 'Bad' }],
    devices: [
      { id: 'a', type: 'sensor', room: 'wz', states: { value: 'h.wz' }, options: { kind: 'humidity' } },
      { id: 'b', type: 'thermostat', room: 'wz', states: { current: 't.wz' }, options: {} },
      { id: 'c', type: 'sensor', room: 'garten', states: { value: 'h.g' }, options: { kind: 'humidity' } },
      { id: 'd', type: 'sensor', room: 'wz', states: { value: 'w.wz' }, options: { kind: 'window' } },
    ],
    weather: { states: { temperature: 'out.t', humidity: 'out.h' } },
    ventilation: { enabled: true },
  };
  assert.deepEqual(autoRooms(full), [{ id: 'wz', room: 'wz', name: '', temperature: 't.wz', humidity: 'h.wz', co2: '', window: 'w.wz' }]);
  assert.deepEqual(ventilationStateIds(full).sort(), ['h.wz', 'out.h', 'out.t', 't.wz', 'w.wz']);
  assert.deepEqual(ventilationStateIds({ ...full, ventilation: { enabled: false } }), []);
});

test('service: hints, internet fallback for the outdoor air', async () => {
  const values = { 'h.wz': 68, 't.wz': 21, 'co2.wz': 700 };
  const full = {
    rooms: [{ id: 'wz', name: 'Wohnzimmer' }],
    devices: [],
    weather: { states: {} },
    ventilation: { enabled: true, rooms: [{ id: 'wz', room: 'wz', temperature: 't.wz', humidity: 'h.wz', co2: 'co2.wz' }] },
  };
  let fetched = 0;
  const svc = new VentilationService({
    getConfig: () => full,
    getValue: (id) => values[id],
    fetchOutdoor: async () => {
      fetched++;
      return { temperature: 4, humidity: 80 };
    },
  });
  const changed = new Promise((resolve) => svc.once('change', resolve));
  svc.configure(); // no outdoor sensor: internet weather is fetched in the background
  await changed;
  await new Promise((r) => setImmediate(r));
  assert.equal(fetched, 1);
  const data = svc.data();
  assert.equal(data.outdoor.source, 'internet');
  assert.equal(data.rooms[0].status, 'ventilate');
  assert.equal(data.rooms[0].name, 'Wohnzimmer');
  const [hint] = svc.hints();
  assert.equal(hint.id, 'ventilation:wz:ventilate');
  assert.equal(hint.view, 'rooms');
  assert.match(hint.message, /^Wohnzimmer lüften: Luftfeuchte 68 %/);
  values['h.wz'] = 50;
  svc.evaluate();
  assert.deepEqual(svc.hints(), []);
  svc.stop();
});

test('wall displays with CO₂ take part automatically, offline ones without a value', () => {
  const agents = [
    { id: 'flur', name: 'Flur', online: true, values: { co2: 1500 } },
    { id: 'kueche', name: 'Küche', online: false, values: { co2: 1500 } },
    { id: 'bad', name: 'Bad', online: true, values: {} },
    { id: 'buero', name: 'Büro', online: true, values: { co2: 900 } },
  ];
  assert.deepEqual(kioskRooms(agents, [{ co2: 'homeapp.kiosk.buero.co2' }]), [
    { id: 'kiosk_flur', room: '', name: 'Flur', kioskCo2: 1500 },
    { id: 'kiosk_kueche', room: '', name: 'Küche', kioskCo2: null },
    { id: 'kiosk_bad', room: '', name: 'Bad', kioskCo2: null },
  ]);
});

test('service: CO₂ of a wall display raises a warning (banner) above co2Warn', () => {
  const agent = { id: 'flur', name: 'Flur', online: true, values: { co2: 1200 } };
  const full = { rooms: [], devices: [], weather: { states: {} }, ventilation: { enabled: true } };
  const svc = new VentilationService({ getConfig: () => full, getValue: () => undefined, fetchOutdoor: async () => null, getKioskAgents: () => [agent] });
  svc.configure();
  let [hint] = svc.hints();
  assert.deepEqual([hint.id, hint.severity, hint.message], ['ventilation:kiosk_flur:ventilate', 'info', 'Flur lüften: CO₂ 1200 ppm']);
  agent.values.co2 = 1500;
  svc.evaluate();
  [hint] = svc.hints();
  assert.equal(hint.severity, 'warning');
  agent.online = false;
  svc.evaluate();
  assert.deepEqual(svc.hints(), []);
  full.ventilation = { enabled: false };
  agent.online = true;
  svc.configure();
  assert.deepEqual(svc.hints(), []);
  svc.stop();
});

test('service: kiosk CO₂ readings trigger an evaluation', () => {
  const svc = new VentilationService({ getConfig: () => ({ rooms: [], devices: [], ventilation: { enabled: true } }), getValue: () => undefined });
  svc.configure();
  svc.onState('homeapp.kiosk.flur.temperature');
  assert.equal(svc.debounce, null);
  svc.onState('homeapp.kiosk.flur.co2');
  assert.ok(svc.debounce);
  svc.stop();
});
