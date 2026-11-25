import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlertTracker, PrintProgressTimer, PushoverService, alertEvent, effectivePriority, inQuietHours, printerMessage, printerProgressMessage, sanitizePushover } from '../src/pushover.js';

const at = (h, m = 0) => new Date(2026, 10, 15, h, m);

test('sanitizePushover: defaults, invalid values and per-event settings', () => {
  const d = sanitizePushover();
  assert.equal(d.enabled, false);
  assert.deepEqual(d.events.alarm, { enabled: true, priority: 1 });
  assert.deepEqual(d.events.motion, { enabled: false, priority: -1 });
  const c = sanitizePushover({ enabled: true, user: ' u ', appUrl: 'https://home.local/', quietFrom: '25:99', quietUntil: '07:00', events: { waste: { enabled: false, priority: 7 }, people: { priority: '2' }, bogus: {} } });
  assert.equal(c.user, 'u');
  assert.equal(c.appUrl, 'https://home.local');
  assert.equal(c.quietFrom, '');
  assert.deepEqual(c.events.waste, { enabled: false, priority: 0 });
  assert.deepEqual(c.events.people, { enabled: true, priority: 2 });
  assert.equal('bogus' in c.events, false);
  assert.equal(sanitizePushover({ appUrl: 'javascript:alert(1)' }).appUrl, '');
});

test('quiet hours over midnight make normal notifications silent, high priority stays', () => {
  const cfg = { quietFrom: '22:00', quietUntil: '07:00' };
  assert.equal(inQuietHours(cfg, at(23)), true);
  assert.equal(inQuietHours(cfg, at(6, 59)), true);
  assert.equal(inQuietHours(cfg, at(7)), false);
  assert.equal(inQuietHours({ quietFrom: '', quietUntil: '07:00' }, at(3)), false);
  assert.equal(effectivePriority(cfg, 0, at(23)), -1);
  assert.equal(effectivePriority(cfg, 1, at(23)), 1);
  assert.equal(effectivePriority(cfg, 0, at(12)), 0);
});

test('AlertTracker: new, re-raised, acknowledged and ended notifications', () => {
  const t = new AlertTracker();
  const a = { id: 'bad', since: 1 };
  let r = t.update([a, { id: 'w', since: 1, acked: true }]);
  assert.deepEqual(r.raised.map((x) => x.id), ['bad'], 'acknowledged ones are not new');
  r = t.update([{ ...a, value: 70 }]);
  assert.deepEqual([r.raised, r.cleared.map((x) => x.id)], [[], ['w']], 'a new value is no new notification');
  r = t.update([{ ...a, cleared: true, value: 50 }]);
  assert.equal(r.cleared[0].value, 50, 'an alarm waiting for acknowledgement is over');
  r = t.update([{ id: 'bad', since: 2 }]);
  assert.deepEqual(r.raised.map((x) => x.since), [2]);
  assert.equal(alertEvent({ source: 'waste', severity: 'warning' }), 'waste');
  assert.equal(alertEvent({ severity: 'alarm' }), 'alarm');
});

/** Service with a recording fake of the Pushover API. */
function service(cfg, answer = { status: 1 }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, form: Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v.type])) });
    return new Response(JSON.stringify(answer), { status: answer.status === 1 ? 200 : 400 });
  };
  const s = new PushoverService({ fetchImpl, now: () => at(12).getTime() });
  s.configure({ enabled: true, user: 'U', token: 'T', appUrl: 'https://home', ...cfg });
  return { s, calls };
}

test('PushoverService: sends switched-on events with priority, link and picture', async () => {
  const { s, calls } = service({ events: { alarm: { enabled: true, priority: 2 } } });
  const image = async () => ({ type: 'image/jpeg', body: Buffer.from('jpg') });
  assert.equal(await s.notify('alarm', { title: 'Wasser', message: 'Keller nass', view: 'rooms', image }), true);
  assert.equal(await s.notify('motion', { title: 'Garten', message: 'Bewegung' }), false, 'switched off by default');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.pushover.net/1/messages.json');
  assert.deepEqual(calls[0].form, {
    token: 'T', user: 'U', title: 'Wasser', message: 'Keller nass', priority: '2', retry: '60', expire: '3600',
    url: 'https://home/#rooms', url_title: 'In der HomeApp öffnen', attachment: 'image/jpeg',
  });
  assert.equal(s.status().lastSent.title, 'Wasser');
});

test('PushoverService: nothing in demo mode or without keys; errors are reported, not thrown', async () => {
  const demo = service({});
  demo.s.configure({ enabled: true, user: 'U', token: 'T' }, { demo: true });
  assert.equal(await demo.s.notify('alarm', { title: 'x', message: 'y' }), false);
  const noKey = service({ token: '' });
  assert.equal(await noKey.s.notify('alarm', { title: 'x', message: 'y' }), false);
  assert.equal(demo.calls.length + noKey.calls.length, 0);

  const bad = service({}, { status: 0, errors: ['user identifier is invalid'] });
  assert.equal(await bad.s.notify('alarm', { title: 'x', message: 'y' }), false);
  assert.match(bad.s.status().lastError.message, /user identifier is invalid/);
});

test('PushoverService: at most 30 notifications in ten minutes', async () => {
  const { s, calls } = service({});
  for (let i = 0; i < 35; i++) await s.notify('warning', { title: `n${i}`, message: 'm' });
  assert.equal(calls.length, 30);
});

test('printerMessage: texts for the end and the pause of a print', () => {
  const MIN = 60000;
  assert.deepEqual(printerMessage({ phase: 'done', file: 'benchy.gcode', startedAt: 0, ts: 85 * MIN }, 'P1S'), { event: 'printerDone', title: 'P1S', message: '„benchy.gcode“ ist fertig nach 1 h 25 min.' });
  assert.equal(printerMessage({ phase: 'paused', file: null, completion: 41.6, error: 'Filament leer', ts: 0 }).message, 'Der Druck ist pausiert: Filament leer (42 %).');
  assert.equal(printerMessage({ phase: 'error', ts: 0 }).event, 'printerError');
  assert.equal(printerMessage({ phase: 'interval', ts: 0 }), null);
});

test('sanitizePushover: interval of the printer status updates', () => {
  assert.equal(sanitizePushover().printerProgressMinutes, 30);
  assert.equal(sanitizePushover({ printerProgressMinutes: '45' }).printerProgressMinutes, 45);
  assert.equal(sanitizePushover({ printerProgressMinutes: 1 }).printerProgressMinutes, 5);
  assert.equal(sanitizePushover({ printerProgressMinutes: 99999 }).printerProgressMinutes, 720);
  assert.equal(sanitizePushover({ printerProgressMinutes: 'x' }).printerProgressMinutes, 30);
  assert.deepEqual(sanitizePushover().events.printerProgress, { enabled: false, priority: -1 });
});

test('PrintProgressTimer: every interval while printing, the first one an interval after the start', () => {
  const t = new PrintProgressTimer();
  const MIN = 60000;
  const data = (patch) => ({ jobId: 'a', connected: true, state: 'printing', ...patch });
  assert.equal(t.due(data(), 30, 0), false, 'start of the print');
  assert.equal(t.due(data(), 30, 29 * MIN), false);
  assert.equal(t.due(data(), 30, 30 * MIN), true);
  assert.equal(t.due(data(), 30, 31 * MIN), false);
  assert.equal(t.due(data({ state: 'paused' }), 30, 61 * MIN), false, 'not while paused');
  assert.equal(t.due(data({ connected: false }), 30, 62 * MIN), false, 'not while disconnected');
  assert.equal(t.due(data(), 30, 63 * MIN), true, 'after resuming');
  assert.equal(t.due(data({ jobId: null, state: 'idle' }), 30, 64 * MIN), false);
  assert.equal(t.due(data({ jobId: 'b' }), 30, 65 * MIN), false, 'a new print starts over');
  assert.equal(t.due(data({ jobId: 'b' }), 30, 94 * MIN), false);
  assert.equal(t.due(data({ jobId: 'b' }), 30, 95 * MIN), true);
});

test('printerProgressMessage: progress, layer, remaining time and end', () => {
  const now = at(14, 20).getTime();
  const m = printerProgressMessage({ name: 'P1S', job: { file: 'benchy' }, progress: { completion: 44.6, printTime: 3900, printTimeLeft: 4800 }, bambu: { layer: { current: 112, total: 250 } } }, now);
  assert.deepEqual(m, { title: 'P1S – 45 %', message: '„benchy“ läuft seit 1 h 5 min.\nSchicht 112 von 250 · noch 1 h 20 min, fertig gegen 15:40 Uhr' });
  assert.equal(printerProgressMessage({ progress: { printTimeLeft: 12 * 3600 } }, now).message, 'Der Druck läuft.\nnoch 12 h 0 min, fertig morgen gegen 02:20 Uhr');
  assert.deepEqual(printerProgressMessage({ name: '', progress: null }, now), { title: '3D-Drucker', message: 'Der Druck läuft.' });
});

test('PushoverService: forceImage attaches the picture even when pictures are switched off', async () => {
  const { s, calls } = service({ attachImage: false, events: { printerProgress: { enabled: true, priority: 0 } } });
  const image = async () => ({ type: 'image/jpeg', body: Buffer.from('jpg') });
  await s.notify('printerProgress', { title: 'a', message: 'b', image });
  await s.notify('printerProgress', { title: 'a', message: 'b', image, forceImage: true });
  assert.deepEqual(calls.map((c) => c.form.attachment), [undefined, 'image/jpeg']);
});
