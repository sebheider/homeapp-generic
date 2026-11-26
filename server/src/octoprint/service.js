/**
 * The printer service: runs the configured printer source (OctoPrint, Bambu Lab or the demo printer),
 * polls it and pushes its state, the print job events and the webcam pop-ups.
 */
import { EventEmitter } from 'node:events';
import { BambuSource, sanitizeBambu } from '../bambu.js';
import { sanitizeOctoPrint } from './config.js';
import { DEMO_BAMBU_NAME, DEMO_NAME, DemoPrinterSource } from './demo.js';
import { OctoPrintSource, connectionMessage } from './source.js';
import { ACTIVE_STATES, finishReason } from './status.js';

const OFFLINE_RETRY_MS = 15000;

const SNAPSHOT_CACHE_MS = 1000;
const SNAPSHOT_ERROR_CACHE_MS = 3000;
const MAX_STREAMS = 4;

/** Fields whose change needs a new connection (everything else is applied while polling continues). */
const CONNECTION_FIELDS = ['enabled', 'host', 'port', 'https', 'verifySsl', 'apiKey', 'snapshotUrl', 'streamUrl'];

/**
 * Polls the printer and pushes its state. Events:
 *   - `data`    printer state for the browsers (only when something changed)
 *   - `status`  connection changed (for the status payload)
 *   - `popup`   `{ id, ts, reason, jobId }`: `interval` every `popupMinutes` while printing,
 *               `done` / `cancelled` / `error` when the print ended
 */
export class PrinterService extends EventEmitter {
  constructor() {
    super();
    this.cfg = sanitizeOctoPrint();
    this.bambuCfg = sanitizeBambu();
    this.kind = 'octoprint';
    this.source = null;
    this.demo = false;
    this.key = null;
    this.timer = null;
    this.generation = 0; // polls of an older configuration are dropped
    this.meta = null;
    this.snap = null;
    this.activeStreams = 0;
    this.resetTracking();
    this.data = this.baseData();
  }

  /**
   * Applies the configuration. A new connection is only made when connection fields change, so saving
   * other settings neither restarts the pop-up timer nor forgets the running print.
   * @param {object} cfg `octoprint` section of the configuration (shared printer settings)
   * @param {{demo?: boolean, bambu?: object}} opts demo mode: a simulated printer unless one is
   *   configured; `bambu`: section with the connection of a Bambu Lab printer
   */
  configure(cfg, { demo = false, bambu } = {}) {
    const next = sanitizeOctoPrint(cfg);
    const bambuCfg = sanitizeBambu(bambu);
    const isBambu = next.type === 'bambu';
    const real = Boolean(next.enabled && (isBambu ? bambuCfg.host && bambuCfg.serial && bambuCfg.accessCode : next.host));
    const conn = isBambu ? ['bambu', next.enabled, bambuCfg.host, bambuCfg.serial, bambuCfg.accessCode] : CONNECTION_FIELDS.map((f) => next[f]);
    const key = JSON.stringify([...conn, !real && demo]);
    this.cfg = next;
    this.bambuCfg = bambuCfg;
    if (key === this.key) {
      this.source?.reconfigure?.(bambuCfg);
      if (this.source) this.update(this.metaFields());
      return false;
    }
    this.stop();
    this.key = key;
    this.demo = !real && demo;
    this.kind = isBambu ? 'bambu' : 'octoprint';
    this.source = real ? (isBambu ? new BambuSource(bambuCfg) : new OctoPrintSource(next)) : this.demo ? new DemoPrinterSource(Date.now(), { bambu: isBambu }) : null;
    this.meta = null;
    this.snap = null;
    this.resetTracking();
    this.data = this.baseData();
    this.emit('data', this.data);
    this.emit('status');
    if (this.source) this.schedule(0);
    return true;
  }

  /** Stops polling and closes the connections. */
  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.generation++;
    this.source?.close();
    this.source = null;
  }

  resetTracking() {
    this.wasActive = false;
    this.jobId = null;
    this.jobStartedAt = null;
    this.lastPopupAt = 0;
    this.lastState = null;
    this.lastCompletion = null;
  }

  /** Name shown when neither the configuration nor the printer has one. */
  defaultName() {
    if (this.kind === 'bambu') return this.demo ? DEMO_BAMBU_NAME : 'Bambu Lab';
    return this.demo ? DEMO_NAME : 'OctoPrint';
  }

  /** Whether the printer may be controlled from here (only Bambu Lab, and only when allowed). */
  controls() {
    return Boolean(this.source && this.kind === 'bambu' && this.bambuCfg.controls);
  }

  baseData() {
    return {
      enabled: Boolean(this.source),
      demo: this.demo,
      kind: this.kind ?? 'octoprint',
      controls: this.controls(),
      connected: false,
      error: null,
      name: this.cfg.name || this.defaultName(),
      version: null,
      user: null,
      state: 'offline',
      stateText: '',
      active: false,
      jobId: null,
      job: null,
      progress: null,
      temps: [],
      printerError: null,
      bambu: null,
      webcam: { available: false, flipH: false, flipV: false, rotate90: false, ratio: '16:9' },
      updatedAt: Date.now(),
    };
  }

  /** Name, version, user and webcam from the OctoPrint settings (or the own name from the configuration). */
  metaFields() {
    const m = this.meta;
    const w = m?.webcam;
    const ownSnapshot = this.kind !== 'bambu' && Boolean(this.cfg.snapshotUrl);
    return {
      name: this.cfg.name || m?.name || this.defaultName(),
      version: m?.version ?? null,
      user: m?.user ?? null,
      controls: this.controls(),
      // unknown settings (no permission to read them): try anyway
      webcam: { available: ownSnapshot || w?.enabled !== false, flipH: Boolean(w?.flipH), flipV: Boolean(w?.flipV), rotate90: Boolean(w?.rotate90), ratio: w?.ratio === '4:3' ? '4:3' : '16:9' },
    };
  }

  schedule(ms) {
    const gen = this.generation;
    this.timer = setTimeout(async () => {
      await this.poll();
      if (gen !== this.generation) return;
      // the Bambu source only copies the state the printer pushes, so it is read every second
      const every = this.source?.pollMs ?? this.cfg.pollSeconds * 1000;
      this.schedule(this.data.connected ? every : Math.max(every, this.source?.offlineMs ?? OFFLINE_RETRY_MS));
    }, ms);
    this.timer.unref?.();
  }

  /** Reads the printer once and updates state, job tracking and pop-ups. */
  async poll(now = Date.now()) {
    const src = this.source;
    if (!src) return;
    const gen = this.generation;
    let read;
    try {
      read = await src.read(now);
    } catch (err) {
      if (gen !== this.generation) return;
      // the running print is not forgotten: when OctoPrint is back, its pop-ups simply continue
      const error = src.describe ? src.describe(err) : connectionMessage(err);
      this.update({ connected: false, error, state: 'offline', stateText: '', active: false, temps: [], printerError: null });
      return;
    }
    if (gen !== this.generation) return;
    const { meta, ...status } = read;
    if (meta) this.meta = meta;
    const active = ACTIVE_STATES.has(status.state);
    const jobId = this.track(status, active, now);
    this.update({ ...status, ...this.metaFields(), connected: true, error: null, active, jobId });
  }

  /**
   * Follows the print job: id, regular pop-ups while it runs and one when it ends. Returns the job id.
   * Independent of the pop-up settings it emits `job` when a print pauses and when it ends (push notifications).
   */
  track(status, active, now) {
    const c = this.cfg;
    if (active) {
      if (!this.wasActive) {
        this.jobId = now.toString(36);
        this.jobStartedAt = now;
        this.lastPopupAt = now;
      } else {
        if (now - this.lastPopupAt >= c.popupMinutes * 60000) {
          this.lastPopupAt = now;
          if (c.popup) this.emitPopup('interval', now);
        }
        if (status.state === 'paused' && this.lastState !== 'paused') this.emitJob('paused', now, status);
      }
      this.lastState = status.state;
      if (status.progress?.completion != null) this.lastCompletion = status.progress.completion;
      this.wasActive = true;
      return this.jobId;
    }
    if (this.wasActive) {
      const reason = finishReason(this.lastState, this.lastCompletion, status);
      if (c.popupOnFinish) this.emitPopup(reason, now);
      this.emitJob(reason, now, status);
    }
    this.resetTracking();
    return null;
  }

  emitPopup(reason, now) {
    this.emit('popup', { id: `${this.jobId}-${now.toString(36)}`, ts: now, reason, jobId: this.jobId });
  }

  /** `job` event: phase ('paused', 'done', 'error', 'cancelled'), file, start time, progress and error text. */
  emitJob(phase, now, status) {
    this.emit('job', {
      phase,
      ts: now,
      jobId: this.jobId,
      startedAt: this.jobStartedAt ?? null,
      file: status.job?.file || this.data?.job?.file || null,
      completion: status.progress?.completion ?? this.lastCompletion ?? null,
      error: status.printerError || null,
    });
  }

  /** Merges `patch` into the state and emits `data` (and `status`) if something changed. */
  update(patch) {
    const prev = this.data;
    const next = { ...prev, ...patch, updatedAt: prev.updatedAt };
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    next.updatedAt = Date.now();
    this.data = next;
    this.emit('data', next);
    if (prev.connected !== next.connected || prev.error !== next.error) this.emit('status');
  }

  /** Connection info for the status display. */
  status() {
    return { enabled: Boolean(this.source), connected: this.data.connected, error: this.data.error, demo: this.demo };
  }

  /**
   * Current webcam picture. Requests within a second share one upstream request (failures are
   * remembered a little longer), so several open browsers do not multiply the load on the printer.
   */
  snapshot() {
    if (!this.source) return Promise.reject(new Error('Kein 3D-Drucker eingerichtet'));
    const s = this.snap;
    const age = Date.now() - (s?.ts ?? 0);
    if (s && (s.pending || age < (s.failed ? SNAPSHOT_ERROR_CACHE_MS : SNAPSHOT_CACHE_MS))) return s.promise;
    const entry = { ts: Date.now(), pending: true, failed: false, promise: null };
    const settle = (failed) => {
      entry.pending = false;
      entry.failed = failed;
      entry.ts = Date.now();
    };
    entry.promise = this.source.snapshot().then(
      (r) => (settle(false), r),
      (err) => {
        settle(true);
        throw err;
      },
    );
    entry.promise.catch(() => {}); // callers handle the error; a cached rejection must not count as unhandled
    this.snap = entry;
    return entry.promise;
  }

  /** MJPEG stream of the webcam (upstream response, to be piped to the browser). */
  async openStream() {
    if (!this.source) throw new Error('Kein 3D-Drucker eingerichtet');
    if (this.activeStreams >= MAX_STREAMS) throw new Error('Zu viele gleichzeitige Streams');
    const res = await this.source.openStream();
    this.activeStreams++;
    res.on('close', () => this.activeStreams--);
    return res;
  }

  /** Temperature curves of the last ~30 minutes. */
  async temps() {
    if (!this.source) throw new Error('Kein 3D-Drucker eingerichtet');
    return this.source.temps();
  }

  /**
   * Controls the printer (Bambu Lab only): `pause`, `resume`, `stop`, `light` ({ on }) or
   * `speed` ({ level }). The new state is pushed right away.
   */
  async command(action, params = {}) {
    if (!this.source) throw Object.assign(new Error('Kein 3D-Drucker eingerichtet'), { status: 404 });
    if (!this.controls() || !this.source.command) throw Object.assign(new Error('Steuerung des Druckers ist ausgeschaltet'), { status: 403 });
    await this.source.command(action, params);
    await this.poll();
  }
}
