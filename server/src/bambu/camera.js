/**
 * Camera of a Bambu Lab printer: which kind it is and the producers that deliver its pictures
 * (JPEG pictures over TLS on port 6000, RTSPS converted by ffmpeg, or an own MJPEG / snapshot address).
 * A producer `(onFrame, onEnd) => { close() }` is run by a {@link FrameCamera} (frame-camera.js).
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { spawn as spawnProcess } from 'node:child_process';
import { MjpegParser, boundaryOf } from '../mjpeg.js';
import { RTSP_MODELS } from './models.js';

export const JPEG_PORT = 6000;
export const RTSP_PORT = 322;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Camera kind for the setting and the report: `jpeg`, `rtsp`, `url`, `off` – or `disabled` (X1: LAN live view off). */
export function cameraKind(setting, report, model) {
  if (setting !== 'auto') return setting;
  const rtsp = report?.ipcam?.rtsp_url;
  if (typeof rtsp === 'string' && /^rtsps?:/i.test(rtsp)) return 'rtsp';
  if (rtsp === 'disable') return 'disabled';
  return RTSP_MODELS.has(model) ? 'rtsp' : 'jpeg';
}

/** The 80 byte login of the JPEG camera (port 6000). */
export function jpegAuthPacket(accessCode) {
  const b = Buffer.alloc(80);
  b.writeUInt32LE(0x40, 0);
  b.writeUInt32LE(0x3000, 4);
  b.write('bblp', 16, 32, 'ascii');
  b.write(String(accessCode), 48, 32, 'ascii');
  return b;
}

/** Splits the byte stream of the JPEG camera into pictures (16 byte header with the size, then the JPEG). */
export class JpegFrameParser {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.buf = Buffer.alloc(0);
  }

  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.buf.length >= 16) {
      const size = this.buf.readUInt32LE(0);
      if (size < 4 || size > MAX_IMAGE_BYTES) throw new Error('Unerwartete Daten von der Kamera');
      if (this.buf.length < 16 + size) return;
      const body = Buffer.from(this.buf.subarray(16, 16 + size));
      this.buf = this.buf.subarray(16 + size);
      if (body[0] === 0xff && body[1] === 0xd8) this.onFrame({ type: 'image/jpeg', body });
    }
  }
}

/** Producer for the JPEG camera of the P1 / A1 series (TLS, port 6000). */
export function jpegProducer({ host, accessCode, port = JPEG_PORT, connect = tls.connect }) {
  return (onFrame, onEnd) => {
    let got = false;
    const sock = connect({ host, port, rejectUnauthorized: false });
    const parser = new JpegFrameParser((f) => {
      got = true;
      onFrame(f);
    });
    sock.setTimeout(20000, () => sock.destroy(Object.assign(new Error('Kamera antwortet nicht'), { code: 'ETIMEDOUT' })));
    sock.once('secureConnect', () => sock.write(jpegAuthPacket(accessCode)));
    sock.once('connect', () => {
      if (!sock.encrypted) sock.write(jpegAuthPacket(accessCode)); // plain socket in tests
    });
    sock.on('data', (chunk) => {
      try {
        parser.push(chunk);
      } catch (err) {
        sock.destroy(err);
      }
    });
    let error = null;
    sock.on('error', (err) => (error = err));
    sock.on('close', () => onEnd(error ?? (got ? null : new Error('Kamera hat die Verbindung beendet – Zugangscode prüfen'))));
    return { close: () => sock.destroy() };
  };
}

/** Producer that converts the RTSPS stream (X1 / H2 / P2 series) with ffmpeg to JPEG pictures. */
export function rtspProducer({ url, fps = 5, spawn = spawnProcess }) {
  return (onFrame, onEnd) => {
    const boundary = 'homeappffmpeg';
    let stderr = '';
    let proc;
    try {
      proc = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-rtsp_transport', 'tcp', '-timeout', '10000000',
        '-i', url,
        '-an', '-vf', `fps=${fps},scale='min(1280,iw)':-2`, '-q:v', '6',
        '-f', 'mpjpeg', '-boundary_tag', boundary, 'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      onEnd(err);
      return { close() {} };
    }
    const parser = new MjpegParser(boundary, onFrame);
    proc.stdout.on('data', (c) => parser.push(c));
    proc.stderr.on('data', (c) => (stderr = (stderr + c).slice(-600)));
    let error = null;
    proc.on('error', (err) => {
      error = err.code === 'ENOENT' ? new Error('ffmpeg ist nicht installiert – für die Kamera der X1-/H2-/P2-Serie nötig (im Docker-Image enthalten)') : err;
    });
    proc.on('close', (code) => {
      const msg = stderr.trim().split('\n').pop()?.replace(/rtsps?:\/\/[^@\s]*@/gi, 'rtsps://') || `ffmpeg beendet (${code})`;
      onEnd(error ?? new Error(/401|unauthori/i.test(msg) ? 'Kamera: Zugangscode abgelehnt' : `Kamera: ${msg}`));
    });
    return { close: () => proc.kill('SIGKILL') };
  };
}

/** Producer for an own MJPEG stream (or a snapshot address, which is read again and again). */
export function urlProducer({ url }) {
  return (onFrame, onEnd) => {
    let req;
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      req = lib.get(u, { rejectUnauthorized: false, timeout: 15000 }, (res) => {
        const type = String(res.headers['content-type'] || '');
        if (res.statusCode !== 200) {
          res.destroy();
          return onEnd(new Error(`Kamera-Adresse antwortet mit HTTP ${res.statusCode}`));
        }
        if (type.startsWith('image/')) {
          const chunks = [];
          let size = 0;
          res.on('data', (c) => {
            size += c.length;
            if (size > MAX_IMAGE_BYTES) res.destroy();
            else chunks.push(c);
          });
          res.on('end', () => {
            onFrame({ type: type.split(';')[0], body: Buffer.concat(chunks) });
            onEnd(null);
          });
          res.on('error', onEnd);
          return;
        }
        const boundary = boundaryOf(type);
        if (!boundary) {
          res.destroy();
          return onEnd(new Error('Kamera-Adresse liefert weder MJPEG noch ein Bild'));
        }
        const parser = new MjpegParser(boundary, onFrame);
        res.on('data', (c) => parser.push(c));
        res.on('close', () => onEnd(null));
        res.on('error', onEnd);
      });
      req.on('timeout', () => req.destroy(Object.assign(new Error('Kamera-Adresse antwortet nicht'), { code: 'ETIMEDOUT' })));
      req.on('error', onEnd);
    } catch (err) {
      onEnd(err);
      return { close() {} };
    }
    return { close: () => req.destroy() };
  };
}
