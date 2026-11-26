/**
 * Pickups grouped by day and the hints in the shape of the user-defined alerts.
 */
import { toMinutes } from './config.js';
import { addDays, dayKey, dayStart } from './dates.js';
import { wasteKind } from './kinds.js';

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
