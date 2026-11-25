/**
 * Motion hub.
 *
 * Motion can be reported by independent sources:
 *   1. the Surveillance Station (polling of new recordings),
 *   2. a webhook called by a Surveillance Station action rule (fastest),
 *   3. ioBroker datapoints of a motion detector that is mapped to a camera.
 *
 * Two kinds of detection are kept apart:
 *   - "motion"  normal motion detection,
 *   - "people"  advanced motion detection (person / object recognition of the Surveillance Station).
 *
 * All sources end up in {@link MotionHub.trigger}. It debounces per camera *and kind* (cooldown), so a
 * normal motion event never suppresses a person event, and emits one `motion` event that the
 * browsers turn into a pop-up. Whether a pop-up is shown can be set per kind (globally and per camera)
 * and by schedule rules (see popup-rules.js: e.g. only people by day, everything at night).
 */
import { EventEmitter } from 'node:events';
import { kindPopupAllowed } from './popup-rules.js';
import { isOn } from './util.js';

/** Motion history shown by the dashboard's six-hour activity timeline. */
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000;
const RECENT_LIMIT = 5000;

/** Normalises free input ("person", "people", "advanced", ...) to a known kind. */
export function normalizeKind(value) {
  const v = String(value || '').toLowerCase();
  return /people|person|advanced|human|erweitert|personen/.test(v) ? 'people' : 'motion';
}

/** Merges motion signals (Surveillance Station, webhook, ioBroker states) and debounces them per camera and kind. */
export class MotionHub extends EventEmitter {
  /**
   * @param {() => object} getConfig returns the effective configuration
   * @param {(id: string|number) => string|undefined} [getCameraName] display name of a camera (incl. user overrides)
   */
  constructor(getConfig, getCameraName = () => undefined) {
    super();
    this.getConfig = getConfig;
    this.getCameraName = getCameraName;
    /** `<camera>:<kind>` -> time of the last accepted event (cooldown) */
    this.last = new Map();
    /** state id -> previous value, to detect rising edges in {@link onState} */
    this.prev = new Map();
    /** Newest first, no older than RECENT_WINDOW_MS and at most RECENT_LIMIT entries. */
    this.recent = [];
  }

  /**
   * Reports motion of a camera.
   * @param {{cameraId: string|number, source: string, kind?: 'motion'|'people', reason?: number|string}} e
   * @returns {boolean} false if it was ignored (hidden camera or cooldown)
   */
  trigger({ cameraId, source, kind = 'motion', reason }) {
    kind = normalizeKind(kind);
    const cfg = this.getConfig();
    const cam = cfg.cameras.find((c) => String(c.id) === String(cameraId));
    if (cam?.hidden) return false;
    const cooldown = (cfg.surveillance.motionCooldownSeconds ?? 60) * 1000;
    const key = `${cameraId}:${kind}`;
    const now = Date.now();
    if (now - (this.last.get(key) || 0) < cooldown) return false;
    this.last.set(key, now);

    // pop-up switches: global per kind, schedule rules, per camera master switch and per camera per kind
    const globalOn = kindPopupAllowed(cfg.app, kind, cameraId, new Date(now));
    const camKindOn = kind === 'people' ? cam?.popupPeople !== false : cam?.popupMotion !== false;
    const event = {
      cameraId: String(cameraId),
      name: this.getCameraName(cameraId) || cam?.name || `Kamera ${cameraId}`,
      ts: now,
      source,
      kind,
      reason: reason ?? null,
      popup: globalOn && cam?.popup !== false && camKindOn,
    };
    this.recent = [event, ...this.recent.filter((e) => now - e.ts < RECENT_WINDOW_MS)].slice(0, RECENT_LIMIT);
    this.emit('motion', event);
    return true;
  }

  /** Called for every state change; fires for cameras whose motion / people datapoint switches on. */
  onState(id, entry) {
    const val = entry.val;
    const prev = this.prev.get(id);
    this.prev.set(id, val);
    // only a rising edge (off -> on) counts; the very first value after (re)connecting is ignored
    if (prev === undefined || isOn(prev) || !isOn(val)) return;
    for (const cam of this.getConfig().cameras) {
      if (cam.motionState === id) this.trigger({ cameraId: cam.id, source: 'ioBroker', kind: 'motion' });
      if (cam.peopleState === id) this.trigger({ cameraId: cam.id, source: 'ioBroker', kind: 'people' });
    }
  }
}
