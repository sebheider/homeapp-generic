// 3D printer via OctoPrint: configuration, state mapping, webcam addresses, pop-up schedule and the
// HTTP client against a small fake OctoPrint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  DemoPrinterSource, OctoPrintSource, PrinterService, connectionMessage, finishReason, normalizeStatus, printerState, readTemps, sanitizeOctoPrint,
  tempHistory, webcamSettings, webcamUrls,
} from '../src/octoprint.js';

const MIN = 60000;

// answers of a real OctoPrint 1.8.7 (Prusa MK3S) while printing
const JOB = {
  job: { averagePrintTime: null, estimatedPrintTime: null, filament: null, file: { date: 1792916974, display: 'Tablet_0.2mm_PETG.gcode', name: 'Tablet_0.2mm_PETG.gcode', origin: 'local', path: 'Tablet_0.2mm_PETG.gcode', size: 3789189 }, lastPrintTime: null, user: 'Alex' },
  progress: { completion: 76.25795387878514, filepos: 2889558, printTime: 15474, printTimeLeft: 4810, printTimeLeftOrigin: 'estimate' },
  state: 'Printing',
};
const PRINTER = {
  sd: { ready: true },
  state: { error: '', flags: { cancelling: false, closedOrError: false, error: false, finishing: false, operational: true, paused: false, pausing: false, printing: true, ready: false, resuming: false, sdReady: true }, text: 'Printing' },
  temperature: { A: { actual: 44.1, target: null }, P: { actual: 45.2, target: null }, bed: { actual: 90.0, offset: 0, target: 90.0 }, tool0: { actual: 249.54, offset: 0, target: 250.0 } },
};
const SETTINGS = {
  appearance: { name: 'Prusa MK3s' },
  webcam: { webcamEnabled: true, streamUrl: '/webcam/?action=stream', snapshotUrl: 'http://127.0.0.1:8080/?action=snapshot', flipH: false, flipV: true, rotate90: false, streamRatio: '16:9' },
};

test('sanitizeOctoPrint: defaults, limits and pasted addresses', () => {
  const d = sanitizeOctoPrint();
  assert.equal(d.enabled, false);
  assert.equal(d.port, 80);
  assert.equal(d.pollSeconds, 5);
  assert.equal(d.popupMinutes, 15);
  assert.equal(d.popupSeconds, 20);
  assert.equal(d.popupPosition, 'corner');
  assert.equal(d.popupSize, 'medium');
  assert.equal(d.dashboard && d.popup && d.popupOnFinish, true);
  assert.equal(d.webcamLive, true);
  assert.equal(sanitizeOctoPrint({ webcamLive: false }).webcamLive, false);

  const pasted = sanitizeOctoPrint({ host: 'https://octopi.local:5001/some/path', port: 80 });
  assert.deepEqual([pasted.host, pasted.port, pasted.https], ['octopi.local', 5001, true]);
  const plain = sanitizeOctoPrint({ host: 'http://192.168.178.15/', https: true, port: 443 });
  assert.deepEqual([plain.host, plain.port, plain.https], ['192.168.178.15', 80, false]);
  const hostPort = sanitizeOctoPrint({ host: '192.168.178.15:5000' });
  assert.deepEqual([hostPort.host, hostPort.port], ['192.168.178.15', 5000]);

  const clamped = sanitizeOctoPrint({ pollSeconds: 0, popupMinutes: 9999, popupSeconds: 'x', popupPosition: 'left', popupSize: 'full', port: 70000, apiKey: '  KEY  ' });
  assert.equal(clamped.pollSeconds, 2);
  assert.equal(clamped.popupMinutes, 240);
  assert.equal(clamped.popupSeconds, 20);
  assert.equal(clamped.popupPosition, 'corner');
  assert.equal(clamped.popupSize, 'full');
  assert.equal(clamped.port, 65535);
  assert.equal(clamped.apiKey, 'KEY');
  assert.equal(sanitizeOctoPrint(null).enabled, false);
});

test('printerState: flags win, otherwise the state text', () => {
  assert.equal(printerState('Printing', PRINTER.state.flags), 'printing');
  assert.equal(printerState('Pausing', { printing: true, pausing: true }), 'pausing');
  assert.equal(printerState('Paused', { paused: true, operational: true }), 'paused');
  assert.equal(printerState('Cancelling', { printing: true, cancelling: true }), 'cancelling');
  assert.equal(printerState('Operational', { operational: true, ready: true }), 'idle');
  const texts = {
    Offline: 'offline', Closed: 'offline', 'Offline after error': 'error', Error: 'error', 'Opening serial connection': 'connecting', 'Detecting serial connection': 'connecting',
    Connecting: 'connecting', Operational: 'idle', 'Printing from SD': 'printing', Starting: 'printing', Resuming: 'printing', Finishing: 'finishing',
    'Sending file to SD': 'idle', '': 'unknown', Whatever: 'unknown',
  };
  for (const [text, state] of Object.entries(texts)) assert.equal(printerState(text, null), state, text);
});

test('normalizeStatus: job, progress and temperatures of a real answer', () => {
  const s = normalizeStatus({ job: JOB, printer: PRINTER });
  assert.equal(s.state, 'printing');
  assert.equal(s.stateText, 'Printing');
  assert.equal(s.printerError, null);
  assert.deepEqual(s.job, { file: 'Tablet_0.2mm_PETG.gcode', path: 'Tablet_0.2mm_PETG.gcode', origin: 'local', size: 3789189, user: 'Alex', estimatedPrintTime: null, filament: null });
  assert.equal(s.progress.completion, 76.25795387878514);
  assert.equal(s.progress.printTimeLeft, 4810);
  // other sensors of the firmware (ambient, PINDA probe) are left out
  assert.deepEqual(s.temps, [{ key: 'tool0', label: 'Düse', actual: 249.5, target: 250 }, { key: 'bed', label: 'Bett', actual: 90, target: 90 }]);

  const offline = normalizeStatus({ job: { job: { file: { name: null } }, progress: { completion: null }, state: 'Offline', error: 'Serial port gone' }, printer: null });
  assert.equal(offline.state, 'offline');
  assert.equal(offline.job, null);
  assert.equal(offline.progress.completion, null);
  assert.equal(offline.printerError, 'Serial port gone');
  assert.deepEqual(offline.temps, []);

  const filament = normalizeStatus({ job: { ...JOB, job: { ...JOB.job, filament: { tool0: { length: 1200.4, volume: 2.9 }, tool1: { length: 300 } } } } });
  assert.equal(filament.job.filament, 1500);
  assert.deepEqual(readTemps({ tool1: { actual: 30 }, tool0: { actual: 20, target: 0 }, chamber: { actual: 25, target: null } }).map((t) => t.label), ['Düse 1', 'Düse 2', 'Kammer']);
});

test('webcamUrls: OctoPi loopback address is not used as is, own addresses win', () => {
  const cfg = sanitizeOctoPrint({ host: '192.168.178.15' });
  const cam = webcamSettings(SETTINGS);
  assert.equal(cam.flipV, true);
  assert.deepEqual(webcamUrls(cfg, cam, 'snapshot'), [
    'http://192.168.178.15/webcam/?action=snapshot',
    'http://192.168.178.15:8080/?action=snapshot',
  ]);
  assert.deepEqual(webcamUrls(cfg, cam, 'stream'), ['http://192.168.178.15/webcam/?action=stream']);
  // settings not readable: the OctoPi default
  assert.deepEqual(webcamUrls(cfg, null, 'snapshot'), ['http://192.168.178.15/webcam/?action=snapshot']);
  const own = sanitizeOctoPrint({ host: 'octopi', port: 5000, snapshotUrl: '/cam/snap.jpg', streamUrl: 'http://cam.local/stream' });
  assert.deepEqual(webcamUrls(own, cam, 'snapshot'), ['http://octopi:5000/cam/snap.jpg']);
  assert.deepEqual(webcamUrls(own, cam, 'stream'), ['http://cam.local/stream']);
  // OctoPrint 1.9+: the plugin "classicwebcam" holds the settings; WebRTC addresses are skipped
  const plugin = webcamSettings({ webcam: { webcamEnabled: true }, plugins: { classicwebcam: { stream: 'webrtc://x', snapshot: 'http://localhost:8080/snap', rotate90: true, streamRatio: '4:3' } } });
  assert.deepEqual([plugin.rotate90, plugin.ratio], [true, '4:3']);
  assert.deepEqual(webcamUrls(cfg, plugin, 'snapshot'), ['http://192.168.178.15:8080/snap', 'http://192.168.178.15/webcam/?action=snapshot']);
  assert.deepEqual(webcamUrls(cfg, plugin, 'stream'), ['http://192.168.178.15/webcam/?action=stream']);
  assert.equal(webcamSettings(null), null);
});

test('tempHistory: curves per sensor, thinned out, newest point kept', () => {
  const history = Array.from({ length: 900 }, (_, i) => ({ time: 1000 + i * 2, tool0: { actual: 200 + i / 100, target: 210 }, bed: { actual: 60, target: 60 }, P: { actual: 40 } }));
  const h = tempHistory(history);
  assert.deepEqual(Object.keys(h), ['tool0', 'bed']);
  assert.equal(h.tool0.label, 'Düse');
  assert.equal(h.tool0.actual.length, 300);
  assert.deepEqual(h.tool0.actual.at(-1), [(1000 + 899 * 2) * 1000, 209]);
  assert.deepEqual(h.bed.target.at(-1), [(1000 + 899 * 2) * 1000, 60]);
  assert.deepEqual(tempHistory(undefined), {});
  assert.deepEqual(tempHistory([{ time: 'x' }]), {});
});

test('finishReason and connection messages', () => {
  assert.equal(finishReason('printing', 99.8, { state: 'idle', progress: { completion: 100 } }), 'done');
  assert.equal(finishReason('finishing', 97, { state: 'idle', progress: null }), 'done');
  assert.equal(finishReason('cancelling', 40, { state: 'idle', progress: { completion: 40 } }), 'cancelled');
  assert.equal(finishReason('printing', 40, { state: 'idle', progress: { completion: 40 } }), 'cancelled');
  assert.equal(finishReason('printing', 40, { state: 'error' }), 'error');
  assert.equal(finishReason('printing', 40, { state: 'offline', progress: null }), 'error');
  assert.match(connectionMessage({ status: 403 }), /API-Key/);
  assert.match(connectionMessage({ code: 'ECONNREFUSED' }), /abgelehnt/);
  assert.match(connectionMessage({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }), /Zertifikat/);
  assert.match(connectionMessage({ code: 'ETIMEDOUT', message: 'Zeitüberschreitung' }), /nicht erreichbar/);
});

/** Service whose source is replaced by `read` (no timers). */
function service(read, cfg = {}) {
  const s = new PrinterService();
  s.configure({ enabled: true, host: '127.0.0.1', ...cfg });
  s.stop();
  s.source = { read, close() {} };
  const popups = [];
  s.on('popup', (p) => popups.push(p));
  return { s, popups };
}
const status = (state, completion = 50) => ({ state, stateText: state, printerError: null, job: { file: 'a.gcode' }, progress: { completion }, temps: [], meta: null });

test('PrinterService: pop-up every interval while printing and once at the end', async () => {
  let next = status('printing', 10);
  const { s, popups } = service(async () => next, { popupMinutes: 15 });
  const t0 = 1_000_000;
  await s.poll(t0);
  assert.equal(s.data.active, true);
  assert.equal(s.data.connected, true);
  const job = s.data.jobId;
  assert.ok(job);
  await s.poll(t0 + 10 * MIN);
  assert.equal(popups.length, 0, 'not right at the start');
  await s.poll(t0 + 15 * MIN);
  assert.deepEqual(popups.map((p) => [p.reason, p.jobId, p.ts]), [['interval', job, t0 + 15 * MIN]]);
  await s.poll(t0 + 20 * MIN);
  next = status('paused', 70);
  await s.poll(t0 + 30 * MIN);
  assert.equal(popups.length, 2, 'paused counts as active');
  assert.equal(s.data.jobId, job, 'same print');
  next = status('idle', 100);
  await s.poll(t0 + 31 * MIN);
  assert.deepEqual(popups.at(-1).reason, 'done');
  assert.equal(popups.at(-1).jobId, job);
  assert.equal(s.data.active, false);
  assert.equal(s.data.jobId, null);
  await s.poll(t0 + 60 * MIN);
  assert.equal(popups.length, 3, 'nothing while idle');
});

test('PrinterService: switches for regular and final pop-ups', async () => {
  let next = status('printing');
  const quiet = service(async () => next, { popup: false });
  await quiet.s.poll(0);
  await quiet.s.poll(60 * MIN);
  next = status('cancelling', 40);
  await quiet.s.poll(61 * MIN);
  next = status('idle', 40);
  await quiet.s.poll(62 * MIN);
  assert.deepEqual(quiet.popups.map((p) => p.reason), ['cancelled']);

  next = status('printing');
  const none = service(async () => next, { popupOnFinish: false, popupMinutes: 1 });
  await none.s.poll(0);
  await none.s.poll(MIN);
  next = status('idle', 100);
  await none.s.poll(2 * MIN);
  assert.deepEqual(none.popups.map((p) => p.reason), ['interval']);
});

test('PrinterService: job events for pause and end, also without pop-ups', async () => {
  let next = status('printing', 10);
  const { s } = service(async () => next, { popup: false, popupOnFinish: false });
  const jobs = [];
  s.on('job', (j) => jobs.push(j));
  await s.poll(0);
  next = status('paused', 40);
  await s.poll(MIN);
  await s.poll(2 * MIN);
  next = status('printing', 41);
  await s.poll(3 * MIN);
  next = status('idle', 100);
  await s.poll(90 * MIN);
  assert.deepEqual(jobs.map((j) => [j.phase, j.file, j.startedAt, j.ts]), [['paused', 'a.gcode', 0, MIN], ['done', 'a.gcode', 0, 90 * MIN]]);
});

test('PrinterService: OctoPrint unreachable during a print is no end of the print', async () => {
  let fail = false;
  const { s, popups } = service(async () => {
    if (fail) throw Object.assign(new Error('x'), { code: 'EHOSTUNREACH' });
    return status('printing');
  }, { popupMinutes: 15 });
  const statusEvents = [];
  s.on('status', () => statusEvents.push(s.status()));
  await s.poll(0);
  const job = s.data.jobId;
  fail = true;
  await s.poll(5 * MIN);
  assert.equal(s.data.connected, false);
  assert.equal(s.data.active, false);
  assert.match(s.data.error, /nicht erreichbar/);
  assert.equal(popups.length, 0);
  fail = false;
  await s.poll(16 * MIN);
  assert.equal(s.data.jobId, job, 'the print continues');
  assert.deepEqual(popups.map((p) => p.reason), ['interval']);
  assert.deepEqual(statusEvents.map((e) => e.connected), [true, false, true]);
});

test('PrinterService: only connection settings reconnect; data is only pushed on changes', async () => {
  const s = new PrinterService();
  const data = [];
  s.on('data', (d) => data.push(d));
  assert.equal(s.configure({ enabled: true, host: '10.0.0.9', apiKey: 'k' }), true);
  s.stop();
  s.source = { read: async () => status('printing'), close() {} };
  await s.poll(0);
  const job = s.data.jobId;
  const pushed = data.length;
  await s.poll(1000);
  assert.equal(data.length, pushed, 'unchanged state is not pushed again');
  assert.equal(s.configure({ enabled: true, host: '10.0.0.9', apiKey: 'k', popupMinutes: 5, name: 'Mein Drucker' }), false);
  assert.equal(s.data.jobId, job);
  assert.equal(s.data.name, 'Mein Drucker');
  assert.equal(s.cfg.popupMinutes, 5);
  assert.equal(s.configure({ enabled: true, host: '10.0.0.10', apiKey: 'k' }), true);
  assert.equal(s.data.jobId, null);
  s.stop();
  assert.equal(s.configure({ enabled: false, host: '10.0.0.10' }), true);
  assert.equal(s.status().enabled, false);
  await assert.rejects(s.snapshot(), /Kein 3D-Drucker/);
});

test('demo printer: prints, cools down afterwards and draws its webcam picture', async () => {
  const t0 = 10_000_000;
  const demo = new DemoPrinterSource(t0);
  const now = await demo.read(t0);
  assert.equal(now.state, 'printing');
  assert.equal(now.progress.completion, 30);
  assert.equal(now.temps[0].target, 215);
  const later = await demo.read(t0 + 29 * MIN);
  assert.equal(later.state, 'idle');
  assert.equal(later.progress.completion, 100);
  assert.equal(later.temps[0].target, 0);
  const snap = await demo.snapshot(t0);
  assert.equal(snap.type, 'image/svg+xml');
  assert.match(snap.body.toString(), /<svg/);
  const temps = await demo.temps(t0);
  assert.equal(temps.tool0.actual.length, 181);
  await assert.rejects(demo.openStream(), /Demo/);

  const s = new PrinterService();
  s.configure({}, { demo: true });
  s.stop();
  assert.equal(s.status().demo, true);
  assert.equal(s.data.name, 'Prusa MK4 (Demo)');
  // a configured OctoPrint is used in demo mode, too
  s.configure({ enabled: true, host: '10.0.0.1' }, { demo: true });
  s.stop();
  assert.equal(s.status().demo, false);
});

/** Small fake OctoPrint (or any webcam host) on a free port. */
async function fakeServer(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, key: req.headers['x-api-key'] ?? null });
    handler(req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port, seen, close: () => new Promise((r) => server.close(r)) };
}
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

test('OctoPrintSource: reads OctoPrint with the key, proxies the webcam and explains errors', async (t) => {
  const octo = await fakeServer((req, res) => {
    if (req.url.startsWith('/api/') && req.headers['x-api-key'] !== 'KEY') return json(res, 403);
    if (req.url === '/api/version') return json(res, 200, { api: '0.1', server: '1.8.7', text: 'OctoPrint 1.8.7' });
    if (req.url === '/api/currentuser') return json(res, 200, { name: 'homeapp' });
    if (req.url === '/api/settings') return json(res, 200, SETTINGS);
    if (req.url === '/api/job') return json(res, 200, JOB);
    if (req.url.startsWith('/api/printer?history=true')) return json(res, 200, { temperature: { history: [{ time: 1, tool0: { actual: 20, target: 0 } }] } });
    if (req.url.startsWith('/api/printer')) return json(res, 200, PRINTER);
    if (req.url === '/webcam/?action=snapshot') {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return res.end(Buffer.from([0xff, 0xd8, 0xff]));
    }
    json(res, 404, { error: 'nope' });
  });
  const other = await fakeServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end('png');
  });
  t.after(() => Promise.all([octo.close(), other.close()]));

  const src = new OctoPrintSource(sanitizeOctoPrint({ enabled: true, host: `127.0.0.1:${octo.port}`, apiKey: 'KEY' }));
  t.after(() => src.close());
  const read = await src.read();
  assert.equal(read.state, 'printing');
  assert.deepEqual(read.meta.webcam.flipV, true);
  assert.equal(read.meta.user, 'homeapp');
  assert.equal(read.meta.name, 'Prusa MK3s');
  const snap = await src.snapshot();
  assert.equal(snap.type, 'image/jpeg');
  assert.equal(src.goodSnapshot, `http://127.0.0.1:${octo.port}/webcam/?action=snapshot`);
  assert.deepEqual(Object.keys(await src.temps()), ['tool0']);
  assert.ok(octo.seen.every((r) => r.key === 'KEY'));

  // a webcam on another host never sees the key
  const own = new OctoPrintSource(sanitizeOctoPrint({ enabled: true, host: '127.0.0.1', port: octo.port, apiKey: 'KEY', snapshotUrl: `http://localhost:${other.port}/snap.png` }));
  t.after(() => own.close());
  assert.equal((await own.snapshot()).type, 'image/png');
  assert.deepEqual(other.seen, [{ url: '/snap.png', key: null }]);

  const wrong = new PrinterService();
  wrong.configure({ enabled: true, host: '127.0.0.1', port: octo.port, apiKey: 'WRONG' });
  wrong.stop();
  wrong.source = new OctoPrintSource(wrong.cfg);
  await wrong.poll();
  wrong.source.close();
  assert.equal(wrong.data.connected, false);
  assert.match(wrong.data.error, /API-Key/);
});

test('OctoPrintSource: a stream given as snapshot address is closed, not left running', async (t) => {
  const stream = await fakeServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace;boundary=b' });
    const tick = setInterval(() => res.write('--b\r\nContent-Type: image/jpeg\r\n\r\nxx\r\n'), 20);
    res.on('close', () => clearInterval(tick));
  });
  const src = new OctoPrintSource(sanitizeOctoPrint({ enabled: true, host: '127.0.0.1', port: 1, snapshotUrl: `http://127.0.0.1:${stream.port}/?action=stream` }));
  t.after(async () => {
    src.close();
    stream.server.closeAllConnections();
    await stream.close();
  });
  await assert.rejects(src.snapshot(), /multipart/);
  await new Promise((r) => setTimeout(r, 200));
  const open = await new Promise((r) => stream.server.getConnections((_e, n) => r(n)));
  assert.equal(open, 0);
});
