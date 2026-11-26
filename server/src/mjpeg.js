/**
 * Shared MJPEG live streams.
 *
 * A camera (Surveillance Station) or printer webcam (OctoPrint) is opened once, no matter how many
 * browsers watch it. If the camera connection drops, it is reopened while the viewers stay connected
 * (browsers give no signal when an MJPEG <img> stream ends, so they could not reconnect themselves). The upstream multipart stream is split into single frames and every viewer gets
 * them in its own, clean multipart stream:
 *   - viewers that join later start at a frame boundary and see the last frame right away,
 *   - a viewer whose connection is busy skips frames instead of falling behind (no growing delay),
 *   - the boundary follows each frame immediately, so browsers show a frame without waiting for the next one,
 *   - `X-Accel-Buffering: no` keeps reverse proxies (nginx) from buffering the stream.
 */
import { nextDelay } from './util/timers.js';

export const BOUNDARY = 'homeappframe';
/** Upstream data is dropped if no complete frame turns up within this many bytes. */
const MAX_BUFFER = 16 * 1024 * 1024;
/** The upstream is closed this long after the last viewer left (switching cameras reuses it). */
const LINGER_MS = 3000;
/** Without a new frame for this long the upstream counts as stalled and is closed. */
const STALL_MS = 20000;
/** First pause before a lost upstream is opened again; it doubles up to MAX_RETRY_MS. */
const RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;
/** Frames still queued for a viewer before newer frames are skipped. */
const MAX_QUEUED_BYTES = 512 * 1024;

/** Boundary of a multipart content type without quotes and leading dashes, or null. */
export function boundaryOf(contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType || ''));
  const b = m ? (m[1] ?? m[2]).replace(/^-+/, '') : '';
  return b || null;
}

const HEADER_END = Buffer.from('\r\n\r\n');
const HEADER_END_LF = Buffer.from('\n\n');
/** Bytes that may separate a body from the next boundary ("\r\n--"); a JPEG never ends with them. */
const TRAILING = new Set([0x0d, 0x0a, 0x2d]);

/**
 * Splits a multipart (MJPEG) byte stream into frames. Parts with a Content-Length are cut exactly,
 * others end at the next boundary.
 */
export class MjpegParser {
  /** @param {string} boundary @param {(frame: {type: string, body: Buffer}) => void} onFrame */
  constructor(boundary, onFrame) {
    this.marker = Buffer.from(boundary);
    this.onFrame = onFrame;
    this.buf = Buffer.alloc(0);
  }

  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const start = this.buf.indexOf(this.marker);
      if (start < 0) {
        // keep only what could be the beginning of a boundary
        this.buf = this.buf.subarray(Math.max(0, this.buf.length - this.marker.length + 1));
        return;
      }
      if (start > 0) this.buf = this.buf.subarray(start);
      const headStart = this.marker.length;
      const crlf = this.buf.indexOf(HEADER_END, headStart);
      const lf = this.buf.indexOf(HEADER_END_LF, headStart);
      const useLf = lf >= 0 && (crlf < 0 || lf < crlf);
      const headEnd = useLf ? lf : crlf;
      if (headEnd < 0) return this.guard();
      const headers = this.buf.toString('latin1', headStart, headEnd);
      const bodyStart = headEnd + (useLf ? 2 : 4);
      const length = /content-length:\s*(\d+)/i.exec(headers);
      let bodyEnd;
      let next;
      if (length) {
        bodyEnd = bodyStart + Number(length[1]);
        if (bodyEnd > this.buf.length) return this.guard();
        next = bodyEnd;
      } else {
        next = this.buf.indexOf(this.marker, bodyStart);
        if (next < 0) return this.guard();
        bodyEnd = next;
        while (bodyEnd > bodyStart && TRAILING.has(this.buf[bodyEnd - 1])) bodyEnd--;
      }
      const type = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1].trim() || 'image/jpeg';
      if (bodyEnd > bodyStart) this.onFrame({ type, body: Buffer.from(this.buf.subarray(bodyStart, bodyEnd)) });
      this.buf = this.buf.subarray(next);
    }
  }

  /** Drops the buffer if a frame never completes (wrong boundary, broken stream). */
  guard() {
    if (this.buf.length > MAX_BUFFER) this.buf = Buffer.alloc(0);
  }
}

/** One frame as part of the outgoing multipart stream; the next boundary follows right away. */
export function framePart({ type, body }) {
  return Buffer.concat([
    Buffer.from(`Content-Type: ${type}\r\nContent-Length: ${body.length}\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${BOUNDARY}\r\n`),
  ]);
}

/** Shares upstream MJPEG streams between all viewers, see the file comment. */
export class MjpegHub {
  constructor({ lingerMs = LINGER_MS, stallMs = STALL_MS, retryMs = RETRY_MS, maxRetryMs = MAX_RETRY_MS } = {}) {
    this.lingerMs = lingerMs;
    this.stallMs = stallMs;
    this.retryMs = retryMs;
    this.maxRetryMs = maxRetryMs;
    /** key -> { open, ready, upstream, clients, waiting, last, lastAt, linger, retry, delay, watchdog } */
    this.streams = new Map();
  }

  /** Number of shared streams (for tests and diagnostics). */
  get size() {
    return this.streams.size;
  }

  /**
   * Sends the stream `key` to the response `res`. `open` creates the upstream (an http response with a
   * multipart content type) when nobody watches it yet. Rejects if the upstream cannot be opened;
   * nothing has been written to `res` then.
   */
  async attach(key, open, req, res) {
    let entry = this.streams.get(key);
    if (!entry) entry = this.start(key, open);
    clearTimeout(entry.linger);
    entry.linger = null;
    entry.waiting++;
    try {
      await entry.ready;
    } finally {
      entry.waiting--;
    }
    if (this.streams.get(key) !== entry) throw new Error('Stream wurde beendet');
    // the viewer may have left while the upstream was being opened
    if (res.destroyed || res.writableEnded || req.socket?.destroyed) return this.release(key, entry);

    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.socket?.setNoDelay?.(true);
    res.write(`--${BOUNDARY}\r\n`);
    if (entry.last) res.write(framePart(entry.last));
    entry.clients.add(res);
    res.on('close', () => {
      if (entry.clients.delete(res)) this.release(key, entry);
    });
  }

  /** Creates the shared stream `key`; `ready` rejects if the first connection fails. */
  start(key, open) {
    const entry = { open, clients: new Set(), waiting: 0, last: null, lastAt: 0, upstream: null, linger: null, retry: null, delay: 0, watchdog: null };
    this.streams.set(key, entry);
    entry.ready = this.connect(key, entry).catch((err) => {
      this.close(key, entry);
      throw err;
    });
    entry.ready.catch(() => {}); // the waiting callers handle the error
    // a stream without new frames is reopened (the camera may hang without closing the connection)
    entry.watchdog = setInterval(() => {
      if (entry.upstream && Date.now() - entry.lastAt > this.stallMs) entry.upstream.destroy();
    }, Math.min(5000, this.stallMs));
    entry.watchdog.unref?.();
    return entry;
  }

  /** Opens the upstream and feeds its frames to the viewers. */
  async connect(key, entry) {
    const upstream = await entry.open();
    const boundary = boundaryOf(upstream.headers?.['content-type']);
    if (this.streams.get(key) !== entry || !boundary) {
      upstream.destroy();
      if (!boundary) throw new Error('Kein MJPEG-Stream (Boundary fehlt)');
      return;
    }
    entry.upstream = upstream;
    entry.lastAt = Date.now();
    const parser = new MjpegParser(boundary, (frame) => this.broadcast(entry, frame));
    upstream.on('data', (chunk) => parser.push(chunk));
    let gone = false;
    const lost = () => {
      if (gone) return;
      gone = true;
      if (entry.upstream === upstream) entry.upstream = null;
      this.lost(key, entry);
    };
    upstream.on('end', lost);
    upstream.on('close', lost);
    upstream.on('error', lost);
  }

  /**
   * The upstream ended or failed: viewers stay connected (showing the last frame) while it is opened
   * again with a growing delay, so a camera or webcam restart heals without the browsers noticing.
   */
  lost(key, entry) {
    if (this.streams.get(key) !== entry || entry.retry) return;
    if (!entry.clients.size && !entry.waiting) return this.close(key, entry);
    entry.delay = nextDelay(entry.delay, this.retryMs, this.maxRetryMs);
    entry.retry = setTimeout(() => {
      entry.retry = null;
      if (this.streams.get(key) !== entry) return;
      if (!entry.clients.size && !entry.waiting) return this.close(key, entry);
      this.connect(key, entry).catch(() => this.lost(key, entry));
    }, entry.delay);
    entry.retry.unref?.();
  }

  /** Sends a frame to every viewer whose connection keeps up; busy viewers skip it. */
  broadcast(entry, frame) {
    entry.last = frame;
    entry.lastAt = Date.now();
    entry.delay = 0;
    let part = null;
    for (const res of entry.clients) {
      if (res.destroyed || res.writableLength > MAX_QUEUED_BYTES) continue;
      part ??= framePart(frame);
      res.write(part);
    }
  }

  /** Closes the upstream shortly after the last viewer left. */
  release(key, entry) {
    if (entry.clients.size || entry.waiting || this.streams.get(key) !== entry) return;
    clearTimeout(entry.linger);
    entry.linger = setTimeout(() => {
      if (!entry.clients.size && !entry.waiting) this.close(key, entry);
    }, this.lingerMs);
    entry.linger.unref?.();
  }

  /** Ends the upstream and all viewers of `key`. */
  close(key, entry) {
    if (this.streams.get(key) === entry) this.streams.delete(key);
    clearTimeout(entry.linger);
    clearTimeout(entry.retry);
    clearInterval(entry.watchdog);
    entry.upstream?.destroy();
    entry.upstream = null;
    for (const res of entry.clients) res.end();
    entry.clients.clear();
  }

  /** Ends every stream (e.g. on shutdown). */
  closeAll() {
    for (const [key, entry] of [...this.streams]) this.close(key, entry);
  }
}
