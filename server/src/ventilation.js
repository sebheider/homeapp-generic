/**
 * Ventilation advice ("Lüftungsempfehlung").
 *
 * Compares every configured room with the outdoor air and tells when opening the window helps:
 *   - CO₂ above `co2Max` (ppm)                         -> ventilate (warning above `co2Warn`)
 *   - relative humidity above `humidityMax` (%) and the outdoor air holds at least `minDifference` g/m³
 *     less water (absolute humidity)                  -> ventilate (dry the room)
 *   - optional cooling: room warmer than `coolAbove` °C and outdoors at least `coolDifference` K cooler
 *     without bringing in more moisture               -> ventilate (cool down)
 *   - window open (contact) while a reason holds -> "airing" (no hint)
 *   - window open (contact) while the outdoor air is clearly more humid and nothing else requires
 *     airing                                          -> close the window
 * The comparison uses absolute humidity, because 70 % at 5 °C outdoors is much drier air than
 * 55 % at 21 °C indoors. Hystereses (3 % humidity, 100 ppm CO₂, half the humidity difference,
 * 1 K cooling) keep a recommendation from flickering.
 *
 * Outdoor values: datapoints of the section, otherwise the local weather station (weather.states),
 * otherwise the internet weather (Open-Meteo, current conditions).
 * Rooms: configured list; if it is empty, rooms are derived from the devices (sensors of kind
 * temperature / humidity / co2 / window, thermostats). Wall displays with a CO₂ sensor (kiosk agents)
 * are added automatically unless a room already uses their CO₂ datapoint.
 *
 * Recommendations are published as hints in the shape of the user-defined alerts.
 */
import { EventEmitter } from 'node:events';
import { round } from './util/number.js';
import { KIOSK_PREFIX, isKioskId } from './kiosk.js';

export const VENT_SEVERITIES = ['warning', 'info'];
const OUTSIDE = /außen|aussen|wetter|garten|terrasse|balkon/i;
const TICK_MS = 60 * 1000;
const OUTDOOR_FETCH_MS = 10 * 60 * 1000;

const num = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const isOpen = (v) => v === true || v === 1 || v === 'true' || v === 'open' || v === 'opened' || (typeof v === 'number' && v > 0);
const de = (v, d = 1) => String(round(v, d)).replace('.', ',');
const id = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const limit = (v, min, max, fallback) => {
  const n = num(v);
  return n === null ? fallback : Math.min(max, Math.max(min, n));
};

/** Absolute humidity in g/m³ from temperature (°C) and relative humidity (%), Magnus formula. */
export function absoluteHumidity(t, rh) {
  if (num(t) === null || num(rh) === null) return null;
  const sat = 6.112 * Math.exp((17.62 * t) / (243.12 + t)); // saturation vapour pressure in hPa
  return (sat * rh * 2.1674) / (273.15 + t);
}

/** Cleans the `ventilation` config section. */
export function sanitizeVentilation(v = {}) {
  const s = v && typeof v === 'object' ? v : {};
  const rooms = (Array.isArray(s.rooms) ? s.rooms : [])
    .filter((r) => r && typeof r === 'object' && (r.humidity || r.co2))
    .slice(0, 40)
    .map((r, i) => ({
      id: id(r.id || `raum_${i + 1}`, 40),
      room: id(r.room, 40),
      name: id(r.name, 60),
      temperature: id(r.temperature),
      humidity: id(r.humidity),
      co2: id(r.co2),
      window: id(r.window),
    }));
  return {
    enabled: s.enabled === true,
    outdoor: { temperature: id(s.outdoor?.temperature), humidity: id(s.outdoor?.humidity) },
    rooms,
    humidityMax: limit(s.humidityMax, 30, 95, 60),
    minDifference: limit(s.minDifference, 0.2, 10, 1),
    co2Max: limit(s.co2Max, 500, 5000, 1000),
    co2Warn: limit(s.co2Warn, 500, 10000, 1400),
    cooling: s.cooling === true,
    coolAbove: limit(s.coolAbove, 15, 35, 25),
    coolDifference: limit(s.coolDifference, 1, 15, 3),
    closeHints: s.closeHints !== false,
    severity: VENT_SEVERITIES.includes(s.severity) ? s.severity : 'info',
  };
}

/** Rooms derived from the devices: every room with a humidity or CO₂ sensor (outdoor rooms excluded). */
export function autoRooms(cfg) {
  const out = [];
  for (const room of cfg.rooms || []) {
    if (OUTSIDE.test(`${room.id} ${room.name}`)) continue;
    const devs = (cfg.devices || []).filter((d) => d.room === room.id);
    const sensor = (kind) => devs.find((d) => d.type === 'sensor' && d.options?.kind === kind)?.states?.value || '';
    const humidity = sensor('humidity');
    const co2 = sensor('co2');
    if (!humidity && !co2) continue;
    const thermo = devs.find((d) => ['thermostat', 'climate'].includes(d.type) && d.states?.current)?.states.current;
    out.push({ id: room.id, room: room.id, name: '', temperature: sensor('temperature') || thermo || '', humidity, co2, window: sensor('window') });
  }
  return out;
}

/**
 * Wall displays with a CO₂ sensor that no room uses yet. They take part with the CO₂ of their latest
 * report – null while offline or without a valid reading, like the CO₂ traffic light of the browser.
 * @param {{id: string, name?: string, online?: boolean, values?: Record<string, unknown>}[]} agents
 * @param {{co2?: string}[]} [rooms] rooms of the advice
 */
export function kioskRooms(agents, rooms = []) {
  const used = new Set(rooms.map((r) => r.co2).filter(Boolean));
  return (Array.isArray(agents) ? agents : [])
    .filter((a) => a?.id && !used.has(`${KIOSK_PREFIX}${a.id}.co2`))
    .map((a) => {
      const co2 = a.values?.co2;
      const valid = a.online === true && typeof co2 === 'number' && Number.isFinite(co2) && co2 > 0;
      return { id: `kiosk_${a.id}`, room: '', name: a.name || a.id, kioskCo2: valid ? co2 : null };
    });
}

/** Readings of a wall display that change its share of the advice. */
const isKioskReading = (id) => isKioskId(id) && /\.(co2|online)$/.test(id);

/** Outdoor datapoints: section, otherwise the local weather station. */
export function outdoorIds(cfg) {
  const v = cfg.ventilation || {};
  return {
    temperature: v.outdoor?.temperature || cfg.weather?.states?.temperature || '',
    humidity: v.outdoor?.humidity || cfg.weather?.states?.humidity || '',
  };
}

/** Every datapoint the ventilation advice reads (to subscribe them). */
export function ventilationStateIds(cfg) {
  const v = sanitizeVentilation(cfg.ventilation);
  if (!v.enabled) return [];
  const rooms = v.rooms.length ? v.rooms : autoRooms(cfg);
  const o = outdoorIds({ ...cfg, ventilation: v });
  return [o.temperature, o.humidity, ...rooms.flatMap((r) => [r.temperature, r.humidity, r.co2, r.window])].filter(Boolean);
}

/**
 * Evaluates one room.
 * @param {{temperature: number|null, humidity: number|null, co2: number|null, windowOpen: boolean|null}} room
 * @param {{temperature: number|null, humidity: number|null}} outdoor
 * @param {ReturnType<typeof sanitizeVentilation>} cfg
 * @param {{status?: string, reasons?: string[]}|null} [prev] previous result (hysteresis)
 * @returns {{status: 'ventilate'|'airing'|'ok'|'close'|'unknown', reasons: string[], severity: string, absHumidity: number|null, outdoorAbs: number|null}}
 */
export function evaluateRoom(room, outdoor, cfg, prev = null) {
  const had = (r) => (prev?.status === 'ventilate' || prev?.status === 'airing') && prev.reasons?.includes(r);
  const ah = absoluteHumidity(room.temperature, room.humidity);
  const ahOut = absoluteHumidity(outdoor.temperature, outdoor.humidity);
  const diff = ah !== null && ahOut !== null ? ah - ahOut : null;
  const reasons = [];
  if (room.co2 !== null && room.co2 >= cfg.co2Max - (had('co2') ? 100 : 0)) reasons.push('co2');
  const humid = room.humidity !== null && room.humidity >= cfg.humidityMax - (had('humidity') ? 3 : 0);
  if (humid && diff !== null && diff >= cfg.minDifference / (had('humidity') ? 2 : 1)) reasons.push('humidity');
  if (
    cfg.cooling &&
    room.temperature !== null &&
    outdoor.temperature !== null &&
    room.temperature >= cfg.coolAbove - (had('cooling') ? 1 : 0) &&
    room.temperature - outdoor.temperature >= cfg.coolDifference - (had('cooling') ? 1 : 0) &&
    (diff === null || diff >= -cfg.minDifference)
  ) {
    reasons.push('cooling');
  }
  const severity = room.co2 !== null && room.co2 >= cfg.co2Warn ? 'warning' : cfg.severity;
  const base = { reasons, severity, absHumidity: ah === null ? null : round(ah, 1), outdoorAbs: ahOut === null ? null : round(ahOut, 1), humidOutside: humid && diff !== null && diff < cfg.minDifference };
  // window already open: nothing to recommend, the room is being aired
  if (reasons.length) return { status: room.windowOpen ? 'airing' : 'ventilate', ...base };
  if (room.windowOpen && diff !== null && diff <= -cfg.minDifference) return { status: 'close', ...base, reasons: ['humidOutside'] };
  if (room.co2 === null && ah === null) return { status: 'unknown', ...base };
  return { status: 'ok', ...base };
}

/** Text of a recommendation. */
export function adviceText(name, r, values) {
  if (r.status === 'close') return `${name}: Fenster schließen – die Außenluft ist feuchter (${de(r.outdoorAbs)} statt ${de(r.absHumidity)} g/m³)`;
  const why = r.reasons.map((x) =>
    x === 'co2'
      ? `CO₂ ${Math.round(values.co2)} ppm`
      : x === 'humidity'
        ? `Luftfeuchte ${Math.round(values.humidity)} %, außen trockener (${de(r.outdoorAbs)} statt ${de(r.absHumidity)} g/m³)`
        : `${de(values.temperature)} °C, draußen ${de(values.outdoorTemperature)} °C`,
  );
  return `${name} lüften: ${why.join(' · ')}`;
}

/** Computes the advice continuously and emits `change` when it changes. */
export class VentilationService extends EventEmitter {
  /**
   * @param {object} deps
   * @param {() => object} deps.getConfig effective configuration
   * @param {(id: string) => unknown} deps.getValue current value of a datapoint
   * @param {() => Promise<{temperature: number|null, humidity: number|null}|null>} [deps.fetchOutdoor] internet fallback
   * @param {() => object[]} [deps.getKioskAgents] wall displays with a CO₂ sensor (see `kioskRooms`)
   * @param {() => number} [deps.now]
   */
  constructor({ getConfig, getValue, fetchOutdoor = async () => null, getKioskAgents = () => [], now = () => Date.now() }) {
    super();
    Object.assign(this, { getConfig, getValue, fetchOutdoor, getKioskAgents, now });
    this.cfg = sanitizeVentilation();
    this.rooms = [];
    this.ids = new Set();
    this.results = new Map(); // room id -> {status, reasons, since, …}
    this.internet = null; // last internet outdoor values
    this.internetAt = 0;
    this.timer = null;
    this.debounce = null;
    this.sig = '';
    this.state = this.emptyState();
  }

  emptyState() {
    return { enabled: false, outdoor: null, rooms: [] };
  }

  /** Re-reads the configuration (after saving the settings). */
  configure() {
    const full = this.getConfig();
    this.cfg = sanitizeVentilation(full.ventilation);
    this.rooms = this.cfg.rooms.length ? this.cfg.rooms : autoRooms(full);
    this.roomNames = new Map((full.rooms || []).map((r) => [r.id, r.name]));
    this.ids = new Set(ventilationStateIds(full));
    this.outdoorIds = outdoorIds({ ...full, ventilation: this.cfg });
    this.results.clear();
    clearInterval(this.timer);
    this.timer = null;
    if (this.cfg.enabled) {
      this.timer = setInterval(() => this.evaluate(), TICK_MS);
      this.timer.unref?.();
    }
    this.evaluate(true);
  }

  /** Called for every state change; relevant changes are evaluated after a short pause. */
  onState(stateId) {
    if (!this.cfg.enabled || !(this.ids.has(stateId) || isKioskReading(stateId)) || this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.evaluate();
    }, 2000);
    this.debounce.unref?.();
  }

  /** Outdoor values: datapoints / weather station, otherwise the internet weather (fetched in the background). */
  outdoor() {
    const t = num(this.getValue(this.outdoorIds.temperature));
    const h = num(this.getValue(this.outdoorIds.humidity));
    if (t !== null && h !== null) return { temperature: t, humidity: h, source: 'sensor' };
    if (this.now() - this.internetAt > OUTDOOR_FETCH_MS) {
      this.internetAt = this.now();
      this.fetchOutdoor()
        .then((o) => {
          if (o && num(o.temperature) !== null && num(o.humidity) !== null) {
            this.internet = { temperature: num(o.temperature), humidity: num(o.humidity) };
            this.evaluate();
          }
        })
        .catch(() => {});
    }
    if (this.internet) return { temperature: t ?? this.internet.temperature, humidity: h ?? this.internet.humidity, source: 'internet' };
    return { temperature: t, humidity: h, source: t === null && h === null ? null : 'sensor' };
  }

  /** Computes all rooms; emits `change` if a status, a reason or a displayed value changed. */
  evaluate(force = false) {
    if (!this.cfg.enabled) {
      this.state = this.emptyState();
    } else {
      const outdoor = this.outdoor();
      const rooms = [...this.rooms, ...kioskRooms(this.getKioskAgents(), this.rooms)].map((r) => {
        const values = 'kioskCo2' in r
          ? { temperature: null, humidity: null, co2: r.kioskCo2, windowOpen: null }
          : {
              temperature: num(this.getValue(r.temperature)),
              humidity: num(this.getValue(r.humidity)),
              co2: num(this.getValue(r.co2)),
              windowOpen: r.window ? isOpen(this.getValue(r.window)) : null,
            };
        const prev = this.results.get(r.id) ?? null;
        const res = evaluateRoom(values, outdoor, this.cfg, prev);
        const since = prev && prev.status === res.status ? prev.since : this.now();
        this.results.set(r.id, { status: res.status, reasons: res.reasons, since });
        const name = r.name || this.roomNames.get(r.room) || r.room || r.id;
        return {
          id: r.id,
          room: r.room || null,
          name,
          ...values,
          temperature: values.temperature === null ? null : round(values.temperature, 1),
          absHumidity: res.absHumidity,
          status: res.status,
          reasons: res.reasons,
          humidOutside: res.humidOutside,
          severity: res.severity,
          since,
          message: res.status === 'ventilate' || res.status === 'close' ? adviceText(name, res, { ...values, outdoorTemperature: outdoor.temperature }) : '',
        };
      });
      const abs = absoluteHumidity(outdoor.temperature, outdoor.humidity);
      this.state = {
        enabled: true,
        outdoor: { temperature: outdoor.temperature === null ? null : round(outdoor.temperature, 1), humidity: outdoor.humidity === null ? null : Math.round(outdoor.humidity), absHumidity: abs === null ? null : round(abs, 1), source: outdoor.source },
        rooms,
      };
    }
    const sig = JSON.stringify(this.state.rooms.map((r) => [r.id, r.status, r.reasons, r.severity, r.message]).concat([this.state.enabled, this.state.outdoor?.absHumidity ?? null]));
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.emit('change');
  }

  /** Current advice for the browser. */
  data() {
    return this.state;
  }

  /** Active recommendations as hints (alert shape). */
  hints() {
    return this.state.rooms
      .filter((r) => r.status === 'ventilate' || (r.status === 'close' && this.cfg.closeHints))
      .map((r) => ({
        id: `ventilation:${r.id}:${r.status}`,
        name: r.status === 'close' ? 'Fenster schließen' : 'Lüften',
        severity: r.status === 'close' ? 'info' : r.severity,
        message: r.message,
        value: null,
        since: r.since,
        view: 'rooms',
        room: r.room,
        requireAck: false,
        acked: false,
        ackedAt: null,
        cleared: false,
        clearedAt: null,
        source: 'ventilation',
      }));
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.debounce);
  }
}
