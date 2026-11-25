/**
 * Frame rate measurement for the kiosk (`?fps=1` shows an overlay, see components/FpsMeter).
 * Helps to choose the animation details (Einstellungen → Anzeige) on weak kiosk hardware.
 */

export interface FrameStats {
  /** Frames per second over the measured window. */
  fps: number;
  /** Longest gap between two frames in ms (a stutter shows up here, not in the average). */
  worst: number;
  /** Share of frames that took longer than 1.5 frames at 60 Hz (25 ms). */
  jank: number;
}

/** Statistics from the timestamps (ms, ascending) of consecutive animation frames. */
export function frameStats(times: number[]): FrameStats {
  if (times.length < 2) return { fps: 0, worst: 0, jank: 0 };
  let worst = 0;
  let slow = 0;
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > worst) worst = d;
    if (d > 25) slow++;
  }
  const span = times[times.length - 1] - times[0];
  return {
    fps: span > 0 ? Math.round(((times.length - 1) * 1000) / span) : 0,
    worst: Math.round(worst),
    jank: Math.round((slow / (times.length - 1)) * 100) / 100,
  };
}

/** True if the address asks for the frame rate overlay (`?fps=1`). */
export const fpsRequested = (search = typeof location !== 'undefined' ? location.search : '') => {
  const v = new URLSearchParams(search).get('fps');
  return v === '1' || v === 'true';
};

/** Seconds a dot needs for one energy flow line: faster with more power (0.9 s from 5 kW, 2.6 s near idle). */
export const flowDuration = (watts: number) => +(2.6 - 1.7 * Math.min(1, Math.abs(watts) / 5000)).toFixed(2);
