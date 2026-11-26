/**
 * 3D printer via OctoPrint.
 *
 * The server polls the OctoPrint REST API, authenticated with an application key (API key) in the
 * `X-Api-Key` header (checked against OctoPrint 1.8):
 *   - GET /api/version, /api/currentuser, /api/settings   version, user of the key, printer name and
 *                                                         webcam settings (on connect, then every 10 min)
 *   - GET /api/job                                        state, file and progress (every poll)
 *   - GET /api/printer                                    state flags and temperatures (every poll;
 *                                                         409 while the printer is not connected)
 *   - GET /api/printer?history=true                       temperature curve of the last ~30 minutes
 * The webcam picture (snapshot and MJPEG stream) is proxied, so neither the key nor the internal
 * webcam address reach the browser. OctoPi reports its snapshot address as `127.0.0.1:8080`, which only
 * works on the Pi itself; the address is therefore derived from the stream URL
 * (`/webcam/?action=stream` -> `/webcam/?action=snapshot`) with fallbacks, or set by hand.
 *
 * {@link PrinterService} runs the polling, emits the printer state (`data`), the connection (`status`)
 * and `popup`: every `popupMinutes` while a print is running and once when it ends. In demo mode
 * without a configured printer a simulated one ({@link DemoPrinterSource}) is shown.
 *
 * Instead of OctoPrint (`type: 'octoprint'`) the printer may be a Bambu Lab printer (`type: 'bambu'`,
 * connection in the `bambu` section, see bambu.js). The `octoprint` section keeps the settings both
 * share (on/off, name, webcam display, overview, pop-ups).
 *
 * Modules (this file only re-exports their public API):
 *   octoprint/config.js   `octoprint` section of the configuration (shared printer settings)
 *   octoprint/status.js   printer state, job, progress and temperatures from OctoPrint's answers
 *   octoprint/webcam.js   webcam settings and snapshot / stream addresses
 *   octoprint/source.js   OctoPrintSource: REST API client
 *   octoprint/demo.js     simulated printer of the demo mode
 *   octoprint/service.js  PrinterService: polling, job tracking, pop-ups, snapshots and streams
 */
export { PRINTER_POPUP_POSITIONS, PRINTER_POPUP_SIZES, PRINTER_TYPES, sanitizeOctoPrint } from './octoprint/config.js';
export { ACTIVE_STATES, finishReason, normalizeStatus, printerState, readTemps, tempHistory } from './octoprint/status.js';
export { originOf, webcamSettings, webcamUrls } from './octoprint/webcam.js';
export { OctoPrintSource, connectionMessage } from './octoprint/source.js';
export { DemoPrinterSource } from './octoprint/demo.js';
export { PrinterService } from './octoprint/service.js';
