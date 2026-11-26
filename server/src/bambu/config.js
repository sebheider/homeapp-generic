/**
 * The `bambu` section of the configuration: connection of a Bambu Lab printer (LAN mode).
 */
import { isObj } from '../util/object.js';
import { trimText } from '../util/text.js';

export const BAMBU_CAMERAS = ['auto', 'jpeg', 'rtsp', 'url', 'off'];

/** Cleans the `bambu` section of the configuration (connection of a Bambu Lab printer). */
export function sanitizeBambu(o = {}) {
  const src = isObj(o) ? o : {};
  // a pasted address ("http://192.168.1.50:8883/") is reduced to the host
  const host = trimText(src.host, 200)
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#\s].*$/, '')
    .replace(/:\d+$/, '');
  return {
    host,
    serial: trimText(src.serial, 40).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    accessCode: trimText(src.accessCode, 40),
    camera: BAMBU_CAMERAS.includes(src.camera) ? src.camera : 'auto',
    streamUrl: trimText(src.streamUrl, 500),
    controls: src.controls !== false,
  };
}
