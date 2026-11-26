/**
 * The waste service: fetches and caches the calendar, evaluates the hints and checks new addresses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { writeFileAtomic } from '../util/fs.js';
import { sanitizeWaste } from './config.js';
import { dayKey } from './dates.js';
import { demoWasteEvents, groupByDay, wasteHints } from './hints.js';
import { fetchIcs, parseIcs } from './ics.js';
import { wasteKind } from './kinds.js';

const REFRESH_MS = 6 * 3600 * 1000;
const RETRY_MS = 15 * 60 * 1000;
const TICK_MS = 30 * 1000;

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
      writeFileAtomic(this.file, JSON.stringify({ url: this.url, fetchedAt: this.fetchedAt, events: this.events }));
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
