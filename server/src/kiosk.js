/**
 * Kiosk sensors: values reported by the HomeApp agent on the Raspberry Pi of a wall display
 * (presence radar LD2410, light sensor BH1750, CO₂ sensor SCD41 – see kiosk-agent/).
 *
 * The agent POSTs its readings every few seconds to `/api/kiosk/report?token=<kioskToken>`. Every
 * reading becomes a local, read-only datapoint `homeapp.kiosk.<agent>.<key>` that behaves like an
 * ioBroker state inside the app: it is pushed to the browsers, can be used by devices (sensor tiles),
 * notifications, the ventilation advice and the charts, and it shows up in the datapoint search.
 * The answer to a report contains the agent settings of the `kiosk` config section (screen off
 * without presence, always-on times, waking on notifications, quiet hours, automatic brightness, fixed
 * off and dim times for displays without presence radar / light sensor),
 * so the Pi is configured from the settings page.
 *
 * Camera pop-ups and new notifications "wake" the screens: the server pushes them to the agents over
 * `GET /api/kiosk/events?token=…` (server-sent events) and repeats the latest one in every report
 * answer. The agent decides with its settings and its local time (quiet hours) whether to switch on.
 *
 * Live radar: while a browser shows the radar page, the same event stream asks the agents for live frames
 * of their presence radar (`{type: 'radar'}`, repeated as `radar: true` in report answers). They POST about
 * four per second to `/api/kiosk/radar?token=…`; the answer says whether anyone still watches.
 */
import { EventEmitter } from 'node:events';
import { searchObjects } from './util.js';
import { safeEqual } from './auth.js';
import { toMinutes } from './popup-rules.js';

export const KIOSK_PREFIX = 'homeapp.kiosk.';
/** True for the local kiosk datapoints (they never go to ioBroker). */
export const isKioskId = (id) => typeof id === 'string' && id.startsWith(KIOSK_PREFIX);

/** Readings an agent may report: key -> [type, name, unit, role]. */
export const KIOSK_VALUES = {
  presence: ['boolean', 'Anwesenheit', '', 'sensor.presence'],
  moving: ['boolean', 'Bewegung', '', 'sensor.motion'],
  still: ['boolean', 'Ruhende Person', '', 'sensor.presence'],
  distance: ['number', 'Abstand', 'cm', 'value.distance'],
  lux: ['number', 'Helligkeit', 'lx', 'value.brightness'],
  co2: ['number', 'CO₂', 'ppm', 'value.co2'],
  temperature: ['number', 'Temperatur', '°C', 'value.temperature'],
  humidity: ['number', 'Luftfeuchte', '%', 'value.humidity'],
  screen: ['boolean', 'Bildschirm an', '', 'indicator'],
  wake: ['boolean', 'Bildschirm zwangsweise an (Zeitplan / Benachrichtigung)', '', 'indicator'],
  brightness: ['number', 'Bildschirmhelligkeit', '%', 'level.brightness'],
  online: ['boolean', 'Agent erreichbar', '', 'indicator.reachable'],
};
const RANGES = { distance: [0, 10000], lux: [0, 200000], co2: [0, 40000], temperature: [-40, 125], humidity: [0, 100], brightness: [0, 100] };
const MAX_AGENTS = 20;
const OFFLINE_MS = 90 * 1000;
const MAX_STREAMS = 50;
/** The latest wake is repeated in report answers this long (agents that missed the push). */
const WAKE_REPEAT_MS = 60 * 60 * 1000;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
/** Severities of notifications, lowest first (`wakeSeverity` = lowest one that wakes the screen). */
export const WAKE_SEVERITIES = ['info', 'warning', 'alarm'];
/** Default quiet hours: no notification switches the screen on at night. */
const DEFAULT_QUIET_HOURS = [{ days: ALL_DAYS, from: '22:00', to: '06:00' }];
/** Live radar frames: engineering (energy per distance gate), basic (targets only), pin (OUT pin: presence only), none (no data). */
const RADAR_MODES = ['engineering', 'basic', 'pin', 'none'];
const MAX_GATES = 16;

const num = (v, min, max, fallback) => {
  const n = Number(v);
  return v === null || v === '' || v === undefined || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Cleans a list of weekly time windows `{days, from, to}` (always-on times, quiet hours). Same
 * semantics as the pop-up rules: days 0 = Sunday … 6, windows may run over midnight (the part
 * after midnight belongs to the day it started), `from` equal to `to` means the whole day.
 * @param {unknown} list
 * @param {object[]} [fallback] used when `list` is not an array (setting never saved)
 */
export function sanitizeWindows(list, fallback = []) {
  const src = Array.isArray(list) ? list : fallback;
  return src
    .filter((w) => w && typeof w === 'object')
    .slice(0, 20)
    .map((w) => ({
      days: [...new Set((Array.isArray(w.days) ? w.days : ALL_DAYS).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b),
      from: hhmm(toMinutes(w.from) ?? 0),
      to: hhmm(toMinutes(w.to) ?? 0),
    }));
}

/** Cleans the `kiosk` config section (settings sent to the agents). */
export function sanitizeKiosk(k = {}) {
  const s = k && typeof k === 'object' ? k : {};
  const luxDark = num(s.luxDark, 0, 10000, 5);
  const minBrightness = Math.round(num(s.minBrightness, 1, 100, 15));
  const maxBrightness = Math.round(num(s.maxBrightness, 1, 100, 100));
  return {
    screenOff: s.screenOff !== false, // switch the screen off without presence
    screenOffSeconds: Math.round(num(s.screenOffSeconds, 10, 7200, 180)),
    alwaysOn: sanitizeWindows(s.alwaysOn), // the screen stays on inside these windows, even without presence
    wakeOnCamera: s.wakeOnCamera !== false, // camera pop-ups switch the screen on
    wakeOnAlerts: s.wakeOnAlerts !== false, // new notifications (and finished prints) switch the screen on
    wakeSeverity: WAKE_SEVERITIES.includes(s.wakeSeverity) ? s.wakeSeverity : 'info',
    wakeSeconds: Math.round(num(s.wakeSeconds, 10, 3600, 120)), // how long a woken screen stays on without presence
    quietHours: sanitizeWindows(s.quietHours, DEFAULT_QUIET_HOURS), // no notification wakes the screen here (presence and touch still do)
    offTimes: sanitizeWindows(s.offTimes), // screen off here when there is no presence radar (or screenOff is false)
    dimTimes: sanitizeWindows(s.dimTimes), // dimBrightness here when there is no light sensor (or autoBrightness is false)
    // brightness inside / outside the dim times; until set they follow min / max (behaviour before 1.29)
    dimBrightness: Math.round(num(s.dimBrightness, 1, 100, minBrightness)),
    fullBrightness: Math.round(num(s.fullBrightness, 1, 100, maxBrightness)),
    autoBrightness: s.autoBrightness !== false,
    minBrightness,
    maxBrightness,
    luxDark,
    luxBright: Math.max(luxDark + 1, num(s.luxBright, 1, 100000, 400)),
    presenceMaxDistance: Math.round(num(s.presenceMaxDistance, 0, 800, 0)), // cm, 0 = whole range of the radar
    intervalSeconds: Math.round(num(s.intervalSeconds, 2, 300, 10)),
    co2Altitude: Math.round(num(s.co2Altitude, 0, 3000, 0)), // m above sea level (SCD41 pressure compensation)
    temperatureOffset: num(s.temperatureOffset, -10, 10, 0), // °C, the Pi warms the sensor
  };
}

/** Valid agent id ("flur", "kueche-2"), or null. */
export const agentId = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(s) ? s : null;
};

/**
 * Cleans a live frame of a presence radar (see kiosk-agent `radar_payload`): `{mode, presence,
 * moving: {distance cm, energy 0–100} | null, still: … | null, gates: {moving: [], still: []} | null, gateCm, error}`.
 */
export function cleanRadar(r) {
  const src = r && typeof r === 'object' ? r : {};
  const int = (v, min, max) => Math.round(num(v, min, max, min));
  const target = (t) => (t && typeof t === 'object' && Number.isFinite(Number(t.distance)) ? { distance: int(t.distance, 0, 10000), energy: int(t.energy, 0, 100) } : null);
  const energies = (list) => (Array.isArray(list) ? list.slice(0, MAX_GATES).map((v) => int(v, 0, 100)) : []);
  const gates = src.gates && typeof src.gates === 'object' ? { moving: energies(src.gates.moving), still: energies(src.gates.still) } : null;
  return {
    mode: RADAR_MODES.includes(src.mode) ? src.mode : 'none',
    presence: typeof src.presence === 'boolean' ? src.presence : null,
    moving: target(src.moving),
    still: target(src.still),
    gates: gates && (gates.moving.length || gates.still.length) ? gates : null,
    gateCm: Math.round(num(src.gateCm, 10, 200, 75)),
    error: src.error ? String(src.error).slice(0, 200) : null,
  };
}

/** Value of one reading in its type and range, or undefined if invalid. */
function cleanValue(key, v) {
  const [type] = KIOSK_VALUES[key];
  if (v === null || v === undefined) return undefined;
  if (type === 'boolean') return typeof v === 'boolean' ? v : v === 1 || v === 0 ? v === 1 : undefined;
  const n = Number(v);
  if (typeof v === 'boolean' || !Number.isFinite(n)) return undefined;
  const [min, max] = RANGES[key];
  if (n < min || n > max) return undefined;
  return Math.round(n * 10) / 10;
}

/**
 * Notifications that are new compared to the keys of the previous list (`id:since`). Acknowledged
 * and cleared ones are not new; an alert that comes back starts with a new `since`.
 * @param {Set<string>} known keys of the previous list
 * @param {object[]} list current notifications
 * @returns {{keys: Set<string>, fresh: object[]}}
 */
export function freshAlerts(known, list) {
  const key = (a) => `${a.id}:${a.since}`;
  return { keys: new Set(list.map(key)), fresh: list.filter((a) => !known.has(key(a)) && !a.acked && !a.cleared) };
}

/**
 * Local datapoints of all agents; emits `state` (id, entry) like a state source, `agents` on changes,
 * `wake` (event) when the screens should switch on, `radarWatch` (on) when the radar page is opened /
 * closed by the last browser and `radar` (agent id, frame) for every live frame.
 */
export class KioskHub extends EventEmitter {
  constructor({ now = () => Date.now(), offlineMs = OFFLINE_MS } = {}) {
    super();
    this.setMaxListeners(2 * MAX_STREAMS + 10); // one `wake` and one `radarWatch` listener per open event stream
    this.now = now;
    this.offlineMs = offlineMs;
    this.states = new Map();
    this.objects = new Map();
    this.agents = new Map();
    this.lastWake = null;
    this.wakeSeq = 0;
    this.radarWatched = false;
    this.timer = setInterval(() => this.checkOffline(), 15000);
    this.timer.unref?.();
  }

  put(id, val) {
    const prev = this.states.get(id);
    if (prev && prev.val === val) return;
    const entry = { val, ts: this.now(), ack: true };
    this.states.set(id, entry);
    this.emit('state', id, entry);
  }

  /**
   * Processes a report of an agent.
   * @param {object} body `{id, name?, version?, sensors: {presence, lux, co2, …}, display: {on, brightness, method}, errors?: string[]}`
   * @param {string} [address] address of the agent (shown in the settings)
   * @returns {string} the agent id
   */
  report(body, address = '') {
    const id = agentId(body?.id);
    if (!id) throw new Error('Ungültige Agent-ID (a-z, 0-9, - und _, max. 32 Zeichen)');
    if (!this.agents.has(id) && this.agents.size >= MAX_AGENTS) throw new Error('Zu viele Kiosk-Agenten');
    const name = String(body.name || id).slice(0, 60);
    const values = { ...(body.sensors && typeof body.sensors === 'object' ? body.sensors : {}) };
    const display = body.display && typeof body.display === 'object' ? body.display : {};
    if ('on' in display) values.screen = display.on;
    if ('wake' in display) values.wake = display.wake;
    if ('brightness' in display) values.brightness = display.brightness;
    values.online = true;
    const seen = {};
    for (const key of Object.keys(KIOSK_VALUES)) {
      const v = cleanValue(key, values[key]);
      if (v === undefined) continue;
      const sid = `${KIOSK_PREFIX}${id}.${key}`;
      const [type, label, unit, role] = KIOSK_VALUES[key];
      this.objects.set(sid, { id: sid, name: `${name} ${label}`, type, role, unit: unit || undefined, write: false });
      this.put(sid, v);
      seen[key] = v;
    }
    const before = this.agents.get(id);
    const agent = {
      id,
      name,
      version: String(body.version || '').slice(0, 20),
      address: String(address || '').slice(0, 60),
      lastSeen: this.now(),
      online: true,
      values: seen,
      display: { method: String(display.method || '').slice(0, 30) || null },
      // abilities of the agent, e.g. 'radar' = sends live radar frames (agent 1.3.0 and later)
      features: (Array.isArray(body.features) ? body.features : []).map((f) => String(f).slice(0, 20)).slice(0, 10),
      errors: (Array.isArray(body.errors) ? body.errors : []).map((e) => String(e).slice(0, 200)).slice(0, 10),
    };
    this.agents.set(id, agent);
    if (!before || !before.online || before.name !== agent.name || JSON.stringify(before.errors) !== JSON.stringify(agent.errors)) this.emit('agents');
    return id;
  }

  /** Marks agents that stopped reporting as offline (their values stay, `online` turns false). */
  checkOffline() {
    for (const a of this.agents.values()) {
      if (a.online && this.now() - a.lastSeen > this.offlineMs) {
        a.online = false;
        this.put(`${KIOSK_PREFIX}${a.id}.online`, false);
        // a presence that is no longer reported must not keep the screen / rules "occupied"
        if (this.states.has(`${KIOSK_PREFIX}${a.id}.presence`)) this.put(`${KIOSK_PREFIX}${a.id}.presence`, false);
        this.emit('agents');
      }
    }
  }

  /**
   * Asks the agents to switch their screens on. Each agent decides with its settings (camera /
   * notifications, minimum severity, quiet hours in its local time) whether it follows.
   * @param {{reason: 'camera'|'alert'|'printer', severity?: string, title?: string}} e
   */
  wake({ reason, severity = 'info', title = '' }) {
    const ts = this.now();
    this.wakeSeq += 1;
    this.lastWake = {
      id: `${ts.toString(36)}-${this.wakeSeq.toString(36)}`,
      ts,
      reason: String(reason),
      severity: WAKE_SEVERITIES.includes(severity) ? severity : 'info',
      title: String(title || '').slice(0, 80),
    };
    this.emit('wake', this.lastWake);
    return this.lastWake;
  }

  /** The latest wake for a report answer (`ageMs` instead of comparing clocks), or null. */
  recentWake() {
    const w = this.lastWake;
    const age = w ? this.now() - w.ts : Infinity;
    return age < WAKE_REPEAT_MS ? { ...w, ageMs: Math.max(0, age) } : null;
  }

  /** At least one browser shows the radar page: the agents are asked for live frames while this is true. */
  watchRadar(on) {
    if (Boolean(on) === this.radarWatched) return;
    this.radarWatched = Boolean(on);
    this.emit('radarWatch', this.radarWatched);
  }

  /**
   * Live frame of an agent's presence radar; emits `radar` (agent id, cleaned frame).
   * @returns {boolean} false for unknown agents (they must have reported first)
   */
  radar(id, frame) {
    const aid = agentId(id);
    if (!aid || !this.agents.has(aid)) return false;
    this.emit('radar', aid, cleanRadar(frame));
    return true;
  }

  /** Forgets an agent and its datapoints (the simulated demo agent when the demo mode ends). */
  remove(id) {
    if (!this.agents.delete(id)) return;
    for (const sid of [...this.states.keys()]) {
      if (sid.startsWith(`${KIOSK_PREFIX}${id}.`)) {
        this.states.delete(sid);
        this.objects.delete(sid);
      }
    }
    this.emit('agents');
  }

  /** Agents for the settings page. */
  list() {
    return [...this.agents.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Datapoint search (same semantics as the state sources). */
  search(q, limit = 30) {
    return searchObjects(this.objects.values(), q, limit);
  }

  stop() {
    clearInterval(this.timer);
  }
}

/**
 * Registers the agent routes (before the Basic Auth middleware: the agent authenticates with the
 * kiosk token as `?token=` or `Authorization: Bearer`):
 *   POST /api/kiosk/report  readings in, agent settings, the latest wake and `radar` (live radar wanted) out
 *   GET  /api/kiosk/events  server-sent events: `data: {id, reason, severity, title, ageMs}` per wake,
 *                           `data: {"type":"radar"}` when the radar page is opened
 *   POST /api/kiosk/radar   live radar frame `{id, radar}` in, `{ok, live}` out (live = keep sending)
 * @param {import('express').Express} app
 * @param {{hub: KioskHub, getToken: () => string, getSettings: () => object, pingMs?: number}} deps
 */
export function registerKioskReport(app, { hub, getToken, getSettings, pingMs = 25000 }) {
  const allowed = (req) => {
    const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1];
    const token = String(req.query.token || bearer || '');
    return Boolean(token) && safeEqual(token, getToken());
  };
  app.post('/api/kiosk/report', (req, res) => {
    if (!allowed(req)) return res.status(403).json({ error: 'token' });
    try {
      const id = hub.report(req.body, req.ip);
      res.json({ ok: true, id, settings: sanitizeKiosk(getSettings()), wake: hub.recentWake(), radar: hub.radarWatched });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post('/api/kiosk/radar', (req, res) => {
    if (!allowed(req)) return res.status(403).json({ error: 'token' });
    const ok = hub.radar(req.body?.id, req.body?.radar);
    res.json({ ok, live: ok && hub.radarWatched });
  });
  let streams = 0;
  app.get('/api/kiosk/events', (req, res) => {
    if (!allowed(req)) return res.status(403).json({ error: 'token' });
    if (streams >= MAX_STREAMS) return res.status(503).json({ error: 'Zu viele Verbindungen' });
    streams += 1;
    // X-Accel-Buffering: nginx must pass every event right away
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 5000\n\n');
    const send = (w) => res.write(`data: ${JSON.stringify({ ...w, ageMs: 0 })}\n\n`);
    // without an `id` older agents ignore it (they only know wakes)
    const askRadar = (on) => on && res.write(`data: ${JSON.stringify({ type: 'radar' })}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), pingMs); // keeps proxies and the agent's read timeout happy
    hub.on('wake', send);
    hub.on('radarWatch', askRadar);
    askRadar(hub.radarWatched);
    req.on('close', () => {
      streams -= 1;
      clearInterval(ping);
      hub.off('wake', send);
      hub.off('radarWatch', askRadar);
    });
  });
}

/**
 * Report of the simulated wall display in demo mode (presence comes and goes, daylight, CO₂ rises and falls).
 * `maxDistance`: presence limit of the kiosk settings (cm, 0 = whole range), as a real agent applies it.
 */
export function demoKioskReport(now = Date.now(), maxDistance = 0) {
  const d = new Date(now);
  const minutes = now / 60000;
  const hour = d.getHours() + d.getMinutes() / 60;
  const daylight = Math.max(0, Math.sin(((hour - 6) / 14) * Math.PI));
  const radar = demoRadarFrame(now, maxDistance);
  const targets = [radar.moving, radar.still].filter(Boolean);
  const lux = Math.round(4 + daylight * 420 + Math.random() * 6);
  return {
    id: 'demo',
    name: 'Wanddisplay (Demo)',
    version: 'demo',
    features: ['radar'],
    sensors: {
      presence: radar.presence,
      moving: radar.presence && Boolean(radar.moving),
      still: radar.presence && Boolean(radar.still),
      distance: targets.length ? Math.min(...targets.map((t) => t.distance)) : 0,
      lux,
      co2: Math.round(880 + 330 * Math.sin(minutes / 25)),
      temperature: Math.round((21.6 + Math.sin(minutes / 60) * 0.6) * 10) / 10,
      humidity: Math.round(47 + Math.sin(minutes / 45) * 4),
    },
    display: { on: radar.presence, wake: false, brightness: Math.round(15 + daylight * 85), method: 'demo' },
  };
}

/** Distance gates of the simulated radar (9 × 75 cm like a real LD2410). */
const DEMO_GATES = 9;
const DEMO_GATE_CM = 75;

/**
 * Live radar frame of the simulated wall display (engineering mode): someone walks up to the display and
 * away again and now and then stops in front of it; between the visits nobody is there. Targets beyond
 * `maxDistance` (cm, 0 = whole range) are shown but are no presence, like with a real agent.
 */
export function demoRadarFrame(now = Date.now(), maxDistance = 0) {
  const visitor = Math.sin(now / 60000 / 3) > -0.3;
  const s = now / 1000;
  const walk = 260 + 190 * Math.sin(s / 6); // 70 … 450 cm
  const pause = Math.sin(s / 17) > 0.45; // standing in front of the display
  const moving = visitor && !pause ? { distance: Math.round(walk), energy: Math.round(55 + 35 * Math.abs(Math.sin(s * 1.1))) } : null;
  let still = null;
  if (visitor) still = pause ? { distance: Math.round(110 + 8 * Math.sin(s * 0.7)), energy: Math.round(62 + 8 * Math.sin(s * 0.9)) } : { distance: Math.round(walk + 25), energy: 24 };
  const presence = [moving, still].some((t) => t && (!maxDistance || t.distance <= maxDistance));
  // energy per gate: a bump around each target over a small noise floor
  const gate = (target, i, phase) => {
    const noise = 3 + 5 * Math.abs(Math.sin(s * 1.7 + i * 2.3 + phase));
    const bump = target ? target.energy * Math.exp(-(((i + 0.5) * DEMO_GATE_CM - target.distance) ** 2) / (2 * 55 ** 2)) : 0;
    return Math.min(100, Math.round(noise + bump));
  };
  const gates = { moving: Array.from({ length: DEMO_GATES }, (_, i) => gate(moving, i, 0)), still: Array.from({ length: DEMO_GATES }, (_, i) => gate(still, i, 1)) };
  return { mode: 'engineering', presence, moving, still, gates, gateCm: DEMO_GATE_CM };
}
