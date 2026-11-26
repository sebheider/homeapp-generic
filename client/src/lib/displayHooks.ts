/**
 * React hooks that apply the display settings of this device (lib/display.ts): idle detection, screensaver,
 * kiosk layout and zoom, navigation shell and screen information. Kept apart from lib/display.ts, which only
 * holds plain functions (tested directly with node:test).
 */
import { useCallback, useEffect, useState } from 'react';
import { useMedia } from './hooks';
import { kioskScale, type NavShell, type ScreenInfo } from './display';

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * True after `ms` milliseconds without pointer, touch, wheel or keyboard input; false again on the
 * next input. `ms <= 0` switches the detection off (never idle).
 */
export function useIdle(ms: number) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    if (ms <= 0) return;
    let timer = 0;
    const reset = () => {
      setIdle(false); // no re-render while already active
      clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    ACTIVITY.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      ACTIVITY.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms]);
  return idle;
}

/** The screensaver starts (again) after this long without input. */
const SCREENSAVER_WAKE_MS = 60_000;

/**
 * Screensaver state while `active` (inside its time window): sleeping after `ms` without input.
 * While sleeping no input is watched; only `wake()` (a touch on the screensaver) ends it, so the
 * waking touch can not reach the app. Every later input postpones the next start by `ms`.
 * `hold` (somebody in front of the presence sensor) wakes it and keeps it away; the countdown
 * starts again when `hold` ends.
 */
export function useScreensaver(active: boolean, ms = SCREENSAVER_WAKE_MS, hold = false): [sleeping: boolean, wake: () => void] {
  const [sleeping, setSleeping] = useState(false);
  useEffect(() => {
    if (!active || hold) {
      setSleeping(false);
      return;
    }
    if (sleeping) return;
    let timer = 0;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setSleeping(true), ms);
    };
    ACTIVITY.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      ACTIVITY.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active, sleeping, ms, hold]);
  const wake = useCallback(() => setSleeping(false), []);
  return [active && sleeping, wake];
}

/**
 * Screens big enough for the one-screen kiosk overview: landscape from about 900×560 (designed for
 * 1280×800) or portrait from 768×1100 (designed for 800×1280, e.g. a 10" display with 1200×1920). Narrower
 * portrait screens get the phone shell, so they keep the normal scrolling overview.
 */
const KIOSK_SCREEN = '(orientation: landscape) and (min-width: 900px) and (min-height: 560px), (orientation: portrait) and (min-width: 768px) and (min-height: 1100px)';
/** Portrait format (taller than wide); the kiosk overview then stacks its panels. */
const PORTRAIT = '(orientation: portrait)';

/** True if the kiosk mode is on and the screen is big enough for its one-screen overview. */
export function useKioskLayout(kiosk: boolean) {
  return useMedia(KIOSK_SCREEN) && kiosk;
}

/** True on screens in portrait format (taller than wide, e.g. a wall display mounted upright). */
export function usePortrait() {
  return useMedia(PORTRAIT);
}
const NAV_DOCK = '(min-width: 768px) and (orientation: portrait)';
const NAV_BAR = '(max-width: 767.98px)';

/** Current navigation shell; follows rotating and resizing. */
export function useNavShell(): NavShell {
  const bar = useMedia(NAV_BAR);
  const dock = useMedia(NAV_DOCK);
  return bar ? 'bar' : dock ? 'dock' : 'sidebar';
}

/**
 * Zoom factor of the kiosk views for the current window (1 outside the kiosk mode); follows resizing.
 * `zoom` > 0 is a manual factor of the settings and replaces the automatic one.
 */
export function useKioskScale(kiosk: boolean, zoom = 0) {
  const [scale, setScale] = useState(() => (kiosk ? kioskScale(window.innerWidth, window.innerHeight, zoom) : 1));
  useEffect(() => {
    if (!kiosk) {
      setScale(1);
      return;
    }
    const on = () => setScale(kioskScale(window.innerWidth, window.innerHeight, zoom));
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [kiosk, zoom]);
  return scale;
}

const screenInfo = (): ScreenInfo => ({
  w: window.innerWidth,
  h: window.innerHeight,
  dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
  portrait: window.innerHeight > window.innerWidth,
  kioskFits: window.matchMedia(KIOSK_SCREEN).matches,
});

/** Current `screenInfo()`; follows resizing and rotating. */
export function useScreenInfo() {
  const [info, setInfo] = useState(screenInfo);
  useEffect(() => {
    const on = () => setInfo(screenInfo());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return info;
}
