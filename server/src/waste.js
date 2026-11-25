/**
 * Waste collection calendar ("Müllabfuhr").
 *
 * Reads the pickup dates from an iCalendar (ICS) address, e.g. the "subscribe to calendar" export
 * of the local waste disposal company. Every event is one pickup;
 * its SUMMARY is the kind of waste ("Restmülltonne 2-wö.", "Biotonne Regelabfuhr", …).
 *
 * The calendar is fetched every six hours and cached in `<DATA_DIR>/waste.json`, so hints keep
 * working while the internet is down. From the configured time on the evening before a pickup
 * ("Morgen: Biotonne, Restmülltonne rausstellen") until the configured time of the pickup day
 * ("Heute: …") the service publishes a hint in the same shape as the user-defined alerts.
 *
 * Config section `waste`:
 *   { enabled, url, remindFrom: 'HH:MM' (day before), remindUntil: 'HH:MM' (pickup day),
 *     severity: 'warning'|'info', hidden: [kind keys that never cause a hint] }
 * Times are server local time (TZ of the container).
 */
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const REFRESH_MS = 6 * 3600 * 1000;
const RETRY_MS = 15 * 60 * 1000;
const TICK_MS = 30 * 1000;
const MAX_EVENTS = 2000;
export const WASTE_SEVERITIES = ['warning', 'info'];

/** Kinds of waste recognised by keyword (first match wins), with a colour for the bin symbol. */
const KINDS = [
  { key: 'rest', re: /rest|hausm(ü|ue)ll|schwarz|grau/i, color: '#6b7280' },
  { key: 'bio', re: /bio|kompost|gr(ü|ue)nschnitt|garten|braun/i, color: '#92400e' },
  { key: 'paper', re: /papier|pappe|karton|ppk|blau/i, color: '#2563eb' },
  { key: 'yellow', re: /gelb|wertstoff|verpackung|leichtverp|lvp/i, color: '#eab308' },
  { key: 'glass', re: /glas/i, color: '#16a34a' },
  { key: 'bulky', re: /sperr|elektro/i, color: '#ea580c' },
  { key: 'hazard', re: /schadstoff|sonderm(ü|ue)ll|problem/i, color: '#dc2626' },
  { key: 'tree', re: /weihnachts|tannen|baum/i, color: '#15803d' },
];
const OTHER_COLOR = '#64748b';

/** "Restmülltonne 2-wö." -> "Restmülltonne"; "Wertstofftonne oder -sack 4-wö." -> "Wertstofftonne". */
export function shortLabel(summary) {
  const s = String(summary || '')
    .replace(/\s*\(?\d+\s*-?\s*w(ö|oe)(ch)?\.?(entlich)?\)?/gi, '')
    .replace(/\s+regelabfuhr/gi, '')
    .replace(/\s+oder\s+-?\s*sack/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || String(summary || '').trim() || 'Abholung';
}

/** Kind key and colour of a pickup; `key` is stable for the "hidden" setting (unknown kinds use their label). */
export function wasteKind(summary) {
  const label = shortLabel(summary);
  const k = KINDS.find((x) => x.re.test(label));
  return { key: k ? k.key : `x:${label.toLowerCase().slice(0, 40)}`, label, color: k ? k.color : OTHER_COLOR };
}

const pad = (n) => String(n).padStart(2, '0');
/** Local calendar day of a Date as 'YYYY-MM-DD'. */
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD' -> local midnight. */
const dayStart = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (key, n) => {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

/** Unescapes an iCalendar TEXT value. */
const unescapeText = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/**
 * Calendar day of a DTSTART / EXDATE value. Dates (VALUE=DATE) and local / TZID times are taken as
 * written; UTC times ("…Z") are converted to the server's local day.
 */
function parseDay(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(String(value).trim());
  if (!m) return null;
  if (m[7]) return dayKey(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))));
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Expands a simple RRULE (DAILY / WEEKLY / MONTHLY by date, INTERVAL, COUNT, UNTIL) into days. */
function expandRule(start, rule, until) {
  const p = Object.fromEntries(rule.split(';').map((kv) => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
  const step = Math.max(1, Number(p.INTERVAL) || 1);
  const count = Number(p.COUNT) || Infinity;
  const end = p.UNTIL ? parseDay(p.UNTIL) : null;
  const unit = { DAILY: 1, WEEKLY: 7 }[p.FREQ];
  if (!unit && p.FREQ !== 'MONTHLY') return [start];
  const out = [];
  for (let i = 0; out.length < count && out.length < 500; i++) {
    let day;
    if (unit) day = addDays(start, i * step * unit);
    else {
      const d = dayStart(start);
      d.setMonth(d.getMonth() + i * step);
      day = dayKey(d);
    }
    if ((end && day > end) || day > until) break;
    out.push(day);
  }
  return out;
}

/**
 * Parses an iCalendar text into pickups `{date: 'YYYY-MM-DD', summary}`, sorted by date.
 * Handles line folding, VALUE=DATE and date-time starts, simple RRULEs and EXDATEs; nested
 * components (VALARM, VTIMEZONE) are ignored.
 * @param {string} text
 * @param {{until?: string}} [opts] last day to expand repeating events to (default: two years ahead)
 */
export function parseIcs(text, { until = addDays(dayKey(new Date()), 730) } = {}) {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '') // unfold continuation lines
    .split('\n');
  const out = [];
  const seen = new Set();
  let ev = null;
  let depth = 0; // nesting below VEVENT (VALARM)
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = head.split(';')[0].toUpperCase();
    if (name === 'BEGIN') {
      if (value.trim().toUpperCase() === 'VEVENT') ev = { exdates: new Set() };
      else if (ev) depth++;
      continue;
    }
    if (name === 'END') {
      if (ev && depth) depth--;
      else if (ev && value.trim().toUpperCase() === 'VEVENT') {
        if (ev.start && ev.summary && ev.status !== 'CANCELLED') {
          const days = ev.rrule ? expandRule(ev.start, ev.rrule, until) : [ev.start];
          for (const date of days) {
            const key = `${date}|${ev.summary}`;
            if (ev.exdates.has(date) || seen.has(key)) continue;
            seen.add(key);
            out.push({ date, summary: ev.summary });
          }
        }
        ev = null;
      }
      continue;
    }
    if (!ev || depth) continue;
    if (name === 'DTSTART') ev.start = parseDay(value);
    else if (name === 'SUMMARY') ev.summary = unescapeText(value).trim().slice(0, 120);
    else if (name === 'RRULE') ev.rrule = value.trim();
    else if (name === 'STATUS') ev.status = value.trim().toUpperCase();
    else if (name === 'EXDATE') for (const v of value.split(',')) ev.exdates.add(parseDay(v));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.summary.localeCompare(b.summary)).slice(0, MAX_EVENTS);
}

/** "HH:MM" -> minutes since midnight, or null. */
const toMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? ''));
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
};

/** Cleans the `waste` config section. */
export function sanitizeWaste(w = {}) {
  const v = w && typeof w === 'object' ? w : {};
  let url = String(v.url ?? '').trim().slice(0, 1000);
  if (/^webcals?:\/\//i.test(url)) url = url.replace(/^webcals?:/i, 'https:');
  return {
    enabled: v.enabled === true,
    url: /^https?:\/\//i.test(url) ? url : '',
    remindFrom: toMinutes(v.remindFrom) === null ? '17:00' : String(v.remindFrom),
    remindUntil: toMinutes(v.remindUntil) === null ? '10:00' : String(v.remindUntil),
    severity: WASTE_SEVERITIES.includes(v.severity) ? v.severity : 'warning',
    hidden: (Array.isArray(v.hidden) ? v.hidden : []).map((k) => String(k).slice(0, 44)).slice(0, 30),
  };
}

/** Groups pickups by day: `[{date, items: [{summary, key, label, color}]}]`. */
export function groupByDay(events, hidden = []) {
  const days = new Map();
  for (const e of events) {
    const kind = wasteKind(e.summary);
    if (hidden.includes(kind.key)) continue;
    const list = days.get(e.date) ?? [];
    if (!list.some((i) => i.key === kind.key)) list.push({ summary: e.summary, ...kind });
    days.set(e.date, list);
  }
  return [...days].map(([date, items]) => ({ date, items }));
}

/**
 * Hints for `now`: the evening before a pickup from `remindFrom`, on the pickup day until `remindUntil`.
 * `since` is the start of the window, so a dismissed hint stays dismissed until the next pickup.
 */
export function wasteHints(days, cfg, now = new Date()) {
  const today = dayKey(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(cfg.remindFrom) ?? 17 * 60;
  const until = toMinutes(cfg.remindUntil) ?? 10 * 60;
  const out = [];
  const add = (day, when, since) => {
    const labels = day.items.map((i) => i.label);
    const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} und ${labels.at(-1)}` : labels[0];
    out.push({
      id: `waste:${day.date}`,
      name: 'Müllabfuhr',
      severity: cfg.severity,
      message: when === 'tomorrow' ? `Morgen wird abgeholt: ${list} – bitte rausstellen` : `Heute wird abgeholt: ${list}`,
      value: null,
      since,
      view: null,
      room: null,
      requireAck: false,
      acked: false,
      ackedAt: null,
      cleared: false,
      clearedAt: null,
      source: 'waste',
      waste: { date: day.date, when, items: day.items },
    });
  };
  const tomorrow = days.find((d) => d.date === addDays(today, 1));
  if (tomorrow && minutes >= from) add(tomorrow, 'tomorrow', dayStart(today).getTime() + from * 60000);
  const todays = days.find((d) => d.date === today);
  if (todays && minutes < until) add(todays, 'today', dayStart(addDays(today, -1)).getTime() + from * 60000);
  return out;
}

/** Sample calendar for the demo mode, relative to today. */
export function demoWasteEvents(now = new Date()) {
  const today = dayKey(now);
  const out = [];
  for (let i = 0; i < 70; i++) {
    const date = addDays(today, i);
    if (i % 7 === 1) out.push({ date, summary: 'Biotonne Regelabfuhr' });
    if (i % 14 === 1) out.push({ date, summary: 'Restmülltonne 2-wö.' });
    if (i % 28 === 9) out.push({ date, summary: 'Papiertonne 4-wö.' });
    if (i % 28 === 16) out.push({ date, summary: 'Wertstofftonne oder -sack 4-wö.' });
  }
  return out;
}

/** Downloads an ICS address and returns its text (throws with a readable message). */
export async function fetchIcs(url, fetchImpl = (...a) => fetch(...a)) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { Accept: 'text/calendar, */*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Antwort ist kein iCalendar (ICS)');
  return text;
}

/** Checks an address for the settings page: number of dates, kinds of waste and the next pickups. */
export async function previewWaste(url, { fetchImpl, now = new Date() } = {}) {
  const clean = sanitizeWaste({ url }).url;
  if (!clean) throw new Error('Bitte eine http(s)- oder webcal-Adresse angeben');
  let events;
  try {
    events = parseIcs(await fetchIcs(clean, fetchImpl));
  } catch (err) {
    throw new Error(`Abfuhrkalender nicht abrufbar: ${err.message}`);
  }
  const today = dayKey(now);
  const future = events.filter((e) => e.date >= today);
  const kinds = [...new Map(events.map((e) => wasteKind(e.summary)).map((k) => [k.key, k])).values()];
  return { url: clean, count: events.length, upcoming: future.length, last: events.at(-1)?.date ?? null, kinds, next: groupByDay(future).slice(0, 5) };
}

/** Fetches, caches and evaluates the waste calendar; emits `change` when the hints or the dates change. */
export class WasteService extends EventEmitter {
  /**
   * @param {{dataDir?: string|null, fetchImpl?: typeof fetch, now?: () => Date}} [opts]
   */
  constructor({ dataDir = null, fetchImpl = (...a) => fetch(...a), now = () => new Date() } = {}) {
    super();
    this.file = dataDir ? path.join(dataDir, 'waste.json') : null;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cfg = sanitizeWaste();
    this.demo = false;
    this.events = [];
    this.url = '';
    this.fetchedAt = null;
    this.error = null;
    this.timer = null;
    this.tick = null;
    this.sig = '';
    try {
      const c = this.file ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : null;
      if (c && Array.isArray(c.events)) Object.assign(this, { events: c.events, url: c.url || '', fetchedAt: c.fetchedAt || null });
    } catch {
      /* no cache yet */
    }
  }

  /** Applies the configuration; fetches the calendar if the address changed or the cache is old. */
  configure(cfg, { demo = false } = {}) {
    this.cfg = sanitizeWaste(cfg);
    this.demo = demo;
    clearTimeout(this.timer);
    clearInterval(this.tick);
    this.timer = null;
    this.tick = null;
    this.error = null;
    if (this.active) {
      this.tick = setInterval(() => this.update(), TICK_MS);
      this.tick.unref?.();
      if (!this.useDemo) {
        const fresh = this.url === this.cfg.url && this.fetchedAt && Date.now() - this.fetchedAt < REFRESH_MS;
        if (fresh) this.schedule(REFRESH_MS - (Date.now() - this.fetchedAt));
        else this.refresh();
      }
    }
    this.update(true);
  }

  /** True while hints are produced (enabled with an address, or the demo calendar). */
  get active() {
    return this.cfg.enabled && Boolean(this.cfg.url || this.demo);
  }

  /** The demo mode shows a sample calendar as long as no own address is set. */
  get useDemo() {
    return this.demo && !this.cfg.url;
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), Math.max(1000, ms));
    this.timer.unref?.();
  }

  /** Downloads and parses the calendar now. */
  async refresh() {
    const url = this.cfg.url;
    if (!url) return;
    try {
      const text = await fetchIcs(url, this.fetchImpl);
      if (url !== this.cfg.url) return; // configuration changed meanwhile
      this.events = parseIcs(text);
      this.url = url;
      this.fetchedAt = Date.now();
      this.error = null;
      this.save();
      this.schedule(REFRESH_MS);
    } catch (err) {
      if (url !== this.cfg.url) return;
      this.error = `Abfuhrkalender nicht abrufbar: ${err.message}`;
      console.warn(`[Müllabfuhr] ${this.error}`);
      this.schedule(RETRY_MS);
    }
    this.update(true);
  }

  save() {
    if (!this.file) return;
    try {
      fs.writeFileSync(this.file + '.tmp', JSON.stringify({ url: this.url, fetchedAt: this.fetchedAt, events: this.events }));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch (err) {
      console.warn(`[Müllabfuhr] Cache nicht gespeichert: ${err.message}`);
    }
  }

  /** Pickups of the active calendar (only those of the configured address). */
  currentEvents() {
    if (!this.active) return [];
    if (this.useDemo) return demoWasteEvents(this.now());
    return this.url === this.cfg.url ? this.events : [];
  }

  /** Upcoming pickup days (today included), at most `limit`. */
  upcoming(limit = 12) {
    const today = dayKey(this.now());
    return groupByDay(this.currentEvents().filter((e) => e.date >= today), this.cfg.hidden).slice(0, limit);
  }

  /** Every kind of waste in the calendar (for the "hidden" setting), with its count of future dates. */
  kinds() {
    const today = dayKey(this.now());
    const m = new Map();
    for (const e of this.currentEvents()) {
      const k = wasteKind(e.summary);
      const entry = m.get(k.key) ?? { ...k, summary: e.summary, upcoming: 0 };
      if (e.date >= today) entry.upcoming++;
      m.set(k.key, entry);
    }
    return [...m.values()];
  }

  /** Active hints (alert shape). */
  hints() {
    if (!this.active) return [];
    return wasteHints(this.upcoming(3), this.cfg, this.now());
  }

  /** Data for the browser (widget, chip, settings). */
  data() {
    return {
      enabled: this.active,
      demo: this.useDemo,
      error: this.error,
      fetchedAt: this.useDemo ? Date.now() : this.fetchedAt,
      last: this.currentEvents().at(-1)?.date ?? null, // the calendar ends here (yearly calendars must be renewed)
      upcoming: this.upcoming(),
    };
  }

  /** Re-evaluates the hints; emits `change` if hints or dates differ from the last call. */
  update(force = false) {
    const sig = JSON.stringify([this.hints().map((h) => `${h.id}:${h.since}`), this.upcoming().map((d) => d.date + d.items.map((i) => i.key)), this.error, this.active]);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.emit('change');
  }

  stop() {
    clearTimeout(this.timer);
    clearInterval(this.tick);
  }
}
