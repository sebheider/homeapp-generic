/**
 * Kiosk sensors: values reported by the HomeApp agent on the Raspberry Pi of a wall display
 * (presence radar LD2410, light sensor BH1750, CO₂ sensor SCD41 – see kiosk-agent/).
 *
 * The agent POSTs its readings every few seconds to `/api/kiosk/report?token=<kioskToken>`. Every
 * reading becomes a local, read-only datapoint `homeapp.kiosk.<agent>.<key>` that behaves like an
 * ioBroker state inside the app: it is pushed to the browsers, can be used by devices (sensor tiles),
 * notifications, the ventilation advice and the charts, and it shows up in the datapoint search.
 * The answer to a report contains the agent settings of the `kiosk` config section (screen off
 * without presence, always-on times, waking on notifications, quiet hours, automatic brightness, fixed
 * off and dim times for displays without presence radar / light sensor),
 * so the Pi is configured from the settings page.
 *
 * Camera pop-ups and new notifications "wake" the screens: the server pushes them to the agents over
 * `GET /api/kiosk/events?token=…` (server-sent events) and repeats the latest one in every report
 * answer. The agent decides with its settings and its local time (quiet hours) whether to switch on.
 *
 * Live radar: while a browser shows the radar page, the same event stream asks the agents for live frames
 * of their presence radar (`{type: 'radar'}`, repeated as `radar: true` in report answers). They POST about
 * four per second to `/api/kiosk/radar?token=…`; the answer says whether anyone still watches.
 *
 * Modules (this file only re-exports their public API):
 *   kiosk/readings.js  kiosk datapoints, reading types and ranges, radar frames
 *   kiosk/settings.js  `kiosk` section of the configuration (agent settings)
 *   kiosk/hub.js       KioskHub: agents, datapoints, wake-ups, live radar
 *   kiosk/routes.js    agent endpoints (report, events, radar)
 *   kiosk/demo.js      simulated wall display of the demo mode
 */
export { KIOSK_PREFIX, KIOSK_VALUES, agentId, cleanRadar, isKioskId } from './kiosk/readings.js';
export { WAKE_SEVERITIES, sanitizeKiosk, sanitizeWindows } from './kiosk/settings.js';
export { KioskHub, freshAlerts } from './kiosk/hub.js';
export { registerKioskReport } from './kiosk/routes.js';
export { demoKioskReport, demoRadarFrame } from './kiosk/demo.js';
