/**
 * The kiosk hub: local datapoints of all agents, their online state, screen wake-ups and the live radar.
 */
import { EventEmitter } from 'node:events';
import { searchObjects } from '../util/states.js';
import { KIOSK_PREFIX, KIOSK_VALUES, agentId, cleanRadar, cleanValue } from './readings.js';
import { WAKE_SEVERITIES } from './settings.js';

const MAX_AGENTS = 20;
const OFFLINE_MS = 90 * 1000;
/** Most event streams of agents open at the same time. */
export const MAX_STREAMS = 50;
/** The latest wake is repeated in report answers this long (agents that missed the push). */
const WAKE_REPEAT_MS = 60 * 60 * 1000;

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
