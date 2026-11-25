/**
 * Push notifications to phones via Pushover (https://pushover.net).
 *
 * Configuration (section `pushover`):
 *   enabled     master switch
 *   user        user or group key of the receiver (secret, never sent to the browser)
 *   token       API token of the own Pushover application (secret)
 *   device      device name(s), comma separated; empty = all devices of the account
 *   sound       Pushover sound name; empty = the default of the account
 *   appUrl      address of the app; a notification then links to the matching page
 *   quietFrom / quietUntil  'HH:MM' (server time); in between, notifications with normal or low priority
 *               arrive silently (priority -1). High priority and emergencies still make a sound.
 *   attachImage camera / printer webcam picture is attached to camera and printer notifications
 *   cameraFollowPopup  camera notifications only when the pop-up would appear (pop-up switches and schedule)
 *   printerProgressMinutes  interval of the regular status updates while printing (event `printerProgress`)
 *   events      per kind of event { enabled, priority }, see {@link PUSH_EVENTS}
 *
 * Nothing is sent in demo mode (the simulation produces events all the time); the test message works.
 */
import { toMinutes } from './popup-rules.js';

export const PUSHOVER_API = 'https://api.pushover.net/1/messages.json';
/** Pushover priorities: -2 no notification, -1 silent, 0 normal, 1 high (bypasses quiet hours of the phone), 2 emergency (repeated until confirmed). */
export const PRIORITIES = [-2, -1, 0, 1, 2];
/** Kinds of events that can be pushed, with their defaults. */
export const PUSH_EVENTS = {
  alarm: { enabled: true, priority: 1 }, // own notifications (Benachrichtigungen) of the kind "Alarm"
  warning: { enabled: true, priority: 0 }, // … "Warnung"
  info: { enabled: false, priority: -1 }, // … "Hinweis"
  cleared: { enabled: false, priority: -1 }, // the condition of a pushed own notification is gone again
  waste: { enabled: true, priority: 0 }, // waste collection reminder
  ventilation: { enabled: false, priority: -1 }, // ventilation advice (ventilate / close the window)
  printerDone: { enabled: true, priority: 0 },
  printerError: { enabled: true, priority: 1 },
  printerCancelled: { enabled: false, priority: 0 },
  printerPaused: { enabled: true, priority: 0 }, // e.g. filament run-out
  printerProgress: { enabled: false, priority: -1 }, // regular status update with webcam picture while printing
  people: { enabled: true, priority: 0 }, // camera: person detected (advanced detection)
  motion: { enabled: false, priority: -1 }, // camera: normal motion
};
/** Emergency notifications are repeated this often until confirmed in the Pushover app, at most this long. */
const EMERGENCY = { retry: 60, expire: 3600 };
/** At most this many notifications per window; protects the monthly quota of the Pushover application. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15000;
/** Pushover accepts attachments up to 5 MB, only real images. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)$/;
/** Interval of the printer status updates in minutes: default and range. */
export const PRINTER_PROGRESS_MINUTES = { default: 30, min: 5, max: 720 };

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const priority = (v, fallback) => (PRIORITIES.includes(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
const minutes = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== null && v !== '' ? Math.min(PRINTER_PROGRESS_MINUTES.max, Math.max(PRINTER_PROGRESS_MINUTES.min, n)) : PRINTER_PROGRESS_MINUTES.default;
};
const time = (v) => (v === '' || toMinutes(v) === null ? '' : String(v));

/** Cleans the Pushover settings (types, ranges, unknown fields). */
export function sanitizePushover(p = {}) {
  const v = p && typeof p === 'object' ? p : {};
  const events = v.events && typeof v.events === 'object' ? v.events : {};
  return {
    enabled: v.enabled === true,
    user: text(v.user, 50),
    token: text(v.token, 50),
    device: text(v.device, 100),
    sound: text(v.sound, 30),
    appUrl: /^https?:\/\//i.test(text(v.appUrl, 300)) ? text(v.appUrl, 300).replace(/\/+$/, '') : '',
    quietFrom: time(v.quietFrom),
    quietUntil: time(v.quietUntil),
    attachImage: v.attachImage !== false,
    cameraFollowPopup: v.cameraFollowPopup !== false,
    printerProgressMinutes: minutes(v.printerProgressMinutes),
    events: Object.fromEntries(
      Object.entries(PUSH_EVENTS).map(([key, d]) => {
        const e = events[key] && typeof events[key] === 'object' ? events[key] : {};
        return [key, { enabled: typeof e.enabled === 'boolean' ? e.enabled : d.enabled, priority: priority(e.priority, d.priority) }];
      }),
    ),
  };
}

/** Whether `date` lies in the quiet hours from–until (may run over midnight; equal times = no quiet hours). */
export function inQuietHours(cfg, date = new Date()) {
  const from = toMinutes(cfg.quietFrom);
  const until = toMinutes(cfg.quietUntil);
  if (from === null || until === null || from === until) return false;
  const m = date.getHours() * 60 + date.getMinutes();
  return from < until ? m >= from && m < until : m >= from || m < until;
}

/** Priority actually sent: during the quiet hours normal and low priorities arrive silently. */
export function effectivePriority(cfg, prio, date = new Date()) {
  return prio <= 0 && prio > -2 && inQuietHours(cfg, date) ? -1 : prio;
}

/** Link to a page of the app (null without an app address). */
export const appLink = (appUrl, view) => (appUrl ? `${appUrl}/${view ? `#${view}` : ''}` : null);

/** Event of an active notification: the source of waste / ventilation hints, otherwise the severity of the own rule. */
export const alertEvent = (a) => (a.source === 'waste' ? 'waste' : a.source === 'ventilation' ? 'ventilation' : a.severity);

/**
 * Follows the list of active notifications and tells which ones are new and which ones are over.
 * An alert is "live" while its condition holds (an acknowledged one, too); a cleared alert that only
 * waits for its acknowledgement is over. A new start time (`since`) counts as a new alert.
 */
export class AlertTracker {
  constructor() {
    /** id -> live alert */
    this.live = new Map();
  }

  /** @returns {{raised: object[], cleared: object[]}} */
  update(list) {
    const next = new Map(list.filter((a) => !a.cleared).map((a) => [a.id, a]));
    const raised = [...next.values()].filter((a) => this.live.get(a.id)?.since !== a.since && !a.acked);
    const cleared = [...this.live.values()]
      .filter((a) => next.get(a.id)?.since !== a.since)
      .map((a) => list.find((x) => x.id === a.id && x.since === a.since) ?? a);
    this.live = next;
    return { raised, cleared };
  }
}

/** Sends notifications through the Pushover API according to the settings. */
export class PushoverService {
  /**
   * @param {{fetchImpl?: typeof fetch, now?: () => number}} [opts]
   */
  constructor({ fetchImpl = (...args) => fetch(...args), now = () => Date.now() } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.cfg = sanitizePushover();
    this.demo = false;
    this.sentAt = [];
    this.lastSent = null;
    this.lastError = null;
    this.throttled = false;
  }

  configure(cfg, { demo = false } = {}) {
    this.cfg = sanitizePushover(cfg);
    this.demo = demo;
  }

  /** Configured, switched on and not in demo mode. */
  get active() {
    return Boolean(this.cfg.enabled && this.cfg.user && this.cfg.token && !this.demo);
  }

  /** Whether events of this kind are pushed at all. */
  wants(event) {
    return this.active && Boolean(this.cfg.events[event]?.enabled) && this.cfg.events[event].priority > -2;
  }

  /** State for the settings page. */
  status() {
    return { active: this.active, demo: this.demo, lastSent: this.lastSent, lastError: this.lastError };
  }

  /**
   * Pushes one event if its kind is switched on. Errors are logged, never thrown.
   * @param {string} event key of {@link PUSH_EVENTS}
   * @param {{title: string, message: string, view?: string|null, image?: () => Promise<{type: string, body: Buffer}|null>, forceImage?: boolean}} n
   *   `forceImage`: the picture is the point of the message, it is attached even when `attachImage` is off
   * @returns {Promise<boolean>} whether it was sent
   */
  async notify(event, { title, message, view = null, image = null, forceImage = false }) {
    if (!this.wants(event)) return false;
    const now = this.now();
    this.sentAt = this.sentAt.filter((t) => now - t < RATE_WINDOW_MS);
    if (this.sentAt.length >= RATE_LIMIT) {
      if (!this.throttled) console.warn(`[Pushover] Mehr als ${RATE_LIMIT} Nachrichten in 10 Minuten – weitere werden verworfen.`);
      this.throttled = true;
      return false;
    }
    this.throttled = false;
    this.sentAt.push(now);
    let attachment = null;
    if (image && (this.cfg.attachImage || forceImage)) {
      try {
        attachment = await image();
      } catch {
        attachment = null; // the notification is more important than the picture
      }
    }
    const url = appLink(this.cfg.appUrl, view);
    try {
      await this.send({ title, message, priority: effectivePriority(this.cfg, this.cfg.events[event].priority, new Date(now)), url, image: attachment });
      this.lastSent = { ts: now, title, event };
      return true;
    } catch (err) {
      this.lastError = { ts: now, message: err.message };
      console.warn(`[Pushover] ${title}: ${err.message}`);
      return false;
    }
  }

  /**
   * Sends one message (also used for the test message with unsaved credentials).
   * @param {{title: string, message: string, priority?: number, url?: string|null, image?: {type: string, body: Buffer}|null}} msg
   * @param {object} [cfg] settings to use; default: the configured ones
   */
  async send({ title, message, priority: prio = 0, url = null, image = null }, cfg = this.cfg) {
    if (!cfg.user || !cfg.token) throw new Error('Benutzer-Schlüssel und API-Token fehlen');
    const form = new FormData();
    form.set('token', cfg.token);
    form.set('user', cfg.user);
    form.set('title', text(title, 250) || 'HomeApp');
    form.set('message', text(message, 1024) || '–');
    form.set('priority', String(prio));
    if (prio === 2) {
      form.set('retry', String(EMERGENCY.retry));
      form.set('expire', String(EMERGENCY.expire));
    }
    if (cfg.device) form.set('device', cfg.device.replace(/\s+/g, ''));
    if (cfg.sound) form.set('sound', cfg.sound);
    if (url) {
      form.set('url', url);
      form.set('url_title', 'In der HomeApp öffnen');
    }
    if (image?.body && IMAGE_TYPES.test(image.type) && image.body.length <= MAX_IMAGE_BYTES) {
      form.set('attachment', new Blob([image.body], { type: image.type }), `bild.${image.type.split('/')[1]}`);
    }
    let res;
    try {
      res = await this.fetch(PUSHOVER_API, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new Error(`Pushover nicht erreichbar: ${err.cause?.code ?? err.message}`);
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* no JSON */
    }
    if (!res.ok || body?.status !== 1) {
      const errors = Array.isArray(body?.errors) && body.errors.length ? body.errors.join(', ') : `HTTP ${res.status}`;
      throw new Error(`Pushover lehnt ab: ${errors}`);
    }
    return body;
  }
}

/** Duration "1 h 25 min" / "12 min" of a print. */
export function formatDuration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/** Event and text of a print job event (`job` event of the PrinterService); null for events that are not pushed. */
export function printerMessage(job, printerName) {
  const event = { done: 'printerDone', error: 'printerError', cancelled: 'printerCancelled', paused: 'printerPaused' }[job.phase];
  if (!event) return null;
  const file = job.file ? `„${job.file}“` : 'Der Druck';
  const duration = job.startedAt != null ? ` nach ${formatDuration(job.ts - job.startedAt)}` : '';
  const message = {
    done: `${file} ist fertig${duration}.`,
    error: `${file} wurde mit einem Fehler beendet${job.error ? `: ${job.error}` : ''}.`,
    cancelled: `${file} wurde abgebrochen${duration}.`,
    paused: `${file} ist pausiert${job.error ? `: ${job.error}` : ''}${job.completion != null ? ` (${Math.round(job.completion)} %)` : ''}.`,
  }[job.phase];
  return { event, title: printerName || '3D-Drucker', message };
}

/** Remaining time as "noch 1 h 20 min, fertig gegen 15:40 Uhr" (server time; "morgen" for another day). */
function remaining(seconds, now) {
  const end = new Date(now + seconds * 1000);
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(end) - midnight(new Date(now))) / 86400000);
  const day = days === 0 ? '' : days === 1 ? 'morgen ' : `am ${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} `;
  return `noch ${formatDuration(seconds * 1000)}, fertig ${day}gegen ${end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

/** Title and text of a regular status update while printing (from the `data` of the PrinterService). */
export function printerProgressMessage(data, now = Date.now()) {
  const completion = data.progress?.completion;
  const left = data.progress?.printTimeLeft;
  const layer = data.bambu?.layer;
  const details = [
    layer?.total ? `Schicht ${layer.current} von ${layer.total}` : null,
    left > 0 ? remaining(left, now) : null,
  ].filter(Boolean);
  const file = data.job?.file ? `„${data.job.file}“` : 'Der Druck';
  const since = data.progress?.printTime > 0 ? ` seit ${formatDuration(data.progress.printTime * 1000)}` : '';
  return {
    title: `${data.name || '3D-Drucker'}${completion != null ? ` – ${Math.round(completion)} %` : ''}`,
    message: `${file} läuft${since}.${details.length ? `\n${details.join(' · ')}` : ''}`,
  };
}

/**
 * Tells when the next regular status update of a print is due: every `minutes` while the printer is
 * printing (not while paused or disconnected), the first one `minutes` after the start of the print.
 */
export class PrintProgressTimer {
  constructor() {
    this.jobId = null;
    this.last = 0;
  }

  /** @param {object} data `data` of the PrinterService */
  due(data, minutes, now = Date.now()) {
    if (!data.jobId) {
      this.jobId = null;
      return false;
    }
    if (data.jobId !== this.jobId) {
      this.jobId = data.jobId;
      this.last = now;
      return false;
    }
    if (!data.connected || data.state !== 'printing' || now - this.last < minutes * 60000) return false;
    this.last = now;
    return true;
  }
}
