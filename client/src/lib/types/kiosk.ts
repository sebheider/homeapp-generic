/** Wall display agents (kiosk-agent/): their settings, reports and presence radar frames. */
import type { TimeWindow } from './cameras';
import type { Severity } from './alerts';

/** Settings the server sends to the kiosk agents (see server kiosk.js). */
export interface KioskConfig {
  screenOff: boolean;
  screenOffSeconds: number;
  /** The screen stays on inside these windows, even without presence (agent's local time). */
  alwaysOn: TimeWindow[];
  /** Camera pop-ups switch the screen on. */
  wakeOnCamera: boolean;
  /** New notifications (and finished prints) switch the screen on. */
  wakeOnAlerts: boolean;
  /** Lowest severity of a notification that wakes the screen. */
  wakeSeverity: Severity;
  /** How long a woken screen stays on without presence. */
  wakeSeconds: number;
  /** No camera pop-up or notification switches the screen on inside these windows (presence and touch still do). */
  quietHours: TimeWindow[];
  /** Screen off inside these windows when there is no presence radar (or `screenOff` is false); touch wakes it. */
  offTimes: TimeWindow[];
  /** `dimBrightness` inside these windows, `fullBrightness` outside, when there is no light sensor (or `autoBrightness` is false). */
  dimTimes: TimeWindow[];
  /** % inside the dim times. */
  dimBrightness: number;
  /** % outside the dim times. */
  fullBrightness: number;
  autoBrightness: boolean;
  minBrightness: number;
  maxBrightness: number;
  luxDark: number;
  luxBright: number;
  /** cm; 0 = whole range of the radar. */
  presenceMaxDistance: number;
  intervalSeconds: number;
  /** m above sea level (CO₂ sensor). */
  co2Altitude: number;
  temperatureOffset: number;
}

/** A wall display agent that reported to the server. */
export interface KioskAgent {
  id: string;
  name: string;
  version: string;
  address: string;
  lastSeen: number;
  online: boolean;
  values: Record<string, number | boolean>;
  display: { method: string | null };
  errors: string[];
  /** Abilities, e.g. 'radar' = sends live radar frames (agent 1.3.0 and later); missing with older servers. */
  features?: string[];
}

/** Target of the presence radar: distance in cm and energy 0–100 (null: only known from the regular reports). */
export interface RadarTarget {
  distance: number;
  energy: number | null;
}

/**
 * Picture of a presence radar (LD2410), live from the agent while the radar page is open (see server kiosk.js
 * `cleanRadar`) or built from the regular reports.
 */
export interface RadarFrame {
  /** engineering: with the energy per distance gate; basic: targets only; pin: OUT pin, presence only; report: regular reports; none: no data (see `error`). */
  mode: 'engineering' | 'basic' | 'pin' | 'report' | 'none';
  presence: boolean | null;
  moving: RadarTarget | null;
  still: RadarTarget | null;
  /** Energy 0–100 of the distance gates 0 … N (engineering mode). */
  gates: { moving: number[]; still: number[] } | null;
  /** Width of a distance gate in cm (75, or 20 with the fine resolution). */
  gateCm: number;
  error: string | null;
}
