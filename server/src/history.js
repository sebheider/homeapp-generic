/**
 * Time series store.
 *
 * ioBroker only delivers current values, so the server records every numeric
 * state once per minute (48 h, in memory) and persists it every five minutes to
 * `<DATA_DIR>/history.json`. The charts of the app read from here, which works
 * independent of any history adapter in ioBroker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { writeFileAtomic } from './util/fs.js';
import { round } from './util/number.js';

const FILE = path.join(DATA_DIR, 'history.json');
const KEEP_MS = 48 * 3600 * 1000; // retention
const SAMPLE_MS = 60 * 1000; // one sample per state and minute
const FLUSH_MS = 5 * 60 * 1000; // write to disk at most every five minutes

/**
 * Lightweight in-process time series store for numeric states (minute resolution, 48 h).
 * `data` maps a state id to `[timestamp, value][]`, oldest first.
 */
export class History {
  constructor() {
    this.data = {};
    try {
      this.data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
      /* first start */
    }
    this.timer = null;
    this.dirty = false;
  }

  /** @param {() => Iterable<[string, {val: unknown}]>} getStates current states of the active source */
  start(getStates) {
    this.getStates = getStates;
    this.timer = setInterval(() => this.sample(), SAMPLE_MS);
    this.flushTimer = setInterval(() => this.flush(), FLUSH_MS);
  }

  /** Appends the current value of every numeric state and drops samples older than KEEP_MS. */
  sample() {
    const now = Date.now();
    for (const [id, st] of this.getStates()) {
      const v = typeof st.val === 'number' ? st.val : null;
      if (v === null || !Number.isFinite(v)) continue;
      const arr = (this.data[id] ??= []);
      arr.push([now, round(v, 2)]);
      const cut = now - KEEP_MS;
      while (arr.length && arr[0][0] < cut) arr.shift();
    }
    this.dirty = true;
  }

  /** Returns the series of the given ids for the last `hours`, reduced to at most `maxPoints` by averaging buckets. */
  query(ids, hours = 24, maxPoints = 240) {
    const from = Date.now() - hours * 3600 * 1000;
    const out = {};
    for (const id of ids) {
      const pts = (this.data[id] || []).filter((p) => p[0] >= from);
      if (pts.length <= maxPoints) {
        out[id] = pts;
        continue;
      }
      // equal-width time buckets; each bucket is represented by its last timestamp and its mean value
      const bucket = (Date.now() - from) / maxPoints;
      const grouped = new Map();
      for (const [t, v] of pts) {
        const b = Math.floor((t - from) / bucket);
        const g = grouped.get(b) || { t: 0, sum: 0, n: 0 };
        g.t = t;
        g.sum += v;
        g.n++;
        grouped.set(b, g);
      }
      out[id] = [...grouped.values()].map((g) => [g.t, round(g.sum / g.n, 2)]);
    }
    return out;
  }

  /** Persists the series atomically (temp file + rename) if something changed since the last flush. */
  flush() {
    if (!this.dirty) return;
    try {
      writeFileAtomic(FILE, JSON.stringify(this.data));
      this.dirty = false;
    } catch (err) {
      console.error('History konnte nicht gespeichert werden:', err.message);
    }
  }

  /** Stops sampling and writes the pending data (called on shutdown). */
  stop() {
    clearInterval(this.timer);
    clearInterval(this.flushTimer);
    this.flush();
  }
}
