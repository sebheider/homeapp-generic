/**
 * User-defined alerts ("Benachrichtigungen").
 *
 * A rule watches one ioBroker datapoint and raises a notification while a condition holds, e.g.
 *   { name: 'Luftfeuchte Bad', state: 'hm-rpc.0.X.1.HUMIDITY', op: '>', value: 65, severity: 'warning',
 *     message: 'Luftfeuchte im Bad bei {value} %', hysteresis: 3, delaySeconds: 300, view: 'climate' }
 *
 *   op            '>', '>=', '<', '<=' (numeric), '==', '!=' (number or text), 'on', 'off' (switch states)
 *   hysteresis    numeric rules only: the alert clears only after the value moved this far back
 *                 (e.g. > 65 with hysteresis 3 clears below 62), so it does not flicker around the limit
 *   delaySeconds  the condition must hold this long before the alert is raised (ignores short peaks)
 *   severity      'alarm' (red), 'warning' (orange) or 'info' (blue)
 *   message       text shown to the user; `{value}` is replaced by the current value
 *   view / room   where a click on the notification jumps to (a page of the app, optionally a room)
 *   push          also sent as a push notification (Pushover, if set up); default: on
 *   requireAck    the alert stays visible until it was acknowledged ("quittiert"), even if the
 *                 condition is gone again; default: on for alarms, off otherwise
 *
 * The {@link AlertMonitor} evaluates the rules on every state change and emits `change` with the
 * list of active alerts, which the server pushes to all browsers.
 *
 * Life cycle of an alert that requires acknowledgement:
 *   condition holds  -> active, unacknowledged   (shown permanently, cannot be hidden)
 *   acknowledged     -> active, acknowledged     (normal notification until the condition is gone)
 *   condition gone   -> cleared, unacknowledged  (still shown permanently until acknowledged)
 *   acknowledged     -> removed
 * Unacknowledged alerts are persisted, so they survive a restart of the server.
 */
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { writeFileAtomic } from './util/fs.js';
import { isOn } from './util/states.js';
import { trimText } from './util/text.js';

export const ALERT_OPS = ['>', '>=', '<', '<=', '==', '!=', 'on', 'off'];
export const SEVERITIES = ['alarm', 'warning', 'info'];
/** Pages of the app a notification can jump to. */
export const VIEWS = ['home', 'weather', 'rooms', 'lights', 'climate', 'energy', 'cameras', 'mower', 'settings'];

const NUMERIC_OPS = new Set(['>', '>=', '<', '<=']);
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/**
 * Whether the condition of a rule holds for `val`.
 * @param {object} rule sanitised rule
 * @param {unknown} val current value of the datapoint
 * @param {boolean} [active] whether the alert is currently active (applies the hysteresis)
 */
export function conditionHolds(rule, val, active = false) {
  if (val === undefined || val === null) return false;
  if (rule.op === 'on') return isOn(val);
  if (rule.op === 'off') return !isOn(val);
  if (rule.op === '==' || rule.op === '!=') {
    const a = num(val);
    const b = num(rule.value);
    const equal = Number.isFinite(a) && Number.isFinite(b) ? a === b : String(val) === String(rule.value);
    return rule.op === '==' ? equal : !equal;
  }
  const v = num(val);
  const limit = num(rule.value);
  if (!Number.isFinite(v) || !Number.isFinite(limit)) return false;
  // while active, the limit is moved back by the hysteresis so small fluctuations do not clear the alert
  const h = active ? rule.hysteresis || 0 : 0;
  if (rule.op === '>') return v > limit - h;
  if (rule.op === '>=') return v >= limit - h;
  if (rule.op === '<') return v < limit + h;
  return v <= limit + h; // '<='
}

/** Formats a value for the message: numbers with at most one decimal, booleans as an/aus. */
export function formatValue(val) {
  if (typeof val === 'number') return String(Math.round(val * 10) / 10).replace('.', ',');
  if (typeof val === 'boolean') return val ? 'an' : 'aus';
  return String(val ?? '');
}

/** Cleans the alert rules coming from the settings editor (types, ranges, unknown fields). */
export function sanitizeAlerts(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .slice(0, 100)
    .filter((r) => r && typeof r === 'object')
    .map((r, i) => {
      const op = ALERT_OPS.includes(r.op) ? r.op : '>';
      const value = NUMERIC_OPS.has(op) ? (Number.isFinite(num(r.value)) ? num(r.value) : 0) : typeof r.value === 'number' ? r.value : trimText(r.value, 60);
      const severity = SEVERITIES.includes(r.severity) ? r.severity : 'warning';
      return {
        id: trimText(r.id, 40) || `alarm_${i + 1}`,
        name: trimText(r.name, 60) || `Benachrichtigung ${i + 1}`,
        enabled: r.enabled !== false,
        state: trimText(r.state, 200),
        op,
        value,
        hysteresis: Math.max(0, Number(r.hysteresis) || 0),
        delaySeconds: Math.min(86400, Math.max(0, Math.round(Number(r.delaySeconds) || 0))),
        severity,
        message: trimText(r.message, 200),
        view: VIEWS.includes(r.view) ? r.view : '',
        room: trimText(r.room, 60),
        // alarms have to be acknowledged unless the rule says otherwise
        requireAck: typeof r.requireAck === 'boolean' ? r.requireAck : severity === 'alarm',
        push: r.push !== false,
      };
    });
}

/** True for an alert that waits for its acknowledgement. */
export const needsAck = (a) => Boolean(a?.requireAck && !a.acked);

/**
 * Persistence of the unacknowledged alerts as a JSON file (written atomically).
 * @param {string} file path of the file
 * @returns {{load: () => object[], save: (list: object[]) => void}}
 */
export function jsonFileStore(file) {
  return {
    load() {
      try {
        const list = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(list) ? list.filter((a) => a && typeof a.id === 'string') : [];
      } catch {
        return []; // first start or unreadable file
      }
    },
    save(list) {
      try {
        writeFileAtomic(file, JSON.stringify(list));
      } catch (err) {
        console.error('Benachrichtigungen konnten nicht gespeichert werden:', err.message);
      }
    },
  };
}

/** Evaluates the alert rules against the live states and keeps the list of active alerts. */
export class AlertMonitor extends EventEmitter {
  /**
   * @param {() => object[]} getRules returns the current (sanitised) rules
   * @param {(id: string) => unknown} [getValue] current value of a datapoint (used when a delay elapses)
   * @param {{load: () => object[], save: (list: object[]) => void}|null} [store] keeps unacknowledged alerts across restarts
   */
  constructor(getRules, getValue = () => undefined, store = null) {
    super();
    this.getRules = getRules;
    this.getValue = getValue;
    this.store = store;
    /** rule id -> alert (active, or cleared but not yet acknowledged) */
    this.active = new Map();
    /** rule id -> timer of a condition that waits for its delay */
    this.pending = new Map();
    for (const a of store?.load() ?? []) if (needsAck(a)) this.active.set(a.id, a);
    /** signature of the persisted alerts; the file is only written when it changes */
    this.persisted = this.signature();
  }

  /** Alerts for the browser: unacknowledged first, then by severity, then newest first. */
  list() {
    const rank = (s) => SEVERITIES.indexOf(s);
    return [...this.active.values()].sort((a, b) => Number(needsAck(b)) - Number(needsAck(a)) || rank(a.severity) - rank(b.severity) || b.since - a.since);
  }

  /** Emits the new list and persists the unacknowledged alerts if they changed. */
  changed() {
    const sig = this.signature();
    if (this.store && sig !== this.persisted) this.store.save([...this.active.values()].filter(needsAck));
    this.persisted = sig;
    this.emit('change', this.list());
  }

  /** Identity of the unacknowledged alerts (values are not part of it, they change all the time). */
  signature() {
    return [...this.active.values()]
      .filter(needsAck)
      .map((a) => `${a.id}:${a.since}:${a.cleared ? 1 : 0}`)
      .sort()
      .join('|');
  }

  /**
   * Prepares a re-evaluation after a configuration change; call {@link evaluateAll} afterwards.
   * Unacknowledged alerts stay (with the current name / severity / target of their rule) as long as
   * their rule still exists and still requires acknowledgement; everything else is forgotten.
   */
  reset() {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    const rules = new Map(this.getRules().map((r) => [r.id, r]));
    const before = this.active.size;
    for (const [id, a] of this.active) {
      const rule = rules.get(id);
      if (needsAck(a) && rule?.requireAck) this.active.set(id, { ...a, name: rule.name, severity: rule.severity, view: rule.view || null, room: rule.room || null });
      else this.active.delete(id);
    }
    if (before || this.active.size) this.changed();
  }

  /** Evaluates every rule against a complete state map (id -> { val }). */
  evaluateAll(states) {
    for (const rule of this.getRules()) {
      if (states.has(rule.state)) this.evaluate(rule, states.get(rule.state).val);
    }
  }

  /** Called for every state change. */
  onState(id, entry) {
    for (const rule of this.getRules()) if (rule.state === id) this.evaluate(rule, entry.val);
  }

  /** Applies one new value to one rule: raises, updates or clears its alert. */
  evaluate(rule, val) {
    if (!rule.enabled || !rule.state) return;
    const current = this.active.get(rule.id);
    // a cleared alert that only waits for its acknowledgement is not "active" (no hysteresis)
    const live = current && !current.cleared ? current : null;
    const holds = conditionHolds(rule, val, Boolean(live));
    if (!holds) {
      clearTimeout(this.pending.get(rule.id));
      this.pending.delete(rule.id);
      if (live) {
        // unacknowledged alerts stay until they are acknowledged; the others disappear
        if (needsAck(live)) this.active.set(rule.id, { ...live, value: val, cleared: true, clearedAt: Date.now() });
        else this.active.delete(rule.id);
        this.changed();
      }
      return;
    }
    if (live) {
      // still active: only refresh the value shown in the message
      if (live.value !== val) {
        this.active.set(rule.id, { ...live, ...this.build(rule, val, live.since), acked: live.acked, ackedAt: live.ackedAt });
        this.changed();
      }
      return;
    }
    if (rule.delaySeconds > 0) {
      // the condition must hold for the whole delay; a value that breaks it cancels the timer (see above)
      if (this.pending.has(rule.id)) return;
      this.pending.set(
        rule.id,
        setTimeout(() => {
          this.pending.delete(rule.id);
          this.raise(rule, this.getValue(rule.state) ?? val);
        }, rule.delaySeconds * 1000),
      );
      return;
    }
    this.raise(rule, val);
  }

  /** Activates the alert of a rule (again). A cleared, still unacknowledged alert keeps its start time. */
  raise(rule, val) {
    const waiting = this.active.get(rule.id);
    this.active.set(rule.id, this.build(rule, val, needsAck(waiting) ? waiting.since : Date.now()));
    this.changed();
  }

  /**
   * Acknowledges an alert: a cleared one disappears, an active one stays as a normal notification
   * until its condition is gone.
   * @returns {boolean} false if there was nothing to acknowledge
   */
  ack(id) {
    if (!needsAck(this.active.get(id))) return false;
    this.settle(id);
    this.changed();
    return true;
  }

  /** Acknowledges every alert that waits for it; returns how many there were. */
  ackAll() {
    const ids = [...this.active.values()].filter(needsAck).map((a) => a.id);
    ids.forEach((id) => this.settle(id));
    if (ids.length) this.changed();
    return ids.length;
  }

  /** Marks one alert as acknowledged (without emitting). */
  settle(id) {
    const a = this.active.get(id);
    if (a.cleared) this.active.delete(id);
    else this.active.set(id, { ...a, acked: true, ackedAt: Date.now() });
  }

  /** The alert object as sent to the browser. */
  build(rule, val, since) {
    const value = formatValue(val);
    return {
      id: rule.id,
      name: rule.name,
      severity: rule.severity,
      message: (rule.message || `${rule.name}: {value}`).replaceAll('{value}', value),
      value: val,
      since,
      view: rule.view || null,
      room: rule.room || null,
      requireAck: Boolean(rule.requireAck),
      acked: false,
      ackedAt: null,
      cleared: false,
      clearedAt: null,
    };
  }

  /** Cancels pending timers (shutdown). */
  stop() {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}
