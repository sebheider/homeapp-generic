/**
 * Display settings of this device. They are stored in the browser (localStorage), not on the server,
 * so a wall tablet can run in kiosk mode while phones keep the normal layout.
 *
 * - Design of the overview: "standard" (command centre), "nexus" (holographic digital twin of
 *   the house; always dark) or "custom" (freely designable widgets in a grid, see lib/widgets.ts).
 * - Menu: full (sidebar with labels), small (icon rail, like on tablets) or hidden; when hidden a
 *   handle (☰) opens it as an overlay. Phones always show the compact bottom bar (or hide it).
 *   Optionally the menu hides itself after some seconds without interaction.
 * - Kiosk mode: the overview fits on one screen (designed for 1280×800 in landscape and 800×1280 in
 *   portrait format; bigger screens such as 1920×1200 or 1200×1920 scale everything up
 *   proportionally, see `kioskScale`; a manual zoom factor of the settings replaces the automatic one) plus helpers for a
 *   permanent display: back to the overview when idle, hidden mouse pointer, pixel shift against
 *   burn-in, keeping the screen on and optionally reducing effects to save GPU resources. The menu
 *   always stays reachable through the handle.
 * - Animation details: "high" (all effects), "medium" (still background, lighter blur, no endless
 *   decorative animations) or "low" (no blur and no endless or entrance animations, except loading
 *   and alarm indicators) to spare weak graphics chips.
 * - Night dimming: darkens the picture in a time window (any mode).
 * - Screensaver: in a time window the app is replaced by a black screen (optionally a small,
 *   wandering clock) after a minute without input, so the device saves CPU and GPU resources;
 *   a touch brings the app back until it has been left alone for a minute again.
 * - Presence sensor: a kiosk agent at this display (LD2410 radar, see kiosk-agent/) keeps the
 *   screensaver away while somebody is there and wakes it on arrival; optionally the screensaver
 *   starts at any time once nobody is there, and the dimming also follows the light sensor.
 *
 * The address parameter `?kiosk=1` (or `?kiosk=0`) switches the kiosk mode on (off), handy for
 * kiosk browsers whose start page is fixed; `?design=nexus` (or `standard`, `custom`) picks the overview design
 * and `?effects=medium` (or `high`, `low`) the animation details. `?fps=1` shows the frame rate (lib/perf).
 */
import { useCallback, useEffect, useState } from 'react';

export type DashboardDesign = 'standard' | 'nexus' | 'custom';

const DESIGNS: readonly DashboardDesign[] = ['standard', 'nexus', 'custom'];

/** Valid overview design from a stored or typed value; anything unknown means "standard". */
export const dashboardDesign = (v: unknown): DashboardDesign => (DESIGNS.includes(v as DashboardDesign) ? (v as DashboardDesign) : 'standard');

/** Amount of graphical effects (blur, glow, animations), see index.css `[data-effects]`. */
export type EffectsLevel = 'high' | 'medium' | 'low';

const EFFECTS_LEVELS: readonly EffectsLevel[] = ['high', 'medium', 'low'];

/** Valid effects level from a stored or typed value; anything unknown means "high". */
export const effectsLevel = (v: unknown): EffectsLevel => (EFFECTS_LEVELS.includes(v as EffectsLevel) ? (v as EffectsLevel) : 'high');

/** Size of the docked menu: full sidebar with labels, small icon rail or hidden (handle ☰). */
export type MenuMode = 'full' | 'small' | 'hidden';

/** Current menu mode of the display settings. */
export const menuMode = (d: Pick<DisplaySettings, 'menuPinned' | 'menuCompact'>): MenuMode => (!d.menuPinned ? 'hidden' : d.menuCompact ? 'small' : 'full');

/** Settings for a chosen menu mode; hiding forgets the small size, so pinning again shows the full menu. */
export const menuModeSettings = (mode: MenuMode): Pick<DisplaySettings, 'menuPinned' | 'menuCompact'> =>
  mode === 'hidden' ? { menuPinned: false, menuCompact: false } : { menuPinned: true, menuCompact: mode === 'small' };

/**
 * Next mode of the hide button of the docked menu: full → small → hidden. `wide` = desktop width;
 * narrower screens (tablets) show the icon rail for "full" anyway, so the button hides it directly.
 */
export const nextMenuMode = (mode: MenuMode, wide: boolean): MenuMode => (mode === 'full' && wide ? 'small' : 'hidden');

export interface DisplaySettings {
  /** Design of the overview page: the standard command centre, "Nexus" (digital twin of the house) or the own start page. */
  dashboardDesign: DashboardDesign;
  /** Menu permanently visible; false = hidden, the handle opens it as an overlay. */
  menuPinned: boolean;
  /** Docked menu as small icon rail instead of the sidebar with labels (desktop). */
  menuCompact: boolean;
  /** Hide the menu automatically after `menuAutoHideSeconds` without interaction. */
  menuAutoHide: boolean;
  menuAutoHideSeconds: number;
  /** One-screen overview and the helpers below. */
  kiosk: boolean;
  /** Back to the overview after this many seconds without interaction (0 = never). */
  kioskHomeSeconds: number;
  /** Hide the mouse pointer while nobody uses the screen. */
  kioskHideCursor: boolean;
  /** Move the picture by a few pixels now and then (against burn-in). */
  kioskShift: boolean;
  /** Keep the screen switched on (Screen Wake Lock API; needs HTTPS or a kiosk browser). */
  kioskWakeLock: boolean;
  /** Reduce graphical effects on the kiosk overview to save GPU resources. */
  kioskReduceEffects: boolean;
  /** Zoom factor of the kiosk views: 0 = automatic (see `kioskScale`), otherwise 1 … 2. */
  kioskZoom: number;
  /** Animation details: how many graphical effects this device shows. */
  effects: EffectsLevel;
  /** Darken the screen between `nightFrom` and `nightTo` ("HH:MM"). */
  nightDim: boolean;
  nightFrom: string;
  nightTo: string;
  /** Strength of the dimming, 0.1 … 0.85 (opacity of a black layer). */
  nightLevel: number;
  /** Screensaver between `screensaverFrom` and `screensaverTo` ("HH:MM"), see `useScreensaver`. */
  screensaver: boolean;
  screensaverFrom: string;
  screensaverTo: string;
  /** Show a small clock that moves to another spot every minute (otherwise completely black). */
  screensaverClock: boolean;
  /** Kiosk agent at this display ('' = none): its presence / light values steer screensaver and dimming. */
  presenceAgent: string;
  /** Screensaver at any time (not only in its window) a minute after nobody is there any more. */
  presenceScreensaver: boolean;
  /** Dim like at night while the light sensor of the agent measures less than `lightDimLux`. */
  lightDim: boolean;
  lightDimLux: number;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  dashboardDesign: 'standard',
  menuPinned: true,
  menuCompact: false,
  menuAutoHide: false,
  menuAutoHideSeconds: 20,
  kiosk: false,
  kioskHomeSeconds: 120,
  kioskHideCursor: true,
  kioskShift: true,
  kioskWakeLock: true,
  kioskReduceEffects: false,
  kioskZoom: 0,
  effects: 'high',
  nightDim: false,
  nightFrom: '22:00',
  nightTo: '06:00',
  nightLevel: 0.55,
  screensaver: false,
  screensaverFrom: '23:00',
  screensaverTo: '06:00',
  screensaverClock: true,
  presenceAgent: '',
  presenceScreensaver: false,
  lightDim: false,
  lightDimLux: 5,
};

const KEY = 'display';

/** Stores the settings of this device. */
export const saveDisplay = (s: DisplaySettings) => localStorage.setItem(KEY, JSON.stringify(s));

/** Settings of this device (stored values over defaults); `?kiosk=1|0` in the address switches the kiosk mode. */
export function loadDisplay(): DisplaySettings {
  let stored: Partial<DisplaySettings> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}') ?? {};
  } catch {
    /* broken entry: defaults */
  }
  const s: DisplaySettings = { ...DEFAULT_DISPLAY, ...stored };
  s.dashboardDesign = dashboardDesign(s.dashboardDesign);
  s.effects = effectsLevel(s.effects);
  s.kioskZoom = kioskZoom(s.kioskZoom);
  s.menuCompact = s.menuCompact === true;
  s.presenceAgent = typeof s.presenceAgent === 'string' ? s.presenceAgent : '';
  s.lightDimLux = Number.isFinite(s.lightDimLux) ? s.lightDimLux : DEFAULT_DISPLAY.lightDimLux;
  const param = new URLSearchParams(location.search).get('kiosk');
  if (param === '1' || param === 'true') Object.assign(s, { kiosk: true, menuAutoHide: true, menuPinned: false });
  else if (param === '0' || param === 'false') s.kiosk = false;
  const design = new URLSearchParams(location.search).get('design');
  if (design != null && DESIGNS.includes(design as DashboardDesign)) s.dashboardDesign = design as DashboardDesign;
  // `?effects=low|medium|high`: set up the animation details of a kiosk without opening the menu
  const effects = new URLSearchParams(location.search).get('effects');
  if (effects != null && EFFECTS_LEVELS.includes(effects as EffectsLevel)) s.effects = effects as EffectsLevel;
  if (param != null || design != null || effects != null) saveDisplay(s);
  return s;
}

/** "HH:MM" -> minutes since midnight (null if invalid). */
const minutes = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** True if `d` lies in the window from–to; windows may run over midnight (22:00–06:00). */
export function inTimeWindow(from: string, to: string, d = new Date()) {
  const a = minutes(from);
  const b = minutes(to);
  if (a == null || b == null || a === b) return false;
  const now = d.getHours() * 60 + d.getMinutes();
  return a < b ? now >= a && now < b : now >= a || now < b;
}

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
export const SCREENSAVER_WAKE_MS = 60_000;

/** Datapoint of a kiosk agent's value (see server kiosk.js). */
export const kioskState = (agent: string, key: string) => `homeapp.kiosk.${agent}.${key}`;

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
 * Spot of the screensaver clock in minute `n` (centre in percent of width and height): changes every
 * minute against burn-in and stays between 25 % and 75 %, so the clock never touches the edges.
 */
export function screensaverSpot(n: number) {
  const rnd = (k: number) => {
    const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  return { x: Math.round(25 + rnd(1) * 50), y: Math.round(25 + rnd(2) * 50) };
}

/** Whether a CSS media query matches (follows changes, e.g. rotating a tablet). */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
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

/**
 * Shell of the navigation by screen size: `bar` = phones (header + bottom bar), `dock` = tablets and wall
 * displays in portrait format (top row + bottom dock, the hidden menu opens as launcher sheet),
 * `sidebar` = landscape tablets and desktops (side menu). Same limits as the media query `NAV_DOCK`.
 */
export type NavShell = 'bar' | 'dock' | 'sidebar';
export const navShell = (w: number, h: number): NavShell => (w < 768 ? 'bar' : h >= w ? 'dock' : 'sidebar');
const NAV_DOCK = '(min-width: 768px) and (orientation: portrait)';
const NAV_BAR = '(max-width: 767.98px)';

/** Current navigation shell; follows rotating and resizing. */
export function useNavShell(): NavShell {
  const bar = useMedia(NAV_BAR);
  const dock = useMedia(NAV_DOCK);
  return bar ? 'bar' : dock ? 'dock' : 'sidebar';
}

/** Columns of the launcher grid: balanced rows, at most five tiles per row. */
export const launcherColumns = (n: number) => (n <= 4 ? Math.max(n, 1) : n <= 6 ? 3 : n <= 8 ? 4 : 5);

/** Screen sizes (CSS pixels) the kiosk layouts are designed for: landscape and portrait format. */
export const KIOSK_BASE = { w: 1280, h: 800 } as const;
export const KIOSK_BASE_PORTRAIT = { w: 800, h: 1280 } as const;
const KIOSK_MAX_SCALE = 2;

/** Manual zoom choices of the settings (0 = automatic). */
export const KIOSK_ZOOMS = [0, 1, 1.25, 1.5, 1.75, 2] as const;

/** Valid manual kiosk zoom from a stored value: 0 (automatic) or 1 … 2, rounded to hundredths. */
export const kioskZoom = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.round(Math.min(KIOSK_MAX_SCALE, n) * 100) / 100 : 0;
};

/**
 * Zoom factor of the kiosk views on a screen of `w`×`h` CSS pixels: bigger screens (e.g. 1920×1200
 * or, in portrait format, 1200×1920 at a device pixel ratio of 1) show the layout designed for
 * 1280×800 (800×1280) proportionally larger (here 1.5×), so text and buttons keep their physical
 * size. Never smaller than 1, at most 2.
 */
export function kioskScale(w: number, h: number, zoom = 0) {
  if (kioskZoom(zoom) > 0) return kioskZoom(zoom);
  if (!(w > 0 && h > 0)) return 1;
  const base = h > w ? KIOSK_BASE_PORTRAIT : KIOSK_BASE;
  const s = Math.min(w / base.w, h / base.h);
  return Math.round(Math.min(KIOSK_MAX_SCALE, Math.max(1, s)) * 100) / 100;
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

/** What the browser reports about the screen; shown in the settings to set up kiosk browsers. */
export interface ScreenInfo {
  /** Window size in CSS pixels. */
  w: number;
  h: number;
  /** Device pixel ratio (physical pixels per CSS pixel). */
  dpr: number;
  portrait: boolean;
  /** Big enough for the one-screen kiosk overview (see `KIOSK_SCREEN`). */
  kioskFits: boolean;
}

export const screenInfo = (): ScreenInfo => ({
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

/**
 * Hint for a kiosk browser whose window is too small for the kiosk overview because it renders with a
 * device pixel ratio above 1 (e.g. a 1200×1980 panel reported as 600×990): its zoom has to be lowered.
 */
export function screenHint(i: Pick<ScreenInfo, 'w' | 'h' | 'dpr' | 'kioskFits'>): string | null {
  if (i.kioskFits) return null;
  const w = i.w * i.dpr;
  const h = i.h * i.dpr;
  if (i.dpr > 1 && ((h > w && w >= 768 && h >= 1100) || (w >= h && w >= 900 && h >= 560))) {
    const zoom = Math.round(100 / i.dpr);
    return `Der Browser vergrößert um ${Math.round(i.dpr * 100)} %, dadurch ist das Fenster zu klein für die Kiosk-Übersicht. Stelle im Kiosk-Browser einen Zoom von ${zoom} % (Pixelverhältnis 1) ein – die App skaliert danach selbst.`;
  }
  return 'Das Fenster ist kleiner als 900×560 (quer) bzw. 768×1100 (hoch) – die Kiosk-Übersicht braucht mehr Platz, es wird die normale Ansicht gezeigt.';
}
