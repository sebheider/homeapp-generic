/**
 * Webcam of an OctoPrint printer: its settings and the addresses to try for snapshots and the MJPEG stream.
 */

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '[::1]']);

/**
 * Webcam settings from `/api/settings`. OctoPrint up to 1.8 keeps them in `webcam`, from 1.9 in the
 * plugin `classicwebcam`; both are read. Null if the settings could not be read.
 */
export function webcamSettings(settings) {
  if (!settings || typeof settings !== 'object') return null;
  const w = settings.webcam && typeof settings.webcam === 'object' ? settings.webcam : {};
  const c = settings.plugins?.classicwebcam && typeof settings.plugins.classicwebcam === 'object' ? settings.plugins.classicwebcam : {};
  const pick = (...v) => v.find((x) => x !== undefined && x !== null && x !== '');
  return {
    enabled: w.webcamEnabled !== false,
    streamUrl: String(pick(c.stream, w.streamUrl) ?? ''),
    snapshotUrl: String(pick(c.snapshot, w.snapshotUrl) ?? ''),
    flipH: Boolean(pick(c.flipH, w.flipH)),
    flipV: Boolean(pick(c.flipV, w.flipV)),
    rotate90: Boolean(pick(c.rotate90, w.rotate90)),
    ratio: String(pick(c.streamRatio, w.streamRatio) ?? '') === '4:3' ? '4:3' : '16:9',
  };
}

/** Base address of OctoPrint, e.g. `http://192.168.1.20` (default ports are left out). */
export const originOf = (cfg) => `${cfg.https ? 'https' : 'http'}://${cfg.host}${cfg.port === (cfg.https ? 443 : 80) ? '' : `:${cfg.port}`}`;

/**
 * Addresses to try for the webcam picture (`snapshot`) or the MJPEG stream (`stream`), best first.
 * A hand-made address wins; relative addresses are resolved against OctoPrint, loopback addresses
 * (OctoPi: `http://127.0.0.1:8080/?action=snapshot`) point to the OctoPrint host instead.
 */
export function webcamUrls(cfg, webcam, kind) {
  const origin = originOf(cfg);
  const out = [];
  const add = (u) => {
    if (!u) return;
    try {
      const url = new URL(u, `${origin}/`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (LOOPBACK.has(url.hostname)) url.hostname = cfg.host;
      if (!out.includes(url.href)) out.push(url.href);
    } catch {
      /* not a URL */
    }
  };
  const own = kind === 'snapshot' ? cfg.snapshotUrl : cfg.streamUrl;
  if (own) {
    add(own);
    return out;
  }
  const stream = webcam?.streamUrl || '';
  if (kind === 'snapshot') {
    if (/action=stream/.test(stream)) add(stream.replace('action=stream', 'action=snapshot'));
    add(webcam?.snapshotUrl);
    add('/webcam/?action=snapshot');
  } else {
    add(stream);
    add('/webcam/?action=stream');
  }
  return out;
}
