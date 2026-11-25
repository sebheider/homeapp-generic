/**
 * Screensaver (see lib/display.ts): inside its time window the whole app is replaced by a black
 * screen after a minute without input – nothing is rendered, animated or refreshed (cameras, clocks,
 * live values), which spares CPU and GPU. Optionally a small clock with the current weather (a still
 * symbol, no animation) moves to another spot every minute against burn-in. A touch (or key) brings the app back; a minute after the last input the
 * screensaver starts again. It never starts in the settings (unsaved changes), while a camera is
 * open, while a camera pop-up is shown or while an alarm is active (those also wake the screen).
 * With a presence sensor (kiosk agent) somebody in front of the display wakes it and keeps it away;
 * optionally it then also starts outside its window as soon as nobody is there. While the agent keeps
 * the screen on by itself (always-on time, woken by a camera pop-up or a notification) the agent counts
 * as "somebody there", so the switched-on screen does not stay black.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { isDismissed, needsAck, useStore } from '../lib/store';
import { inTimeWindow, kioskState, screensaverSpot, useScreensaver } from '../lib/display';
import { clockTime, num } from '../lib/format';
import { describeCode, useLocalWeather, useWeatherData } from '../lib/weather';
import { MiniWeatherIcon } from './WeatherIcon';

const MINUTE = 60_000;
const dateFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

/** Current time, refreshed right after every full minute while `on`. */
function useMinute(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    let timer = 0;
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, MINUTE - (Date.now() % MINUTE) + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, [on]);
  return now;
}

/** Outside temperature and condition below the clock (local sensor first, like the dashboard). */
function SaverWeather() {
  const w = useWeatherData().data;
  const cur = w?.configured ? w.current : undefined;
  const local = useLocalWeather();
  const temp = local.temperature ?? cur?.temp ?? null;
  if (temp == null && !cur) return null;
  const cond = describeCode(cur?.code);
  return (
    <div className="mt-4 inline-flex items-center gap-2" style={{ fontSize: 'min(4vw, 4vh, 1.5rem)' }}>
      {cur && <MiniWeatherIcon kind={cond.kind} isDay={cur.isDay} size={28} />}
      {temp != null && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{num(temp, 1)} °C</span>}
      {cur && <span style={{ opacity: 0.7 }}>· {cond.label}</span>}
    </div>
  );
}

/** The black screen; a tap or key press wakes the app. */
function Screensaver({ clock, now, onWake }: { clock: boolean; now: number; onWake: () => void }) {
  useEffect(() => {
    window.addEventListener('keydown', onWake);
    return () => window.removeEventListener('keydown', onWake);
  }, [onWake]);
  const spot = screensaverSpot(Math.floor(now / MINUTE));
  return (
    <div className="fixed inset-0 z-[80] bg-black cursor-none select-none" onClick={onWake} role="button" aria-label="Bildschirmschoner – antippen zum Aufwecken">
      {clock && (
        <div
          className="absolute text-center whitespace-nowrap"
          style={{ left: `${spot.x}%`, top: `${spot.y}%`, transform: 'translate(-50%, -50%)', color: 'rgba(255, 255, 255, 0.42)', lineHeight: 1 }}
        >
          <div style={{ fontSize: 'min(13vw, 13vh, 7rem)', fontWeight: 200, fontVariantNumeric: 'tabular-nums' }}>{clockTime(now)}</div>
          <div className="mt-3" style={{ fontSize: 'min(3.5vw, 3.5vh, 1.25rem)' }}>{dateFormat.format(now)}</div>
          <SaverWeather />
        </div>
      )}
    </div>
  );
}

/** Shows `children` (the app) or, while the screensaver runs, only the black screen. */
export function ScreensaverGate({ children }: { children: ReactNode }) {
  const d = useStore((s) => s.display);
  const busy = useStore(
    (s) =>
      s.view === 'settings' ||
      s.focusCamera != null ||
      s.popup != null ||
      s.alerts.some((a) => needsAck(a) || (a.severity === 'alarm' && !isDismissed(a, s.dismissedAlerts))),
  );
  // presence: true / false from the agent's radar (true while it holds the screen on), null without sensor or while the agent is offline
  const presence = useStore((s) => {
    if (!d.presenceAgent) return null;
    if (s.states[kioskState(d.presenceAgent, 'online')]?.val !== true) return null;
    if (s.states[kioskState(d.presenceAgent, 'wake')]?.val === true) return true;
    const v = s.states[kioskState(d.presenceAgent, 'presence')]?.val;
    return typeof v === 'boolean' ? v : null;
  });
  const now = useMinute(d.screensaver || d.presenceScreensaver);
  const inWindow = d.screensaver && inTimeWindow(d.screensaverFrom, d.screensaverTo, new Date(now));
  const absent = d.presenceScreensaver && presence === false;
  const active = (inWindow || absent) && !busy;
  const [sleeping, wake] = useScreensaver(active, undefined, presence === true);
  // the same `children` elements: re-rendering this gate every minute does not re-render the app
  if (!sleeping) return <>{children}</>;
  return <Screensaver clock={d.screensaverClock} now={now} onWake={wake} />;
}
