/**
 * Helpers for the waste collection calendar (data from the server, see server waste.js).
 */
import type { WasteDay } from './types';

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** 'YYYY-MM-DD' -> local midnight. */
const parseDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Whole days from today (0 = today, 1 = tomorrow). */
export function daysUntil(date: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDay(date).getTime() - today.getTime()) / 86_400_000);
}

/** "Heute", "Morgen", "Übermorgen", "Do" (within a week) or "Do, 12.11.". */
export function pickupDay(date: string, now = new Date()): string {
  const n = daysUntil(date, now);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Morgen';
  if (n === 2) return 'Übermorgen';
  const d = parseDay(date);
  const wd = WEEKDAYS[d.getDay()];
  return n > 0 && n < 7 ? wd : `${wd}, ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/** Next pickup that is not over yet (today counts until `untilHour`), or null. */
export function nextPickup(days: WasteDay[], now = new Date(), untilHour = 12): WasteDay | null {
  return days.find((d) => {
    const n = daysUntil(d.date, now);
    return n > 0 || (n === 0 && now.getHours() < untilHour);
  }) ?? null;
}

/** Text of a chip: "Morgen: Biotonne, Restmülltonne". */
export function pickupText(day: WasteDay, now = new Date()): string {
  return `${pickupDay(day.date, now)}: ${day.items.map((i) => i.label).join(', ')}`;
}
