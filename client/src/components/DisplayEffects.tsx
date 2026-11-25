/**
 * Behaviour that depends on the display settings of this device (see lib/display.ts):
 *   - hides the menu after the configured idle time,
 *   - kiosk: returns to the overview when nobody uses the screen, hides the mouse pointer,
 *     keeps the screen on (Wake Lock) and shifts the picture slightly against burn-in,
 *   - darkens the screen during the night window (or, with a light sensor, while the room is dark).
 * Renders only the dimming layer; everything else is side effects.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { inTimeWindow, kioskState, useIdle } from '../lib/display';
import { useNow } from '../lib/hooks';
import { clamp } from '../lib/format';

/** Small offsets (px) the picture cycles through in kiosk mode. */
const SHIFTS: [number, number][] = [[0, 0], [2, 1], [-1, 2], [1, -2], [-2, -1], [2, -1], [-2, 2]];
const SHIFT_MS = 4 * 60 * 1000;
/** The mouse pointer disappears after this idle time in kiosk mode. */
const CURSOR_IDLE_MS = 5000;

/** Current pixel offset against burn-in; changes every few minutes while `on`. */
export function usePixelShift(on: boolean): [number, number] {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (!on) return;
    const t = setInterval(() => setI((x) => (x + 1) % SHIFTS.length), SHIFT_MS);
    return () => clearInterval(t);
  }, [on]);
  return SHIFTS[i];
}

/** Applies the idle / kiosk behaviour and renders the night dimming layer. */
export function DisplayEffects() {
  const d = useStore((s) => s.display);

  // menu: hide it after the idle time (it stays reachable through the handle)
  const menuIdle = useIdle(d.menuAutoHide ? Math.max(5, d.menuAutoHideSeconds) * 1000 : 0);
  useEffect(() => {
    if (!menuIdle) return;
    const s = useStore.getState();
    if (s.display.menuPinned) s.setDisplay({ menuPinned: false });
    if (s.menuOpen) s.setMenuOpen(false);
  }, [menuIdle]);

  // kiosk: close dialogs and go back to the overview (not from the settings: unsaved changes)
  const homeIdle = useIdle(d.kiosk && d.kioskHomeSeconds > 0 ? Math.max(10, d.kioskHomeSeconds) * 1000 : 0);
  useEffect(() => {
    if (!homeIdle) return;
    const s = useStore.getState();
    useStore.setState({ focusCamera: null, notificationsOpen: false, changelogOpen: false, menuOpen: false });
    if (s.view !== 'home' && s.view !== 'settings') s.setView('home');
  }, [homeIdle]);

  // kiosk: hide the mouse pointer while idle
  const cursorIdle = useIdle(d.kiosk && d.kioskHideCursor ? CURSOR_IDLE_MS : 0);
  useEffect(() => {
    document.body.classList.toggle('hide-cursor', cursorIdle);
  }, [cursorIdle]);

  // kiosk: keep the screen on; the lock is lost when the tab is hidden, so it is requested again
  useEffect(() => {
    if (!d.kiosk || !d.kioskWakeLock || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (alive) lock = l;
          else void l.release();
        })
        .catch(() => undefined); // not allowed (e.g. no HTTPS): the kiosk browser has to do it
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', request);
      lock?.release().catch(() => undefined);
    };
  }, [d.kiosk, d.kioskWakeLock]);

  // night dimming: a black layer that lets every touch through; with a light sensor also while it is dark
  // (a little hysteresis, so the picture does not flicker around the threshold)
  const lux = useStore((s) => (d.lightDim && d.presenceAgent ? s.states[kioskState(d.presenceAgent, 'lux')]?.val : undefined));
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (typeof lux !== 'number') return setDark(false);
    setDark((was) => (was ? lux < d.lightDimLux * 1.5 + 1 : lux < d.lightDimLux));
  }, [lux, d.lightDimLux]);
  const now = useNow(60000);
  const night = d.nightDim && inTimeWindow(d.nightFrom, d.nightTo, new Date(now));
  if (!night && !(d.lightDim && dark)) return null;
  return <div className="fixed inset-0 z-[90] pointer-events-none bg-black" style={{ opacity: clamp(d.nightLevel, 0.1, 0.85) }} aria-hidden />;
}
