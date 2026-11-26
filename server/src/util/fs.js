/**
 * File helpers.
 */
import fs from 'node:fs';

/** Error codes of a rename while another process (virus scanner, indexer) briefly holds the file on Windows. */
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** First pause before a busy rename is tried again; it grows with every attempt. */
const RETRY_DELAY_MS = 25;

/** Blocks the thread for `ms` milliseconds – only for very short waits. */
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Writes a file atomically: the data goes to `<file>.tmp` first, which then replaces the file, so a crash
 * never leaves a half-written file behind. With `retries` a rename that fails because the target is busy
 * (EPERM / EBUSY / EACCES) is repeated after a short, growing pause; other errors are thrown right away.
 * @param {string} file
 * @param {string|Buffer} data
 * @param {{retries?: number}} [opts]
 */
export function writeFileAtomic(file, data, { retries = 0 } = {}) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      if (attempt >= retries || !BUSY.has(err.code)) throw err;
      sleepSync(RETRY_DELAY_MS * (attempt + 1));
    }
  }
}
