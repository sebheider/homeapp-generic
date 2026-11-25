import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseIcs, dayKey, shortLabel, wasteKind, groupByDay, wasteHints, sanitizeWaste, previewWaste, WasteService } from '../src/waste.js';

const SAMPLE = fs.readFileSync(new URL('./fixtures/waste-sample.ics', import.meta.url), 'utf8');
const cfg = sanitizeWaste({ enabled: true, url: 'https://example.org/ics' });

test('parses a pickup calendar (all-day events, VALARM, VTIMEZONE)', () => {
  const ev = parseIcs(SAMPLE);
  assert.equal(ev.length, 18);
  assert.deepEqual(ev[0], { date: '2026-11-03', summary: 'Biotonne Regelabfuhr' });
  assert.deepEqual(new Set(ev.map((e) => wasteKind(e.summary).key)), new Set(['bio', 'rest', 'paper', 'yellow']));
  // the RRULEs of the time zone definition are not pickups
  assert.ok(ev.every((e) => e.date.startsWith('2026-')));
});

test('short labels and kinds', () => {
  assert.equal(shortLabel('Restmülltonne 2-wö.'), 'Restmülltonne');
  assert.equal(shortLabel('Wertstofftonne oder -sack 4-wö.'), 'Wertstofftonne');
  assert.equal(shortLabel('Biotonne Regelabfuhr'), 'Biotonne');
  assert.equal(wasteKind('Gelber Sack').key, 'yellow');
  assert.equal(wasteKind('Altglas').key, 'glass');
  assert.equal(wasteKind('Sondertermin').key, 'x:sondertermin');
});

test('line folding, escaped text, UTC times, RRULE and EXDATE', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART:20260105T230000Z', // UTC: the day depends on the server time zone (6 January in Germany)
    'SUMMARY:Papier\\, Pappe',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Europe/Berlin:20260101T070000',
    'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4',
    'EXDATE;TZID=Europe/Berlin:20260115T070000',
    'SUMMARY:Rest',
    ' müll',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260110',
    'STATUS:CANCELLED',
    'SUMMARY:Bio',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const ev = parseIcs(ics);
  assert.deepEqual(ev.filter((e) => e.summary === 'Restmüll').map((e) => e.date), ['2026-01-01', '2026-01-29', '2026-02-12']);
  assert.equal(ev.find((e) => e.summary === 'Papier, Pappe').date, dayKey(new Date(Date.UTC(2026, 0, 5, 23))));
  assert.ok(!ev.some((e) => e.summary === 'Bio'));
});

test('hints: the evening before from remindFrom, on the pickup day until remindUntil', () => {
  const days = groupByDay(parseIcs(SAMPLE));
  const at = (d, h, m = 0) => wasteHints(days, cfg, new Date(2026, 10, d, h, m));
  assert.deepEqual(at(2, 16, 59), []);
  const evening = at(2, 17);
  assert.equal(evening.length, 1);
  assert.equal(evening[0].id, 'waste:2026-11-03');
  assert.equal(evening[0].severity, 'warning');
  assert.match(evening[0].message, /^Morgen wird abgeholt: Biotonne und Restmülltonne/);
  const morning = at(3, 9, 59);
  assert.match(morning[0].message, /^Heute wird abgeholt/);
  // same id and start: a hint dismissed in the evening stays dismissed in the morning
  assert.equal(morning[0].since, evening[0].since);
  assert.deepEqual(at(3, 10), []);
  // hidden kinds do not cause hints
  const onlyRest = groupByDay(parseIcs(SAMPLE), ['bio']);
  assert.match(wasteHints(onlyRest, cfg, new Date(2026, 10, 2, 20))[0].message, /: Restmülltonne – /);
  assert.deepEqual(wasteHints(onlyRest, cfg, new Date(2026, 10, 9, 20)), []);
});

test('sanitizeWaste converts webcal and rejects other schemes', () => {
  assert.equal(sanitizeWaste({ url: 'webcal://x.de/a.ics' }).url, 'https://x.de/a.ics');
  assert.equal(sanitizeWaste({ url: 'file:///etc/passwd' }).url, '');
  assert.equal(sanitizeWaste({ remindFrom: '25:00' }).remindFrom, '17:00');
  assert.equal(sanitizeWaste({ severity: 'alarm' }).severity, 'warning');
});

test('service fetches, caches and keeps the cache when the download fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeapp-waste-'));
  let fail = false;
  const fetchImpl = async () => (fail ? { ok: false, status: 503 } : { ok: true, text: async () => SAMPLE });
  const now = () => new Date(2026, 10, 2, 18);
  const svc = new WasteService({ dataDir: dir, fetchImpl, now });
  let changes = 0;
  svc.on('change', () => changes++);
  svc.configure(cfg);
  await svc.refresh();
  assert.equal(svc.data().upcoming[0].date, '2026-11-03');
  assert.equal(svc.data().last, '2026-12-29');
  assert.equal(svc.hints().length, 1);
  assert.ok(changes > 0);
  assert.ok(fs.existsSync(path.join(dir, 'waste.json')));
  svc.stop();

  fail = true;
  const again = new WasteService({ dataDir: dir, fetchImpl, now });
  again.configure(cfg); // cache is fresh: no download
  await again.refresh(); // forced download fails
  assert.match(again.data().error, /HTTP 503/);
  assert.equal(again.data().upcoming.length > 0, true);
  again.stop();

  // another address: the cached dates of the old one are not used
  const other = new WasteService({ dataDir: dir, fetchImpl, now });
  other.refresh = async () => {};
  other.configure({ ...cfg, url: 'https://example.org/other' });
  assert.deepEqual(other.data().upcoming, []);
  other.stop();
});

test('disabled service and demo calendar', () => {
  const svc = new WasteService({ now: () => new Date(2026, 10, 2, 18) });
  svc.configure({ enabled: false });
  assert.deepEqual(svc.hints(), []);
  svc.configure({ enabled: true }, { demo: true });
  assert.equal(svc.data().demo, true);
  assert.equal(svc.hints()[0].id, 'waste:2026-11-03');
  svc.stop();
});

test('previewWaste summarises a calendar', async () => {
  const p = await previewWaste('webcal://example.org/x', { fetchImpl: async () => ({ ok: true, text: async () => SAMPLE }), now: new Date(2026, 10, 20) });
  assert.equal(p.url, 'https://example.org/x');
  assert.equal(p.count, 18);
  assert.equal(p.kinds.length, 4);
  assert.equal(p.next[0].date, '2026-11-24');
  await assert.rejects(previewWaste('ftp://x'), /http/);
  await assert.rejects(previewWaste('https://x', { fetchImpl: async () => ({ ok: true, text: async () => '<html>' }) }), /kein iCalendar/);
});
