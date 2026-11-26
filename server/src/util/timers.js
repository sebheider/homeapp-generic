/**
 * Timer helpers: one-shot timers that are cancelled together, and the pauses of an exponential back-off.
 */

/**
 * Runs `fn` once after `ms` and keeps the timer in `timers` until then, so {@link clearTimeouts} can
 * cancel everything that is still pending (e.g. when a source stops).
 * @param {Set<ReturnType<typeof setTimeout>>} timers
 */
export function addTimeout(timers, fn, ms) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

/** Cancels every pending timer of `timers` (see {@link addTimeout}). */
export function clearTimeouts(timers) {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

/** Next pause of an exponential back-off: `initial` first, then doubled up to `max`. */
export const nextDelay = (previous, initial, max) => Math.min(max, previous ? previous * 2 : initial);
