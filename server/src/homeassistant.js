import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { searchObjects } from './util/states.js';

const RETRY_MS = 10000;
const REQUEST_TIMEOUT = 15000;
const entityId = (id) => id.split('#')[0];

export function homeAssistantValue(value) {
  if (value === 'on') return true;
  if (value === 'off') return false;
  if (value === 'unknown' || value === 'unavailable' || value == null) return null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
}

export function homeAssistantCommand(id, value) {
  const [entity, attribute] = id.split('#');
  const domain = entity.split('.')[0];
  const target = { entity_id: entity };
  if (!attribute && ['scene', 'button', 'input_button'].includes(domain)) {
    if (value !== true) throw new Error('Diese Aktion erwartet den Wert true');
    return { domain, service: domain === 'scene' ? 'turn_on' : 'press', service_data: target };
  }
  if (!attribute && ['light', 'switch', 'input_boolean', 'fan'].includes(domain)) {
    if (typeof value !== 'boolean') throw new Error('Ein/Aus erwartet einen booleschen Wert');
    return { domain, service: value ? 'turn_on' : 'turn_off', service_data: target };
  }
  if (domain === 'climate' && !attribute) {
    if (typeof value !== 'string' || !value) throw new Error('Betriebsart muss eine Zeichenkette sein');
    return { domain, service: 'set_hvac_mode', service_data: { ...target, hvac_mode: value } };
  }
  if (domain === 'light' && attribute === 'rgb_color') {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Farbe muss ein Hexwert wie #ff8800 sein');
    const rgb = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    return { domain, service: 'turn_on', service_data: { ...target, rgb_color: rgb } };
  }
  const mappings = {
    'light#brightness': ['turn_on', 'brightness'],
    'cover#current_position': ['set_cover_position', 'position'],
    'climate#temperature': ['set_temperature', 'temperature'],
    'climate#fan_mode': ['set_fan_mode', 'fan_mode'],
    'fan#percentage': ['set_percentage', 'percentage'],
    'number#state': ['set_value', 'value'],
    'input_number#state': ['set_value', 'value'],
    'select#state': ['select_option', 'option'],
    'input_select#state': ['select_option', 'option'],
  };
  const mapping = mappings[`${domain}#${attribute || 'state'}`];
  if (!mapping) throw new Error(`Home Assistant: Schreiben für ${id} wird nicht unterstützt`);
  if (['brightness', 'position', 'temperature', 'percentage', 'value'].includes(mapping[1])) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Ein gültiger Zahlenwert wird erwartet');
    if ((mapping[1] === 'brightness' && (value < 0 || value > 255)) || (['position', 'percentage'].includes(mapping[1]) && (value < 0 || value > 100))) throw new Error('Wert außerhalb des zulässigen Bereichs');
  }
  if (['option', 'fan_mode'].includes(mapping[1]) && (typeof value !== 'string' || !value)) throw new Error('Eine gültige Auswahl wird erwartet');
  return { domain, service: mapping[0], service_data: { ...target, [mapping[1]]: value } };
}

/** Home Assistant entities are exposed as entity_id and entity_id#attribute. */
export class HomeAssistantSource extends EventEmitter {
  constructor({ WebSocketClass = WebSocket, retryMs = RETRY_MS } = {}) {
    super();
    this.kind = 'homeassistant';
    this.WebSocketClass = WebSocketClass;
    this.retryMs = retryMs;
    this.states = new Map();
    this.objects = new Map();
    this.entities = new Map();
    this.wanted = new Set();
    this.pending = new Map();
    this.connected = false;
    this.error = null;
    this.generation = 0;
    this.nextId = 0;
  }

  start(cfg) {
    this.stop();
    this.cfg = cfg;
    let url;
    try {
      url = new URL(cfg.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Ungültige Adresse');
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = `${url.pathname.replace(/\/$/, '')}/api/websocket`;
      if (!cfg.token) throw new Error('Home-Assistant-Zugriffstoken fehlt');
    } catch (err) {
      this.error = `Home Assistant: ${err.message}`;
      this.emit('connection');
      return;
    }
    this.url = url.toString();
    this.open(++this.generation);
  }

  stop() {
    this.generation++;
    clearTimeout(this.retry);
    this.retry = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.on('error', () => {});
      this.socket.terminate();
      this.socket = null;
    }
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('Home-Assistant-Verbindung geschlossen'));
    }
    this.pending.clear();
    this.connected = false;
    this.states.clear();
    this.objects.clear();
    this.entities.clear();
  }

  open(gen) {
    const socket = new this.WebSocketClass(this.url, { rejectUnauthorized: this.cfg.verifySsl !== false, handshakeTimeout: 10000 });
    this.socket = socket;
    let authFailed = false;
    socket.on('message', async (raw) => {
      if (gen !== this.generation) return;
      let msg;
      try { msg = JSON.parse(String(raw)); } catch {
        this.error = 'Home Assistant: Ungültige WebSocket-Antwort';
        socket.close();
        return;
      }
      if (msg.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: this.cfg.token }));
      else if (msg.type === 'auth_invalid') {
        this.error = 'Home Assistant: Zugriffstoken ungültig';
        authFailed = true;
        socket.close();
      } else if (msg.type === 'auth_ok') {
        try {
          this.initialEvents = [];
          await this.request({ type: 'subscribe_events', event_type: 'state_changed' });
          const snapshot = await this.request({ type: 'get_states' });
          if (gen !== this.generation) return;
          for (const entity of snapshot) this.applyEntity(entity);
          for (const data of this.initialEvents) this.applyEvent(data);
          this.initialEvents = null;
          this.connected = true;
          this.error = null;
          this.emit('connection');
        } catch (err) {
          if (gen !== this.generation) return;
          this.error = `Home Assistant: ${err.message}`;
          socket.close();
        }
      } else if (msg.type === 'result') {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.success) pending.resolve(msg.result);
        else pending.reject(new Error(msg.error?.message || 'Home-Assistant-Anfrage fehlgeschlagen'));
      } else if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
        const data = msg.event.data || {};
        if (this.initialEvents) this.initialEvents.push(data);
        else this.applyEvent(data);
      }
    });
    socket.on('error', (err) => {
      if (gen === this.generation) this.error = `Home Assistant: ${err.message}`;
    });
    socket.on('close', () => {
      if (gen !== this.generation) return;
      const error = this.error || 'Home Assistant: Verbindung getrennt';
      for (const id of this.states.keys()) this.emit('state', id, { val: null, ts: Date.now(), ack: true });
      this.stop();
      this.error = error;
      this.emit('connection');
      if (authFailed) return;
      const next = this.generation;
      this.retry = setTimeout(() => this.open(next), this.retryMs);
    });
  }

  request(message) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== 1) return reject(new Error('Nicht verbunden'));
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Zeitüberschreitung'));
      }, REQUEST_TIMEOUT);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, ...message }));
    });
  }

  removeEntity(id) {
    this.entities.delete(id);
    for (const key of [...this.objects.keys()]) {
      if (entityId(key) === id) {
        this.objects.delete(key);
        if (this.states.delete(key)) this.emit('state', key, { val: null, ts: Date.now(), ack: true });
      }
    }
  }

  applyEvent({ entity_id, new_state }) {
    if (new_state) this.applyEntity(new_state);
    else if (entity_id) this.removeEntity(entity_id);
  }

  applyEntity(entity) {
    if (!entity?.entity_id) return;
    const id = entity.entity_id;
    for (const key of [...this.objects.keys()]) if (entityId(key) === id) this.objects.delete(key);
    const previous = [...this.states.keys()].filter((key) => entityId(key) === id);
    this.entities.set(id, entity);
    const values = { [id]: entity.state, ...Object.fromEntries(Object.entries(entity.attributes || {}).map(([k, v]) => [`${id}#${k}`, v])) };
    for (const [key, raw] of Object.entries(values)) {
      const val = key.endsWith('#rgb_color') && Array.isArray(raw) && raw.length === 3 && raw.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
        ? `#${raw.map((n) => n.toString(16).padStart(2, '0')).join('')}` : homeAssistantValue(raw);
      const name = entity.attributes?.friendly_name || id;
      let writable = false;
      const commandValue = key === id && ['scene', 'button', 'input_button'].includes(id.split('.')[0]) ? true : val;
      try { homeAssistantCommand(key, commandValue); writable = true; } catch { /* read-only or unavailable entity */ }
      this.objects.set(key, { id: key, name: key === id ? name : `${name} ${key.split('#')[1]}`, type: typeof val, role: key.split('#')[1] || '', unit: entity.attributes?.unit_of_measurement, write: writable });
      if (this.wanted.has(key)) {
        const entry = { val, ts: Date.parse(entity.last_updated) || Date.now(), ack: true };
        this.states.set(key, entry);
        this.emit('state', key, entry);
      }
    }
    for (const key of previous) if (!Object.hasOwn(values, key)) {
      this.states.delete(key);
      this.emit('state', key, { val: null, ts: Date.now(), ack: true });
    }
  }

  setIds(ids) {
    this.wanted = new Set(ids);
    for (const id of [...this.states.keys()]) if (!this.wanted.has(id)) this.states.delete(id);
    for (const entity of [...this.entities.values()]) this.applyEntity(entity);
  }
  read(id) {
    const [entity, attribute] = id.split('#');
    const state = this.entities.get(entity);
    return Promise.resolve(homeAssistantValue(attribute ? state?.attributes?.[attribute] : state?.state));
  }
  search(q, limit = 30) { return searchObjects(this.objects.values(), q, limit); }
  discover() {
    const devices = [];
    const scenes = [];
    for (const [entityId, entity] of this.entities) {
      const domain = entityId.split('.')[0];
      const attrs = entity.attributes || {};
      if (domain === 'scene') {
        scenes.push({ id: `ha_${entityId.replaceAll('.', '_')}`, name: attrs.friendly_name || entityId, icon: 'sparkles', actions: [{ state: entityId, value: true }] });
        continue;
      }
      let type;
      let states;
      let options = {};
      if (domain === 'light') {
        type = 'light';
        states = { power: entityId };
        if (Object.hasOwn(attrs, 'brightness')) {
          states.brightness = `${entityId}#brightness`;
          options = { brightnessMax: 255 };
        }
      } else if (['switch', 'input_boolean'].includes(domain)) {
        type = 'switch';
        states = { power: entityId };
      } else if (domain === 'cover' && Object.hasOwn(attrs, 'current_position')) {
        type = 'blind';
        states = { position: `${entityId}#current_position` };
      } else if (domain === 'climate' && Object.hasOwn(attrs, 'temperature')) {
        type = 'thermostat';
        states = { target: `${entityId}#temperature` };
        if (Object.hasOwn(attrs, 'current_temperature')) states.current = `${entityId}#current_temperature`;
        options = { min: attrs.min_temp ?? 5, max: attrs.max_temp ?? 30, step: attrs.target_temp_step ?? 0.5 };
      } else if (['sensor', 'binary_sensor'].includes(domain)) {
        type = 'sensor';
        states = { value: entityId };
        const kinds = { temperature: 'temperature', humidity: 'humidity', power: 'power', energy: 'energy', battery: 'battery', illuminance: 'lux', motion: 'motion', presence: 'presence', door: 'door', window: 'window', smoke: 'smoke', moisture: 'water' };
        options = { kind: kinds[attrs.device_class] || 'generic', ...(attrs.unit_of_measurement ? { unit: attrs.unit_of_measurement } : {}) };
      } else continue;
      devices.push({ id: `ha_${entityId.replaceAll('.', '_')}`, type, name: attrs.friendly_name || entityId, room: 'home_assistant', states, options });
    }
    return { rooms: devices.length ? [{ id: 'home_assistant', name: 'Home Assistant', icon: 'home', floor: 0 }] : [], devices, scenes, energy: null, weather: null };
  }
  async set(id, value) {
    if (!this.connected) throw new Error('Home Assistant nicht verbunden');
    await this.request({ type: 'call_service', ...homeAssistantCommand(id, value) });
  }
  status() { return { connected: this.connected, error: this.error, objects: this.objects.size }; }
}
