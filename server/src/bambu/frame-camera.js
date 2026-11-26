/**
 * On-demand picture source of the printer camera: snapshots and a shared MJPEG stream from a producer
 * (see camera.js) that only runs while somebody wants pictures.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { nextDelay } from '../util/timers.js';

/** Longest pause between two attempts to get pictures. */
const MAX_RETRY_MS = 30000;

const FRAME_BOUNDARY = 'bambuframe';

/**
 * Picture source that runs only while somebody wants pictures: it is started by a snapshot request or
 * a stream viewer, keeps the newest frame, reconnects with a growing pause and stops `idleMs` after
 * the last request when nobody watches the stream any more.
 * `open(onFrame, onEnd)` starts a producer and returns `{ close() }`.
 */
export class FrameCamera {
  constructor(open, { idleMs = 30000, freshMs = 4000, waitMs = 15000 } = {}) {
    this.open = open;
    this.idleMs = idleMs;
    this.freshMs = freshMs;
    this.waitMs = waitMs;
    this.events = new EventEmitter();
    this.events.setMaxListeners(50);
    this.last = null;
    this.producer = null;
    this.retry = null;
    this.delay = 0;
    this.viewers = 0;
    this.touched = 0;
    this.error = null;
    this.closed = false;
    this.idle = setInterval(() => this.checkIdle(), Math.min(5000, idleMs));
    this.idle.unref?.();
  }

  checkIdle() {
    if (this.viewers || Date.now() - this.touched < this.idleMs) return;
    this.stop();
  }

  start() {
    if (this.closed || this.producer || this.retry) return;
    let got = false;
    let ended = false;
    const onFrame = (frame) => {
      if (ended) return;
      got = true;
      this.delay = 0;
      this.error = null;
      this.last = { ...frame, ts: Date.now() };
      this.events.emit('frame', this.last);
    };
    const onEnd = (err) => {
      if (ended) return;
      ended = true;
      if (this.producer === handle) this.producer = null;
      if (err) {
        this.error = err;
        this.events.emit('fail', err);
      }
      if (this.closed || (!this.viewers && Date.now() - this.touched >= this.idleMs)) return;
      // a source that delivered pictures (e.g. a snapshot address) is asked again soon
      this.delay = got ? 1000 : nextDelay(this.delay, 2000, MAX_RETRY_MS);
      this.retry = setTimeout(() => {
        this.retry = null;
        this.start();
      }, this.delay);
      this.retry.unref?.();
    };
    const handle = { close() {} };
    this.producer = handle;
    try {
      Object.assign(handle, this.open(onFrame, onEnd));
    } catch (err) {
      onEnd(err);
    }
  }

  stop() {
    clearTimeout(this.retry);
    this.retry = null;
    const p = this.producer;
    this.producer = null;
    p?.close();
  }

  /** The newest picture (waits for the next one if the last is older than `freshMs`). */
  frame() {
    this.touched = Date.now();
    if (this.last && Date.now() - this.last.ts < this.freshMs) return Promise.resolve(this.last);
    this.start();
    return new Promise((resolve, reject) => {
      const done = (fn, v) => {
        clearTimeout(timer);
        this.events.off('frame', onFrame);
        this.events.off('fail', onFail);
        fn(v);
      };
      const onFrame = (f) => done(resolve, f);
      const onFail = (err) => done(reject, err);
      const timer = setTimeout(() => done(reject, this.error ?? new Error('Kein Bild von der Kamera (Zeitüberschreitung)')), this.waitMs);
      timer.unref?.();
      this.events.on('frame', onFrame);
      this.events.on('fail', onFail);
    });
  }

  /** MJPEG stream (a readable with multipart headers, like an http response) for the MjpegHub. */
  async openStream() {
    await this.frame();
    const out = new PassThrough();
    out.headers = { 'content-type': `multipart/x-mixed-replace; boundary=${FRAME_BOUNDARY}` };
    const write = (f) => {
      out.write(Buffer.concat([Buffer.from(`--${FRAME_BOUNDARY}\r\nContent-Type: ${f.type}\r\nContent-Length: ${f.body.length}\r\n\r\n`), f.body, Buffer.from('\r\n')]));
    };
    this.viewers++;
    if (this.last) write(this.last);
    this.events.on('frame', write);
    out.on('close', () => {
      this.viewers--;
      this.touched = Date.now();
      this.events.off('frame', write);
    });
    return out;
  }

  close() {
    this.closed = true;
    clearInterval(this.idle);
    this.stop();
    this.events.removeAllListeners();
  }
}
