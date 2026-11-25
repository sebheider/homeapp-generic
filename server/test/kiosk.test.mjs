import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { KioskHub, agentId, sanitizeKiosk, sanitizeWindows, freshAlerts, isKioskId, registerKioskReport, demoKioskReport, cleanRadar, demoRadarFrame } from '../src/kiosk.js';
import { registerApiRoutes } from '../src/api.js';

test('reports become local datapoints, invalid values are ignored', () => {
  let now = 1000;
  const hub = new KioskHub({ now: () => now, offlineMs: 5000 });
  const events = [];
  hub.on('state', (id, e) => events.push([id, e.val]));
  hub.report({ id: 'Flur', name: 'Flur', sensors: { presence: true, lux: 12.34, co2: 'viel', humidity: 140, temperature: '21.26' }, display: { on: true, brightness: 60 } });
  assert.equal(hub.states.get('homeapp.kiosk.flur.lux').val, 12.3);
  assert.equal(hub.states.get('homeapp.kiosk.flur.temperature').val, 21.3);
  assert.equal(hub.states.get('homeapp.kiosk.flur.presence').val, true);
  assert.equal(hub.states.get('homeapp.kiosk.flur.screen').val, true);
  assert.equal(hub.states.has('homeapp.kiosk.flur.co2'), false);
  assert.equal(hub.states.has('homeapp.kiosk.flur.humidity'), false);
  // unchanged values are not emitted again
  const n = events.length;
  hub.report({ id: 'flur', sensors: { presence: true, lux: 12.3 } });
  assert.equal(events.length, n);
  assert.deepEqual(hub.search('flur lux').map((o) => o.id), ['homeapp.kiosk.flur.lux']);
  // offline: presence is released
  now += 6000;
  hub.checkOffline();
  assert.equal(hub.states.get('homeapp.kiosk.flur.online').val, false);
  assert.equal(hub.states.get('homeapp.kiosk.flur.presence').val, false);
  assert.equal(hub.list()[0].online, false);
  hub.remove('flur');
  assert.equal(hub.states.size, 0);
  hub.stop();
});

test('agent ids and settings are validated', () => {
  assert.equal(agentId('Küche'), null);
  assert.equal(agentId('wand-1'), 'wand-1');
  assert.equal(isKioskId('homeapp.kiosk.a.lux'), true);
  assert.equal(isKioskId('hm-rpc.0.x'), false);
  const s = sanitizeKiosk({ screenOffSeconds: 1, luxDark: 50, luxBright: 10, minBrightness: 0 });
  assert.equal(s.screenOffSeconds, 10);
  assert.equal(s.luxBright, 51);
  assert.equal(s.minBrightness, 1);
  assert.equal(sanitizeKiosk().screenOff, true);
  const hub = new KioskHub();
  assert.throws(() => hub.report({ id: '../x' }), /Agent-ID/);
  hub.report(demoKioskReport(Date.UTC(2026, 5, 1, 12)));
  assert.equal(hub.list()[0].id, 'demo');
  hub.stop();
});

async function listen(t, app) {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('report route checks the token and answers with the agent settings', async (t) => {
  const hub = new KioskHub();
  t.after(() => hub.stop());
  const app = express();
  app.use(express.json());
  registerKioskReport(app, { hub, getToken: () => 'secret', getSettings: () => ({ screenOffSeconds: 60 }) });
  const base = await listen(t, app);
  const post = (q, body, headers = {}) => fetch(`${base}/api/kiosk/report${q}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post('?token=wrong', { id: 'a' })).status, 403);
  assert.equal((await post('', { id: 'a' })).status, 403);
  assert.equal((await post('?token=secret', { id: '!' })).status, 400);
  const ok = await post('', { id: 'wand', sensors: { co2: 800 } }, { authorization: 'Bearer secret' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.id, 'wand');
  assert.equal(body.settings.screenOffSeconds, 60);
  assert.equal(body.wake, null);
  assert.equal(hub.states.get('homeapp.kiosk.wand.co2').val, 800);
  // the latest wake is repeated in the answer (for agents without event stream)
  hub.wake({ reason: 'camera', title: 'Haustür' });
  const again = await (await post('?token=secret', { id: 'wand', display: { on: true, wake: true } })).json();
  assert.equal(again.wake.reason, 'camera');
  assert.equal(again.wake.title, 'Haustür');
  assert.ok(again.wake.ageMs >= 0 && again.wake.ageMs < 5000);
  assert.equal(hub.states.get('homeapp.kiosk.wand.wake').val, true);
});

test('schedule settings: always-on times, wake options and quiet hours are cleaned', () => {
  const d = sanitizeKiosk();
  assert.deepEqual(d.alwaysOn, []);
  assert.deepEqual(d.quietHours, [{ days: [0, 1, 2, 3, 4, 5, 6], from: '22:00', to: '06:00' }]);
  assert.equal(d.wakeOnCamera, true);
  assert.equal(d.wakeOnAlerts, true);
  assert.equal(d.wakeSeverity, 'info');
  assert.equal(d.wakeSeconds, 120);
  assert.deepEqual(d.offTimes, []);
  assert.deepEqual(d.dimTimes, []);
  // brightness of the dim times follows min / max until it is set
  assert.equal(d.dimBrightness, 15);
  assert.equal(d.fullBrightness, 100);
  const old = sanitizeKiosk({ minBrightness: 30, maxBrightness: 80 });
  assert.equal(old.dimBrightness, 30);
  assert.equal(old.fullBrightness, 80);
  const own = sanitizeKiosk({ minBrightness: 30, dimBrightness: 0, fullBrightness: 70.4 });
  assert.equal(own.dimBrightness, 1);
  assert.equal(own.fullBrightness, 70);
  assert.deepEqual(sanitizeKiosk({ offTimes: [{ days: [0, 6], from: '23:00', to: '7:00' }] }).offTimes, [{ days: [0, 6], from: '23:00', to: '07:00' }]);
  // explicitly no quiet hours stays empty
  assert.deepEqual(sanitizeKiosk({ quietHours: [] }).quietHours, []);
  const s = sanitizeKiosk({ alwaysOn: [{ days: [5, 1, 1, 9, 'x'], from: '6:30', to: 'abends' }, null], wakeSeverity: 'panic', wakeSeconds: 1, wakeOnCamera: false });
  assert.deepEqual(s.alwaysOn, [{ days: [1, 5], from: '06:30', to: '00:00' }]);
  assert.equal(s.wakeSeverity, 'info');
  assert.equal(s.wakeSeconds, 10);
  assert.equal(s.wakeOnCamera, false);
  assert.equal(sanitizeWindows(new Array(30).fill({ from: '01:00', to: '02:00' })).length, 20);
});

test('only new notifications wake the screens', () => {
  const a = { id: 'bad', since: 1, severity: 'warning' };
  const first = freshAlerts(new Set(), [a]);
  assert.deepEqual(first.fresh, [a]);
  // value updates keep id and start time
  assert.deepEqual(freshAlerts(first.keys, [{ ...a, value: 70 }]).fresh, []);
  // acknowledged or cleared alerts do not wake, a returning one (new since) does
  assert.deepEqual(freshAlerts(new Set(), [{ ...a, acked: true }, { ...a, id: 'x', cleared: true }]).fresh, []);
  assert.equal(freshAlerts(first.keys, [{ ...a, since: 2 }]).fresh.length, 1);
});

test('event stream pushes wakes to the agents', async (t) => {
  let now = 5000;
  const hub = new KioskHub({ now: () => now });
  t.after(() => hub.stop());
  const app = express();
  registerKioskReport(app, { hub, getToken: () => 'secret', getSettings: () => ({}) });
  const base = await listen(t, app);
  assert.equal((await fetch(`${base}/api/kiosk/events?token=wrong`)).status, 403);
  const ctrl = new AbortController();
  t.after(() => ctrl.abort());
  const res = await fetch(`${base}/api/kiosk/events`, { headers: { authorization: 'Bearer secret' }, signal: ctrl.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const until = async (re) => {
    while (!re.test(text)) text += decoder.decode((await reader.read()).value, { stream: true });
  };
  await until(/retry: 5000/);
  const w = hub.wake({ reason: 'alert', severity: 'alarm', title: 'Wasser im Keller' });
  await until(/\n\n.*data: .*\n\n/s);
  const event = JSON.parse(/data: (.*)\n/.exec(text)[1]);
  assert.deepEqual(event, { ...w, ageMs: 0 });
  assert.equal(hub.listenerCount('wake'), 1);
  ctrl.abort();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(hub.listenerCount('wake'), 0);
  // the answer of a report repeats a wake for an hour
  now += 61 * 60 * 1000;
  assert.equal(hub.recentWake(), null);
});

test('API: kiosk datapoints are part of the snapshot, the search and the history, but read-only', async (t) => {
  const hub = new KioskHub();
  t.after(() => hub.stop());
  hub.report({ id: 'wand', sensors: { co2: 800 } });
  const writes = [];
  const app = express();
  app.use(express.json());
  registerApiRoutes(app, {
    store: { publicConfig: () => ({}), stateIds: () => new Set(['light.a', 'homeapp.kiosk.wand.co2']), isDemo: true },
    getSource: () => ({ states: new Map([['light.a', { val: true }]]), set: async (...a) => writes.push(a), search: () => [{ id: 'light.a', name: 'Licht' }] }),
    demo: { history: (id) => [[1, id.length]] },
    history: { query: (ids) => Object.fromEntries(ids.map((id) => [id, [[2, 800]]])) },
    motion: { recent: [] },
    alerts: { list: () => [] },
    printer: { data: null },
    spotify: { current: () => null },
    statusPayload: () => ({}),
    cameraList: () => [],
    kiosk: hub,
    waste: { data: () => ({ enabled: true, upcoming: [] }) },
    ventilation: { data: () => ({ enabled: false, rooms: [] }) },
    allAlerts: () => [{ id: 'waste:2026-11-03' }],
  });
  const base = await listen(t, app);
  const boot = await (await fetch(`${base}/api/bootstrap`)).json();
  assert.equal(boot.states['homeapp.kiosk.wand.co2'].val, 800);
  assert.equal(boot.states['light.a'].val, true);
  assert.deepEqual(boot.alerts, [{ id: 'waste:2026-11-03' }]);
  assert.equal(boot.waste.enabled, true);
  const search = await (await fetch(`${base}/api/iobroker/search?q=wand`)).json();
  assert.equal(search[0].id, 'homeapp.kiosk.wand.co2');
  const hist = await (await fetch(`${base}/api/history?ids=light.a,homeapp.kiosk.wand.co2`)).json();
  assert.deepEqual(hist['homeapp.kiosk.wand.co2'], [[2, 800]]); // recorded, also in demo mode
  assert.deepEqual(hist['light.a'], [[1, 7]]); // simulated
  const set = await fetch(`${base}/api/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'homeapp.kiosk.wand.co2', value: 1 }) });
  assert.equal(set.status, 400);
  assert.deepEqual(writes, []);
  assert.deepEqual((await (await fetch(`${base}/api/kiosk`)).json()).agents.map((a) => a.id), ['wand']);
});

test('live radar frames are cleaned', () => {
  const r = cleanRadar({
    mode: 'engineering', presence: true, moving: { distance: '130.6', energy: 250 }, still: { energy: 40 },
    gates: { moving: [10, -5, 'x', 101, ...new Array(20).fill(1)], still: [] }, gateCm: 75, extra: 'x',
  });
  assert.deepEqual(r.moving, { distance: 131, energy: 100 });
  assert.equal(r.still, null); // no distance
  assert.deepEqual(r.gates.moving.slice(0, 4), [10, 0, 0, 100]);
  assert.equal(r.gates.moving.length, 16);
  assert.equal('extra' in r, false);
  assert.deepEqual(cleanRadar(null), { mode: 'none', presence: null, moving: null, still: null, gates: null, gateCm: 75, error: null });
  assert.equal(cleanRadar({ mode: 'laser', error: 'x'.repeat(300) }).error.length, 200);
  assert.equal(cleanRadar({ mode: 'pin', gates: { moving: [], still: [] } }).gates, null);
});

test('radar route: agents send live frames only while someone watches', async (t) => {
  const hub = new KioskHub();
  t.after(() => hub.stop());
  const app = express();
  app.use(express.json());
  registerKioskReport(app, { hub, getToken: () => 'secret', getSettings: () => ({}) });
  const base = await listen(t, app);
  const post = (path, body, token = 'secret') => fetch(`${base}/api/kiosk/${path}?token=${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const frames = [];
  hub.on('radar', (id, f) => frames.push([id, f]));
  const frame = { id: 'wand', radar: { mode: 'basic', presence: true, moving: { distance: 120, energy: 60 } } };
  assert.equal((await post('radar', frame, 'wrong')).status, 403);
  // unknown agent (did not report yet): nothing is forwarded, the agent stops
  assert.deepEqual(await (await post('radar', frame)).json(), { ok: false, live: false });
  const first = await (await post('report', { id: 'wand', features: ['radar', 42] })).json();
  assert.equal(first.radar, false);
  assert.deepEqual(hub.list()[0].features, ['radar', '42']);
  assert.deepEqual(await (await post('radar', frame)).json(), { ok: true, live: false });
  hub.watchRadar(true);
  assert.deepEqual(await (await post('radar', frame)).json(), { ok: true, live: true });
  assert.equal((await (await post('report', { id: 'wand' })).json()).radar, true); // fallback without event stream
  assert.equal(frames.length, 2);
  assert.equal(frames[1][0], 'wand');
  assert.deepEqual(frames[1][1].moving, { distance: 120, energy: 60 });
  hub.watchRadar(false);
  assert.equal((await (await post('radar', frame)).json()).live, false);
});

test('event stream asks the agents for live radar frames', async (t) => {
  const hub = new KioskHub();
  t.after(() => hub.stop());
  const app = express();
  registerKioskReport(app, { hub, getToken: () => 'secret', getSettings: () => ({}) });
  const base = await listen(t, app);
  const watched = [];
  hub.on('radarWatch', (on) => watched.push(on));
  hub.watchRadar(true);
  hub.watchRadar(true); // no change, no event
  const ctrl = new AbortController();
  t.after(() => ctrl.abort());
  const res = await fetch(`${base}/api/kiosk/events?token=secret`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const count = () => text.split('data: {"type":"radar"}\n\n').length - 1;
  const until = async (n) => {
    while (count() < n) text += decoder.decode((await reader.read()).value, { stream: true });
  };
  await until(1); // already watched when the agent connects
  hub.watchRadar(false);
  hub.watchRadar(true);
  await until(2);
  assert.deepEqual(watched, [true, false, true]);
  // no `id`: older agents take it for a wake event and ignore it
  assert.equal(JSON.parse(/data: (\{"type".*)\n/.exec(text)[1]).id, undefined);
  assert.equal(hub.listenerCount('radarWatch'), 2);
  ctrl.abort();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(hub.listenerCount('radarWatch'), 1);
});

test('demo radar: a visitor comes and goes, the report matches the live frame', () => {
  const day = Date.UTC(2026, 10, 3, 9);
  const seen = { presence: 0, empty: 0, moving: 0, still: 0, beyond: 0 };
  for (let s = 0; s < 40 * 60; s += 7) {
    const now = day + s * 1000;
    const f = demoRadarFrame(now);
    assert.deepEqual(cleanRadar(f), { ...f, error: null }); // already clean
    assert.equal(f.gates.moving.length, 9);
    const report = demoKioskReport(now).sensors;
    assert.equal(report.presence, f.presence);
    assert.equal(report.moving, Boolean(f.moving));
    if (f.presence) seen.presence++;
    else seen.empty++;
    if (f.moving) {
      seen.moving++;
      assert.ok(f.moving.distance >= 60 && f.moving.distance <= 460);
      // the energy of the gate with the target stands out
      const g = Math.min(8, Math.floor(f.moving.distance / 75));
      assert.ok(f.gates.moving[g] > 25);
    }
    if (f.still) seen.still++;
    // beyond the presence limit a visitor is shown, but is no presence (like a real agent)
    const near = demoRadarFrame(now, 200);
    assert.equal(near.presence, [near.moving, near.still].some((x) => x && x.distance <= 200));
    if ((near.moving || near.still) && !near.presence) {
      seen.beyond++;
      assert.equal(demoKioskReport(now, 200).sensors.moving, false);
    }
  }
  assert.ok(Object.values(seen).every((n) => n > 0), JSON.stringify(seen));
});
