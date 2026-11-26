/**
 * Reading the waste collection calendar: download and parse an iCalendar (ICS) into pickups.
 */
import { addDays, dayKey, dayStart } from './dates.js';

const MAX_EVENTS = 2000;

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

/** Downloads an ICS address and returns its text (throws with a readable message). */
export async function fetchIcs(url, fetchImpl = (...a) => fetch(...a)) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { Accept: 'text/calendar, */*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Antwort ist kein iCalendar (ICS)');
  return text;
}
