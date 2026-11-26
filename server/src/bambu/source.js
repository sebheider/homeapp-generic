/**
 * Connection to one Bambu Lab printer: MQTT state (report merging, keep-alive, reconnect), camera,
 * commands and the recorded temperatures.
 */
import { MqttClient } from '../mqtt.js';
import { isObj } from '../util/object.js';
import { nextDelay } from '../util/timers.js';
import { RTSP_PORT, cameraKind, jpegProducer, rtspProducer, urlProducer } from './camera.js';
import { FrameCamera } from './frame-camera.js';
import { SPEED_LEVELS } from './labels.js';
import { LIGHT2_MODELS, firmwareOf, modelFromModules } from './models.js';
import { CANCELLED_ERROR, bambuState, mergeReport, normalizeBambu } from './state.js';
import { num } from './values.js';

export const MQTT_PORT = 8883;

const TEMP_KEEP_MS = 30 * 60000;
const TEMP_STEP_MS = 10000;
const FIRST_REPORT_MS = 15000;
const QUIET_PUSHALL_MS = 60000;
const QUIET_RECONNECT_MS = 150000;
const MAX_RETRY_MS = 30000;

/** German explanation of a connection problem with the printer. */
export function bambuMessage(err) {
  const code = String(err?.code || '');
  if (code === 'MQTT_CONNACK') return 'Zugangscode abgelehnt – Zugangscode prüfen (Drucker → Einstellungen → LAN-Modus) und Entwicklermodus einschalten';
  if (code === 'NO_REPORT') return 'Verbunden, aber keine Daten vom Drucker – Seriennummer prüfen';
  if (code === 'ECONNREFUSED') return 'Drucker lehnt die Verbindung ab – LAN-Modus und Entwicklermodus einschalten, IP-Adresse prüfen';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Host nicht gefunden – Adresse prüfen';
  if (['EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) return 'Drucker nicht erreichbar – ist er eingeschaltet und im Netzwerk?';
  return String(err?.message || '') || 'Unbekannter Fehler';
}

/** Talks to one Bambu Lab printer (MQTT state, camera, commands, recorded temperatures). */
export class BambuSource {
  /**
   * @param {ReturnType<typeof import('./config.js').sanitizeBambu>} cfg
   * @param {{createSocket?: () => import('node:net').Socket, camera?: (onFrame, onEnd) => {close(): void}}} [opts]
   *   test hooks: socket for MQTT, producer for the camera
   */
  constructor(cfg, opts = {}) {
    this.cfg = cfg;
    this.opts = opts;
    this.pollMs = 1000; // reading only copies the pushed state
    this.offlineMs = 3000;
    this.report = null;
    this.modules = null;
    this.connected = false;
    this.error = null;
    this.lastMsgAt = 0;
    this.cancelled = false;
    this.run = null; // { start, printTime } of the current / last print
    this.history = [];
    this.waiters = new Set();
    this.seq = 0;
    this.delay = 0;
    this.closed = false;
    this.camera = null;
    this.cameraKey = null;
    this.connect();
    this.watchdog = setInterval(() => this.checkQuiet(), 15000);
    this.watchdog.unref?.();
  }

  get topic() {
    return `device/${this.cfg.serial}`;
  }

  connect() {
    if (this.closed) return;
    const client = new MqttClient({
      host: this.cfg.host,
      port: MQTT_PORT,
      username: 'bblp',
      password: this.cfg.accessCode,
      createSocket: this.opts.createSocket,
    });
    this.client = client;
    client.on('message', (topic, payload) => this.onMessage(topic, payload));
    client.on('close', (err) => {
      if (this.client !== client) return;
      this.connected = false;
      this.error = err ?? Object.assign(new Error('Verbindung vom Drucker getrennt'), { code: 'ECONNRESET' });
      this.settle(this.error);
      if (this.closed) return;
      // a wrong access code will not heal by itself: retry slowly
      this.delay = err?.code === 'MQTT_CONNACK' ? MAX_RETRY_MS : nextDelay(this.delay, 2000, MAX_RETRY_MS);
      this.retry = setTimeout(() => this.connect(), this.delay);
      this.retry.unref?.();
    });
    client.connect().then(
      () => {
        if (this.client !== client) return;
        this.connected = true;
        this.error = null;
        this.delay = 0;
        this.lastMsgAt = Date.now();
        client.subscribe(`${this.topic}/report`);
        this.send({ info: { command: 'get_version' } });
        this.send({ pushing: { command: 'pushall' } });
      },
      () => {
        /* handled by the close event */
      },
    );
  }

  /** Publishes a request with a fresh sequence id. */
  send(msg) {
    const [key] = Object.keys(msg);
    const body = { [key]: { sequence_id: String(++this.seq), ...msg[key] } };
    this.client.publish(`${this.topic}/request`, JSON.stringify(body));
  }

  onMessage(topic, payload) {
    if (topic !== `${this.topic}/report`) return;
    let msg;
    try {
      msg = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    this.lastMsgAt = Date.now();
    if (isObj(msg.print)) this.applyPrint(msg.print);
    if (msg.info?.command === 'get_version' && Array.isArray(msg.info.module)) this.modules = msg.info.module;
  }

  applyPrint(p) {
    const before = String(this.report?.gcode_state || '').toUpperCase();
    this.report = mergeReport(this.report, p);
    const now = String(this.report.gcode_state || '').toUpperCase();
    const idle = (s) => ['', 'IDLE', 'FINISH', 'FAILED'].includes(s);
    if (idle(before) && !idle(now)) this.cancelled = false; // a new print
    if (Number(p.print_error) === CANCELLED_ERROR) this.cancelled = true;
    if (this.report) this.settle(null);
  }

  /** Resolves (or rejects) everybody waiting for the first report. */
  settle(err) {
    for (const w of this.waiters) w(err);
    this.waiters.clear();
  }

  /** No message for a while: ask for the full state; still nothing: reconnect. */
  checkQuiet(now = Date.now()) {
    if (!this.connected) return;
    const quiet = now - this.lastMsgAt;
    if (quiet > QUIET_RECONNECT_MS) this.client.end();
    else if (quiet > QUIET_PUSHALL_MS) this.send({ pushing: { command: 'pushall' } });
  }

  waitForReport(ms = FIRST_REPORT_MS) {
    if (this.report && this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const w = (err) => {
        clearTimeout(timer);
        this.waiters.delete(w);
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(
        () => w(this.connected ? Object.assign(new Error('Keine Daten'), { code: 'NO_REPORT' }) : this.error ?? Object.assign(new Error('Zeitüberschreitung beim Verbinden'), { code: 'ETIMEDOUT' })),
        ms,
      );
      timer.unref?.();
      this.waiters.add(w);
    });
  }

  get model() {
    return modelFromModules(this.modules);
  }

  /** Elapsed print time: from `gcode_start_time` while printing, kept after the end of the print. */
  printTime(now) {
    const p = this.report || {};
    const start = num(p.gcode_start_time);
    const st = bambuState(p.gcode_state, this.cancelled);
    if (start && start > 1e9 && (st === 'printing' || st === 'paused')) {
      this.run = { start, printTime: Math.max(0, Math.round(now / 1000 - start)) };
    }
    return this.run && (!start || this.run.start === start) ? this.run.printTime : null;
  }

  /** Current state (throws while the printer is not connected). */
  async read(now = Date.now()) {
    if (!this.connected && this.error) throw this.error;
    await this.waitForReport();
    const model = this.model;
    const camera = this.cfg.camera === 'url' && !this.cfg.streamUrl ? 'off' : cameraKind(this.cfg.camera, this.report, model);
    const status = normalizeBambu(this.report, {
      model,
      firmware: firmwareOf(this.modules),
      cancelled: this.cancelled,
      printTime: this.printTime(now),
      camera,
      serial: this.cfg.serial,
    });
    this.record(status.temps, now);
    return {
      ...status,
      meta: {
        version: status.bambu.firmware ? `Firmware ${status.bambu.firmware}` : null,
        user: null,
        name: status.bambu.model ? `Bambu Lab ${status.bambu.model}` : '',
        webcam: { enabled: camera !== 'off' && camera !== 'disabled', streamUrl: '', snapshotUrl: '', flipH: false, flipV: false, rotate90: false, ratio: '16:9' },
      },
    };
  }

  /** Remembers the temperatures every 10 seconds for the last 30 minutes. */
  record(temps, now) {
    const last = this.history.at(-1);
    if (last && now - last.t < TEMP_STEP_MS) return;
    this.history.push({ t: now, temps });
    while (this.history.length && this.history[0].t < now - TEMP_KEEP_MS) this.history.shift();
  }

  /** Temperature curves of the last ~30 minutes (same shape as OctoPrint's). */
  async temps() {
    const out = {};
    for (const { t, temps } of this.history) {
      for (const s of temps) {
        if (s.actual === null) continue;
        const e = (out[s.key] ??= { label: s.label, actual: [], target: [] });
        e.actual.push([t, s.actual]);
        if (s.target !== null) e.target.push([t, s.target]);
      }
    }
    return out;
  }

  /** The camera for the current setting (created on first use, replaced when the kind changes). */
  cam() {
    const kind = this.cfg.camera === 'url' ? 'url' : cameraKind(this.cfg.camera, this.report, this.model);
    if (kind === 'off') throw new Error('Kamera ist ausgeschaltet');
    if (kind === 'disabled') throw new Error('LAN-Liveview ist am Drucker ausgeschaltet (Einstellungen → Allgemein → LAN-Liveview)');
    if (kind === 'url' && !this.cfg.streamUrl) throw new Error('Keine Kamera-Adresse eingetragen');
    if (this.camera && this.cameraKey === kind) return this.camera;
    this.camera?.close();
    const { host, accessCode } = this.cfg;
    const producer = this.opts.camera
      ?? (kind === 'rtsp'
        ? rtspProducer({ url: `rtsps://bblp:${encodeURIComponent(accessCode)}@${host}:${RTSP_PORT}/streaming/live/1` })
        : kind === 'url'
          ? urlProducer({ url: this.cfg.streamUrl })
          : jpegProducer({ host, accessCode }));
    this.camera = new FrameCamera(producer);
    this.cameraKey = kind;
    return this.camera;
  }

  async snapshot() {
    const f = await this.cam().frame();
    return { body: f.body, type: f.type };
  }

  async openStream() {
    return this.cam().openStream();
  }

  /**
   * Control: `pause`, `resume`, `stop`, `light` ({ on }) or `speed` ({ level: 1 … 4 }). The state
   * is updated right away (the printer confirms it with its next report).
   */
  async command(action, params = {}) {
    if (!this.connected) throw new Error('Drucker nicht verbunden');
    const st = bambuState(this.report?.gcode_state, this.cancelled);
    const busy = st === 'printing' || st === 'paused';
    if (action === 'pause' || action === 'resume' || action === 'stop') {
      if (!busy) throw new Error('Es läuft kein Druck');
      this.send({ print: { command: action, param: '' } });
      if (action === 'stop') this.cancelled = true;
    } else if (action === 'light') {
      const on = Boolean(params.on);
      const nodes = LIGHT2_MODELS.has(this.model) ? ['chamber_light', 'chamber_light2'] : ['chamber_light'];
      for (const node of nodes) this.send({ system: { command: 'ledctrl', led_node: node, led_mode: on ? 'on' : 'off', led_on_time: 500, led_off_time: 500, loop_times: 0, interval_time: 0 } });
      const lights = (this.report?.lights_report || []).filter((l) => !nodes.includes(l?.node));
      this.report = { ...this.report, lights_report: [...lights, ...nodes.map((node) => ({ node, mode: on ? 'on' : 'off' }))] };
    } else if (action === 'speed') {
      const level = Number(params.level);
      if (!SPEED_LEVELS[level]) throw new Error('Ungültige Geschwindigkeitsstufe');
      if (!busy) throw new Error('Die Geschwindigkeit lässt sich nur während eines Drucks ändern');
      this.send({ print: { command: 'print_speed', param: String(level) } });
      this.report = { ...this.report, spd_lvl: level };
    } else throw new Error('Unbekannter Befehl');
  }

  describe(err) {
    return bambuMessage(err);
  }

  /** Settings that need no new connection (camera, controls). */
  reconfigure(cfg) {
    const camera = cfg.camera !== this.cfg.camera || cfg.streamUrl !== this.cfg.streamUrl;
    this.cfg = cfg;
    if (camera) {
      this.camera?.close();
      this.camera = null;
      this.cameraKey = null;
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.watchdog);
    clearTimeout(this.retry);
    this.settle(Object.assign(new Error('Verbindung beendet'), { code: 'ECONNRESET' }));
    this.client?.end();
    this.camera?.close();
  }
}
