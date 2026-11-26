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
 *
 * Modules (this file only re-exports their public API):
 *   waste/dates.js    calendar days 'YYYY-MM-DD'
 *   waste/kinds.js    kinds of waste (label, key, colour)
 *   waste/ics.js      download and parse the iCalendar
 *   waste/config.js   `waste` section of the configuration
 *   waste/hints.js    pickups per day, hints, demo calendar
 *   waste/service.js  WasteService: fetch, cache, hints; address check
 */
export { dayKey } from './waste/dates.js';
export { shortLabel, wasteKind } from './waste/kinds.js';
export { fetchIcs, parseIcs } from './waste/ics.js';
export { WASTE_SEVERITIES, sanitizeWaste } from './waste/config.js';
export { demoWasteEvents, groupByDay, wasteHints } from './waste/hints.js';
export { WasteService, previewWaste } from './waste/service.js';
