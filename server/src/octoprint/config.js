/**
 * The `octoprint` section of the configuration: kind of printer connection, OctoPrint address and key,
 * and the settings every printer shares (name, webcam display, overview, pop-ups).
 */
import { clampNumber } from '../util/number.js';
import { trimText } from '../util/text.js';

/** Where the webcam pop-up appears and how large it is (same choices as the camera pop-up). */
export const PRINTER_POPUP_POSITIONS = ['center', 'corner'];
export const PRINTER_POPUP_SIZES = ['medium', 'large', 'full'];
/** Kinds of printer connection. */
export const PRINTER_TYPES = ['octoprint', 'bambu'];

/**
 * Cleans the `octoprint` section of the configuration. A pasted address ("http://octopi.local:5000/")
 * is split into host, port and HTTPS.
 */
export function sanitizeOctoPrint(o = {}) {
  const src = o && typeof o === 'object' ? o : {};
  let host = trimText(src.host, 200);
  let secure = Boolean(src.https);
  let port = clampNumber(src.port, 1, 65535, secure ? 443 : 80);
  const url = /^(https?):\/\/([^/:?#\s]+)(?::(\d+))?/i.exec(host);
  const hostPort = /^([^/:?#\s]+):(\d+)$/.exec(host);
  if (url) {
    secure = url[1].toLowerCase() === 'https';
    host = url[2];
    port = url[3] ? clampNumber(url[3], 1, 65535, port) : secure ? 443 : 80;
  } else if (hostPort) {
    host = hostPort[1];
    port = clampNumber(hostPort[2], 1, 65535, port);
  } else {
    host = host.replace(/[/?#\s].*$/, '');
  }
  return {
    enabled: Boolean(src.enabled),
    type: PRINTER_TYPES.includes(src.type) ? src.type : 'octoprint',
    name: trimText(src.name, 80),
    host,
    port: Math.round(port),
    https: secure,
    verifySsl: Boolean(src.verifySsl),
    apiKey: trimText(src.apiKey, 200),
    pollSeconds: clampNumber(src.pollSeconds, 2, 60, 5),
    snapshotUrl: trimText(src.snapshotUrl, 500),
    streamUrl: trimText(src.streamUrl, 500),
    webcamRefreshSeconds: clampNumber(src.webcamRefreshSeconds, 0.5, 300, 2),
    webcamLive: src.webcamLive !== false,
    dashboard: src.dashboard !== false,
    popup: src.popup !== false,
    popupMinutes: clampNumber(src.popupMinutes, 1, 240, 15),
    popupSeconds: clampNumber(src.popupSeconds, 3, 600, 20),
    popupOnFinish: src.popupOnFinish !== false,
    popupPosition: PRINTER_POPUP_POSITIONS.includes(src.popupPosition) ? src.popupPosition : 'corner',
    popupSize: PRINTER_POPUP_SIZES.includes(src.popupSize) ? src.popupSize : 'medium',
  };
}
