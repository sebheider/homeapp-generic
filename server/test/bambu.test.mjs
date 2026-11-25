// Bambu Lab printer via the local developer API: report merging and mapping, camera framing, the
// MQTT client and the source against a small fake printer (plain TCP instead of TLS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  BambuSource, FrameCamera, JpegFrameParser, cameraKind, fanPercent, hmsList, jpegAuthPacket, jpegProducer, mergeReport, modelFromModules, normalizeBambu,
  nozzleTypeName, readAms, readFans, rtspProducer, sanitizeBambu,
} from '../src/bambu.js';
import { MqttClient, packet, parsePublish, readPackets } from '../src/mqtt.js';
import { PrinterService } from '../src/octoprint.js';

const JPEG = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await wait(10);
  }
}

// full report (pushall) of a P1S while printing, shortened
const PUSHALL = {
  gcode_state: 'RUNNING',
  subtask_name: 'Halter_PETG',
  gcode_file: '/data/Metadata/plate_1.gcode',
  print_type: 'local',
  mc_percent: 42,
  mc_remaining_time: 75,
  gcode_start_time: '1790000000',
  layer_num: 63,
  total_layer_num: 150,
  stg_cur: 0,
  nozzle_temper: 249.8,
  nozzle_target_temper: 250,
  bed_temper: 79.9,
  bed_target_temper: 80,
  chamber_temper: 5,
  cooling_fan_speed: '15',
  big_fan1_speed: '7',
  big_fan2_speed: '0',
  heatbreak_fan_speed: '15',
  spd_lvl: 2,
  spd_mag: 100,
  lights_report: [{ node: 'chamber_light', mode: 'on' }],
  wifi_signal: '-53dBm',
  nozzle_diameter: '0.4',
  nozzle_type: 'hardened_steel',
  print_error: 0,
  hms: [],
  ipcam: { ipcam_record: 'enable', timelapse: 'disable', resolution: '1080p' },
  ams: {
    tray_now: '2',
    ams: [
      {
        id: '0',
        humidity: '4',
        humidity_raw: '31',
        temp: '24.7',
        tray: [
          { id: '0', tray_type: 'PLA', tray_sub_brands: 'PLA Basic', tray_color: '000000FF', remain: 80 },
          { id: '1' },
          { id: '2', tray_type: 'PETG', tray_sub_brands: 'PETG HF', tray_color: 'FF6A13FF', remain: 55 },
          { id: '3', tray_type: 'PLA', tray_color: 'FFFFFFFF', remain: -1 },
        ],
      },
    ],
  },
  vt_tray: { id: '254', tray_type: '' },
};
const P1S_MODULES = [
  { name: 'ota', sw_ver: '01.08.02.00', product_name: '' },
  { name: 'mc', sw_ver: '00.00.27.36', product_name: 'Bambu Lab P1S' },
];

test('sanitizeBambu: defaults, pasted addresses, serial and camera mode', () => {
  assert.deepEqual(sanitizeBambu(), { host: '', serial: '', accessCode: '', camera: 'auto', streamUrl: '', controls: true });
  const c = sanitizeBambu({ host: ' mqtts://192.168.1.50:8883/x ', serial: '01p00a-4b1 2', accessCode: ' 12345678 ', camera: 'nope', controls: false });
  assert.equal(c.host, '192.168.1.50');
  assert.equal(c.serial, '01P00A4B12');
  assert.equal(c.accessCode, '12345678');
  assert.equal(c.camera, 'auto');
  assert.equal(c.controls, false);
});

test('mergeReport: deltas, AMS slots merged by id, an id-only slot is empty, other lists replaced', () => {
  let s = mergeReport(null, PUSHALL);
  s = mergeReport(s, { mc_percent: 43, ams: { ams: [{ id: '0', tray: [{ id: '2', remain: 54 }, { id: '0' }] }] }, lights_report: [{ node: 'chamber_light', mode: 'off' }] });
  assert.equal(s.mc_percent, 43);
  assert.equal(s.gcode_state, 'RUNNING');
  const trays = s.ams.ams[0].tray;
  assert.deepEqual(trays[0], { id: '0' });
  assert.equal(trays[2].tray_type, 'PETG');
  assert.equal(trays[2].remain, 54);
  assert.equal(s.ams.ams[0].humidity_raw, '31');
  assert.deepEqual(s.lights_report, [{ node: 'chamber_light', mode: 'off' }]);
  assert.equal(PUSHALL.ams.ams[0].tray[2].remain, 55, 'input is not changed');
});

test('normalizeBambu: job, progress, temperatures and the Bambu details of a P1S report', () => {
  const st = normalizeBambu(PUSHALL, { model: 'P1S', firmware: '01.08.02.00', printTime: 3600, camera: 'jpeg', serial: 'X' });
  assert.equal(st.state, 'printing');
  assert.equal(st.stateText, 'Druckt');
  assert.equal(st.job.file, 'Halter_PETG');
  assert.deepEqual(st.progress, { completion: 42, printTime: 3600, printTimeLeft: 4500, printTimeLeftOrigin: null });
  // P1S has no chamber sensor: the chamber value is left out
  assert.deepEqual(st.temps, [
    { key: 'tool0', label: 'Düse', actual: 249.8, target: 250 },
    { key: 'bed', label: 'Bett', actual: 79.9, target: 80 },
  ]);
  const b = st.bambu;
  assert.equal(b.stage, 'Druckt');
  assert.deepEqual(b.layer, { current: 63, total: 150 });
  assert.deepEqual(b.speed, { level: 2, label: 'Standard', percent: 100 });
  assert.deepEqual(b.fans.map((f) => f.percent), [100, 50, 0, 100]);
  assert.equal(b.light, true);
  assert.equal(b.wifi, -53);
  assert.deepEqual(b.nozzles, [{ label: 'Düse', diameter: 0.4, type: 'Gehärteter Stahl', active: null }]);
  assert.equal(b.ams.units[0].name, 'AMS A');
  assert.equal(b.ams.units[0].humidity, 31);
  assert.deepEqual(b.ams.units[0].trays.map((t) => [t.empty, t.active, t.color, t.remain]), [
    [false, false, '#000000', 80],
    [true, false, undefined, undefined],
    [false, true, '#ff6a13', 55],
    [false, false, '#ffffff', null],
  ]);
  assert.deepEqual(b.ams.external, []);
  assert.equal(st.printerError, null);
});

test('normalizeBambu: finished, cancelled and failed prints, packed temperatures of newer firmware', () => {
  assert.equal(normalizeBambu({ ...PUSHALL, gcode_state: 'FINISH', mc_percent: 100 }).state, 'idle');
  assert.equal(normalizeBambu({ ...PUSHALL, gcode_state: 'FINISH' }).progress.printTimeLeft, 0);
  assert.equal(normalizeBambu({ ...PUSHALL, gcode_state: 'FAILED' }, { cancelled: true }).state, 'idle');
  const failed = normalizeBambu({ ...PUSHALL, gcode_state: 'FAILED', print_error: 0x0500400a });
  assert.equal(failed.state, 'error');
  assert.equal(failed.printerError, 'Druckerfehler 0500_400A');
  assert.equal(failed.bambu.stage, null);
  assert.equal(normalizeBambu({ ...PUSHALL, gcode_state: 'IDLE' }).job, null);
  assert.equal(normalizeBambu({ ...PUSHALL, gcode_state: 'PAUSE', stg_cur: 16 }).bambu.stage, 'Vom Benutzer pausiert');
  // H2D: two nozzles and a heated chamber, actual in the low, target in the high 16 bits
  const pack = (actual, target) => (target << 16) + actual;
  const h2d = normalizeBambu({ device: { extruder: { info: [{ id: 0, temp: pack(220, 220) }, { id: 1, temp: pack(30, 0) }] }, bed: { info: { temp: pack(65, 65) } }, ctc: { info: { temp: pack(38, 45) } } } }, { model: 'H2D' });
  assert.deepEqual(h2d.temps.map((t) => [t.label, t.actual, t.target]), [
    ['Düse rechts', 220, 220],
    ['Düse links', 30, 0],
    ['Bett', 65, 65],
    ['Kammer', 38, 45],
  ]);
});

test('HMS codes, fan steps, AMS slot numbers, model and camera detection', () => {
  assert.deepEqual(hmsList([{ attr: 0x03000100, code: 0x00010007 }, { attr: 0x07008000, code: 0x00020001 }, { x: 1 }]), [
    { code: '0300_0100_0001_0007', severity: 'fatal' },
    { code: '0700_8000_0002_0001', severity: 'serious' },
  ]);
  assert.deepEqual(['0', '1', '7', '15', undefined].map(fanPercent), [0, 10, 50, 100, null]);
  // tray_now 5 = second AMS, second slot; 254 = external spool
  const ams = { tray_now: '5', ams: [{ id: '0', tray: [{ id: '1', tray_type: 'PLA' }] }, { id: '1', tray: [{ id: '0', tray_type: 'PLA' }, { id: '1', tray_type: 'ABS' }] }] };
  const r = readAms({ ams, vt_tray: { id: '254', tray_type: 'TPU', tray_color: '00FF00FF' } });
  assert.deepEqual(r.units.map((u) => [u.name, u.trays.map((t) => t.active)]), [['AMS A', [false]], ['AMS B', [false, true]]]);
  assert.deepEqual(r.external.map((t) => [t.label, t.type, t.active, t.nozzle]), [['Extern', 'TPU', false, null]]);
  assert.equal(readAms({ ams: { ...ams, tray_now: '254' }, vt_tray: { id: '254', tray_type: 'TPU' } }).external[0].active, true);
  assert.equal(modelFromModules(P1S_MODULES), 'P1S');
  assert.equal(modelFromModules([{ name: 'mc', hw_ver: 'AP05', project_name: 'N1' }]), 'A1MINI');
  assert.equal(modelFromModules(null), null);
  assert.equal(cameraKind('auto', { ipcam: { rtsp_url: 'rtsps://192.168.1.50/streaming/live/1' } }, 'X1C'), 'rtsp');
  assert.equal(cameraKind('auto', { ipcam: { rtsp_url: 'disable' } }, 'X1C'), 'disabled');
  assert.equal(cameraKind('auto', { ipcam: {} }, 'P1S'), 'jpeg');
  assert.equal(cameraKind('auto', {}, 'H2D'), 'rtsp');
  assert.equal(cameraKind('url', {}, 'P1S'), 'url');
});

// X2D pushall (shortened from a real report): two nozzles, the left one in use with AMS A slot 2, the
// right one fed by the right external spool, packed temperatures, the right aux fan in device.airduct
const X2D_MODULES = [
  { name: 'ota', sw_ver: '01.01.00.00', product_name: 'Bambu Lab X2D' },
  { name: 'n3f/0', sw_ver: '00.00.07.89', product_name: 'AMS 2 Pro (1)' },
];
const X2D = {
  gcode_state: 'RUNNING',
  subtask_name: 'Gehaeuse',
  cooling_fan_speed: '10',
  big_fan1_speed: '1',
  big_fan2_speed: '11',
  heatbreak_fan_speed: '7',
  nozzle_type: 'HS01',
  nozzle_diameter: '0.4',
  lights_report: [{ node: 'chamber_light', mode: 'on' }, { node: 'work_light', mode: 'flashing' }],
  ipcam: { rtsp_url: 'disable', timelapse: 'disable' },
  device: {
    extruder: { state: 0x8112, info: [{ id: 0, snow: 0xff00, temp: 50 }, { id: 1, snow: 1, temp: (250 << 16) + 250 }] },
    bed: { info: { temp: (60 << 16) + 59 } },
    ctc: { info: { temp: 38 } },
    airduct: { parts: [{ id: 16, state: 80 }, { id: 32, state: 10 }, { id: 160, state: 20 }, { id: 48, state: 70 }] },
    nozzle: { info: [{ id: 0, diameter: 0.4, type: 'HS01' }, { id: 1, diameter: 0.6, type: 'HH00' }] },
  },
  ams: {
    tray_now: '1',
    ams: [{ id: '0', humidity_raw: '12', humidity: '5', temp: '27.1', tray: ['PLA', 'PETG', 'PLA', 'ABS'].map((t, i) => ({ id: String(i), tray_type: t })) }],
  },
  vir_slot: [{ id: '254', tray_type: '' }, { id: '255', tray_type: 'TPU', tray_color: '00FF00FF', remain: 0 }],
};

test('X2D: model, both nozzles, AMS slot and external spool per nozzle, fans and camera', () => {
  assert.equal(modelFromModules(X2D_MODULES), 'X2D');
  const st = normalizeBambu(X2D, { model: 'X2D' });
  assert.deepEqual(st.temps.map((t) => [t.label, t.actual, t.target]), [
    ['Düse rechts', 50, 0],
    ['Düse links', 250, 250],
    ['Bett', 59, 60],
    ['Kammer', 38, null],
  ]);
  const b = st.bambu;
  assert.equal(b.model, 'X2D');
  assert.equal(b.light, true);
  assert.deepEqual(b.fans.map((f) => [f.label, f.percent]), [
    ['Bauteillüfter', 70],
    ['Hilfslüfter links', 10],
    ['Hilfslüfter rechts', 20],
    ['Abluftlüfter', 80],
    ['Hotend-Lüfter', 50],
  ]);
  assert.deepEqual(b.nozzles, [
    { label: 'Düse rechts', diameter: 0.4, type: 'Gehärteter Stahl', active: false },
    { label: 'Düse links', diameter: 0.6, type: 'Edelstahl (High Flow)', active: true },
  ]);
  assert.deepEqual(b.ams.units[0].trays.map((t) => [t.active, t.nozzle]), [[false, null], [true, 'left'], [false, null], [false, null]]);
  assert.deepEqual(b.ams.external.map((t) => [t.label, t.type, t.remain, t.active, t.nozzle]), [['Extern rechts', 'TPU', 0, false, 'right']]);
  // switched to the right nozzle: its external spool is the active one now
  const right = readAms(mergeReport(X2D, { device: { extruder: { state: 0x8102 } } }));
  assert.deepEqual([right.units[0].trays[1].active, right.external[0].active], [false, true]);
  assert.equal(cameraKind('auto', X2D, 'X2D'), 'disabled', 'LAN live view switched off');
  assert.equal(cameraKind('auto', {}, 'X2D'), 'rtsp');
  // the second aux fan only exists on the X2D and P2S
  const aux = { big_fan1_speed: '0', device: { airduct: { parts: [{ id: 160, state: 30 }] } } };
  assert.deepEqual(readFans(aux, 'P2S').map((f) => [f.label, f.percent]), [['Hilfslüfter', 0], ['Hilfslüfter 2', 30]]);
  assert.equal(readFans(aux, 'P1S').length, 1);
  assert.deepEqual(['HU01', 'HS05', 'brass', 'XY99', ''].map(nozzleTypeName), ['TPU High Flow', 'Wolframkarbid', 'Messing', 'XY99', null]);
});

/** One picture as the JPEG camera sends it: 16 byte header with the size, then the JPEG. */
const jpegFrame = (body) => {
  const head = Buffer.alloc(16);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
};

test('JPEG camera: login packet and pictures split across chunks', () => {
  const auth = jpegAuthPacket('12345678');
  assert.equal(auth.length, 80);
  assert.equal(auth.readUInt32LE(0), 0x40);
  assert.equal(auth.readUInt32LE(4), 0x3000);
  assert.equal(auth.toString('ascii', 16, 20), 'bblp');
  assert.equal(auth.toString('ascii', 48, 56), '12345678');
  const frames = [];
  const p = new JpegFrameParser((f) => frames.push(f));
  const bytes = Buffer.concat([jpegFrame(JPEG), jpegFrame(JPEG)]);
  for (let i = 0; i < bytes.length; i += 5) p.push(bytes.subarray(i, i + 5));
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0].body, JPEG);
  assert.throws(() => new JpegFrameParser(() => {}).push(Buffer.alloc(16, 0xff)), /Unerwartete Daten/);
});

test('JPEG camera: producer logs in and delivers the pictures of a fake printer', async (t) => {
  let login = null;
  const server = net.createServer((sock) => {
    sock.once('data', (d) => {
      login = d;
      sock.write(jpegFrame(JPEG));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const cam = new FrameCamera(jpegProducer({ host: '127.0.0.1', accessCode: 'abc', port: server.address().port, connect: (o) => net.connect(o) }));
  t.after(() => cam.close());
  const f = await cam.frame();
  assert.deepEqual(f.body, JPEG);
  assert.equal(login.toString('ascii', 48, 51), 'abc');
});

test('FrameCamera: shares one producer, serves a stream, stops when nobody watches', async () => {
  let opened = 0;
  let closed = 0;
  let emit = null;
  const cam = new FrameCamera((onFrame) => {
    opened++;
    emit = onFrame;
    setImmediate(() => onFrame({ type: 'image/jpeg', body: JPEG }));
    return { close: () => closed++ };
  }, { idleMs: 50, freshMs: 1000 });
  const [a, b] = await Promise.all([cam.frame(), cam.frame()]);
  assert.equal(opened, 1);
  assert.equal(a, b);
  const stream = await cam.openStream();
  assert.match(stream.headers['content-type'], /^multipart\/x-mixed-replace; boundary=/);
  const chunks = [];
  stream.on('data', (c) => chunks.push(c));
  emit({ type: 'image/jpeg', body: JPEG });
  await wait(80);
  assert.equal(closed, 0, 'kept running while the stream is watched');
  assert.match(Buffer.concat(chunks).toString('latin1'), /Content-Length: 7\r\n\r\n/);
  stream.destroy();
  await until(() => closed === 1);
  cam.close();
});

test('FrameCamera: failures are reported and retried; ffmpeg missing is explained', async () => {
  const cam = new FrameCamera((_f, onEnd) => {
    setImmediate(() => onEnd(new Error('kaputt')));
    return { close() {} };
  }, { waitMs: 500 });
  await assert.rejects(cam.frame(), /kaputt/);
  cam.close();
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = () => {};
  const rtsp = new FrameCamera(rtspProducer({ url: 'rtsps://bblp:x@h:322/streaming/live/1', spawn: () => proc }), { waitMs: 500 });
  const p = rtsp.frame();
  proc.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }));
  proc.emit('close', -2);
  await assert.rejects(p, /ffmpeg ist nicht installiert/);
  rtsp.close();
});

test('rtspProducer: hides the access code in ffmpeg errors and reads its MJPEG output', async () => {
  let args = null;
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = () => proc.emit('close', null);
  const frames = [];
  let ended = null;
  const h = rtspProducer({ url: 'rtsps://bblp:secret@h:322/streaming/live/1', spawn: (_cmd, a) => ((args = a), proc) })((f) => frames.push(f), (e) => (ended = e));
  assert.ok(args.includes('rtsps://bblp:secret@h:322/streaming/live/1'));
  proc.stdout.write(Buffer.concat([Buffer.from('--homeappffmpeg\r\nContent-type: image/jpeg\r\nContent-length: 7\r\n\r\n'), JPEG, Buffer.from('\r\n')]));
  await wait(10);
  assert.equal(frames.length, 1);
  proc.stderr.write('Error opening input rtsps://bblp:secret@h:322/streaming/live/1: Connection refused\n');
  await wait(10);
  h.close();
  assert.doesNotMatch(ended.message, /secret/);
});

/* ------------------------------------------------------------------ fake printer (MQTT broker) */

/** A tiny MQTT broker that behaves like the printer: answers get_version and pushall. */
function fakePrinter({ serial = 'SERIAL1', code = '12345678', report = PUSHALL, modules = P1S_MODULES, answer = true } = {}) {
  const requests = [];
  const sockets = new Set();
  const logins = [];
  const send = (sock, msg) => {
    const topic = Buffer.from(`device/${serial}/report`);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(topic.length);
    sock.write(packet(3, 0, Buffer.concat([len, topic, Buffer.from(JSON.stringify(msg))])));
  };
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => {});
    let buf = Buffer.alloc(0);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      let packets;
      ({ packets, rest: buf } = readPackets(buf));
      for (const p of packets) {
        if (p.type === 1) {
          const body = p.body.toString('latin1');
          logins.push(body);
          sock.write(packet(2, 0, Buffer.from([0, body.includes(code) ? 0 : 5])));
        } else if (p.type === 8) sock.write(packet(9, 0, Buffer.from([p.body[0], p.body[1], 0])));
        else if (p.type === 3) {
          const { topic, payload } = parsePublish(p.flags, p.body);
          const msg = JSON.parse(payload.toString());
          requests.push({ topic, msg });
          if (!answer) continue;
          if (msg.info?.command === 'get_version') send(sock, { info: { command: 'get_version', sequence_id: msg.info.sequence_id, module: modules } });
          if (msg.pushing?.command === 'pushall') send(sock, { print: { ...report, command: 'push_status' } });
        }
      }
    });
  });
  return {
    requests,
    logins,
    sockets,
    push: (msg) => sockets.forEach((s) => send(s, { print: msg })),
    listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))),
    close: () => {
      sockets.forEach((s) => s.destroy());
      server.close();
    },
  };
}

test('MqttClient: login, subscribe, publish and messages; wrong password is reported', async (t) => {
  const fake = fakePrinter();
  const port = await fake.listen();
  t.after(() => fake.close());
  const c = new MqttClient({ host: '127.0.0.1', username: 'bblp', password: '12345678', createSocket: () => net.connect(port, '127.0.0.1') });
  const got = [];
  c.on('message', (topic, payload) => got.push([topic, JSON.parse(payload)]));
  await c.connect();
  c.subscribe('device/SERIAL1/report');
  c.publish('device/SERIAL1/request', JSON.stringify({ pushing: { sequence_id: '1', command: 'pushall' } }));
  await until(() => got.length === 1);
  assert.equal(got[0][0], 'device/SERIAL1/report');
  assert.equal(got[0][1].print.mc_percent, 42);
  assert.match(fake.logins[0], /bblp/);
  const closed = new Promise((r) => c.once('close', r));
  c.end();
  assert.equal(await closed, null);

  const bad = new MqttClient({ host: '127.0.0.1', username: 'bblp', password: 'falsch', createSocket: () => net.connect(port, '127.0.0.1') });
  bad.on('close', () => {});
  await assert.rejects(bad.connect(), (err) => err.code === 'MQTT_CONNACK' && err.rc === 5);
});

test('BambuSource: state of the fake printer, deltas, commands and temperature recording', async (t) => {
  const fake = fakePrinter();
  const port = await fake.listen();
  t.after(() => fake.close());
  const src = new BambuSource(sanitizeBambu({ host: '127.0.0.1', serial: 'serial1', accessCode: '12345678' }), { createSocket: () => net.connect(port, '127.0.0.1') });
  t.after(() => src.close());
  const now = 1790000000 * 1000 + 3600000;
  const st = await src.read(now);
  assert.equal(st.state, 'printing');
  assert.equal(st.progress.printTime, 3600);
  await until(() => src.modules);
  const st2 = await src.read(now + 20000);
  assert.equal(st2.meta.name, 'Bambu Lab P1S');
  assert.equal(st2.meta.version, 'Firmware 01.08.02.00');
  assert.equal(st2.bambu.camera, 'jpeg');
  assert.deepEqual(fake.requests.slice(0, 2).map((r) => [r.topic, Object.keys(r.msg)[0]]), [
    ['device/SERIAL1/request', 'info'],
    ['device/SERIAL1/request', 'pushing'],
  ]);

  fake.push({ mc_percent: 43, layer_num: 64 });
  await until(() => src.report.mc_percent === 43);
  assert.equal((await src.read(now + 40000)).bambu.layer.current, 64);

  await src.command('light', { on: false });
  await src.command('speed', { level: 3 });
  await src.command('pause');
  await until(() => fake.requests.length >= 5);
  const sent = fake.requests.slice(2).map((r) => r.msg);
  assert.equal(sent[0].system.command, 'ledctrl');
  assert.equal(sent[0].system.led_mode, 'off');
  assert.deepEqual([sent[1].print.command, sent[1].print.param], ['print_speed', '3']);
  assert.equal(sent[2].print.command, 'pause');
  assert.equal((await src.read(now + 60000)).bambu.light, false, 'shown before the printer confirms');
  await assert.rejects(src.command('speed', { level: 9 }), /Ungültige/);

  // a cancelled print ends as "idle" (not error) even after print_error is reset
  await src.command('stop');
  fake.push({ gcode_state: 'FAILED', print_error: 0x0300400c });
  await until(() => src.report.gcode_state === 'FAILED');
  fake.push({ print_error: 0 });
  await until(() => src.report.print_error === 0);
  assert.equal((await src.read(now + 80000)).state, 'idle');
  await assert.rejects(src.command('pause'), /kein Druck/);

  const temps = await src.temps();
  assert.deepEqual(Object.keys(temps), ['tool0', 'bed']);
  assert.equal(temps.tool0.actual.length, 5);
  assert.deepEqual(temps.bed.target[0], [now, 80]);
});

test('BambuSource: the H2 series switches both chamber lights', async (t) => {
  const fake = fakePrinter({ modules: [{ name: 'ota', sw_ver: '01.02.00.00', product_name: 'Bambu Lab H2D' }], report: { ...PUSHALL, lights_report: [{ node: 'chamber_light', mode: 'off' }, { node: 'chamber_light2', mode: 'on' }] } });
  const port = await fake.listen();
  t.after(() => fake.close());
  const src = new BambuSource(sanitizeBambu({ host: '127.0.0.1', serial: 'serial1', accessCode: '12345678' }), { createSocket: () => net.connect(port, '127.0.0.1') });
  t.after(() => src.close());
  assert.equal((await src.read()).bambu.light, true, 'on while one of them is on');
  await until(() => src.model === 'H2D');
  await src.command('light', { on: false });
  await until(() => fake.requests.length >= 4);
  assert.deepEqual(fake.requests.slice(2).map((r) => [r.msg.system.led_node, r.msg.system.led_mode]), [['chamber_light', 'off'], ['chamber_light2', 'off']]);
  assert.equal((await src.read()).bambu.light, false);
});

test('BambuSource: wrong access code and missing reports are explained', async (t) => {
  const fake = fakePrinter({ answer: false });
  const port = await fake.listen();
  t.after(() => fake.close());
  const bad = new BambuSource(sanitizeBambu({ host: '127.0.0.1', serial: 'S', accessCode: 'falsch' }), { createSocket: () => net.connect(port, '127.0.0.1') });
  t.after(() => bad.close());
  const err = await bad.read().catch((e) => e);
  assert.match(bad.describe(err), /Zugangscode abgelehnt/);

  const silent = new BambuSource(sanitizeBambu({ host: '127.0.0.1', serial: 'WRONG', accessCode: '12345678' }), { createSocket: () => net.connect(port, '127.0.0.1') });
  t.after(() => silent.close());
  await until(() => silent.connected);
  const e2 = await silent.waitForReport(50).catch((e) => e);
  assert.match(silent.describe(e2), /Seriennummer prüfen/);
});

test('PrinterService: Bambu type, demo extras, commands and the controls switch', async () => {
  const s = new PrinterService();
  s.configure({ enabled: true, type: 'bambu' }, { demo: true, bambu: { host: '', serial: '', accessCode: '' } });
  assert.equal(s.demo, true);
  await s.poll();
  assert.equal(s.data.kind, 'bambu');
  assert.equal(s.data.controls, true);
  assert.equal(s.data.name, 'Bambu Lab P1S (Demo)');
  assert.equal(s.data.bambu.ams.units.length, 1);
  await s.command('light', { on: false });
  assert.equal(s.data.bambu.light, false);
  await s.command('speed', { level: 4 });
  assert.equal(s.data.bambu.speed.label, 'Ludicrous');
  await assert.rejects(s.command('stop'), /Demo/);

  // switching the controls off needs no new connection
  assert.equal(s.configure({ enabled: true, type: 'bambu' }, { demo: true, bambu: { controls: false } }), false);
  assert.equal(s.data.controls, false);
  await assert.rejects(s.command('light', { on: true }), (err) => err.status === 403);

  // OctoPrint has no controls
  s.configure({ enabled: false, type: 'octoprint' }, { demo: true });
  await s.poll();
  assert.equal(s.data.kind, 'octoprint');
  assert.equal(s.data.bambu, null);
  assert.equal(s.data.controls, false);
  s.stop();
});
