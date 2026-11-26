/**
 * App shell: start-up screen, responsive navigation (components/Navigation.tsx: bottom bar on phones, top row +
 * dock + launcher in portrait format, sidebar / icon rail in landscape), the current page, plus the
 * global overlays (motion pop-up, printer webcam pop-up, camera viewer, notifications, release notes, toasts) and the
 * display behaviour of this device (kiosk mode, night dimming, animation details). Heavy pages are loaded on demand.
 */
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue } from 'motion/react';
import { LayoutDashboard, WifiOff, X, CircleAlert, CircleCheck, Info } from 'lucide-react';
import { useStore, viewFromHash, type Toast, type View } from './lib/store';
import { useNow, useMedia } from './lib/hooks';
import { useKioskLayout, useKioskScale, useNavShell } from './lib/displayHooks';
import { useSwipe } from './lib/swipe';
import { adjacentPage, navigationDirection } from './lib/navigation';
import { CameraPopupPauseBanner, CameraViewer, MotionPopup } from './components/Cameras';
import { PrinterPopup } from './components/Printer';
import { AlertBanner, NotificationCenter } from './components/Notifications';
import { ChangelogDialog } from './components/Changelog';
import { BottomNav, Dock, Launcher, MenuHandle, MenuOverlay, MobileHeader, PagePosition, Sidebar, TopBar, hasPrinter, hasRadar, hasSpotify, navItems, pageTone } from './components/Navigation';
import { DisplayEffects, usePixelShift } from './components/DisplayEffects';
import { ScreensaverGate } from './components/Screensaver';
import { Loading, StaticVisualsContext } from './components/ui';
import { FpsMeter } from './components/FpsMeter';
import { fpsRequested } from './lib/perf';
import { daypart, type Daypart } from './lib/ambience';
import { useWeatherData } from './lib/weather';
import { extensionIdOf } from './lib/extensions';
import { RoomsView } from './views/Rooms';
import { LightsView } from './views/Lights';
import { ClimateView } from './views/Climate';
import { CamerasView } from './views/CamerasView';

// Large pages load only when opened; the overview is the main source of page-specific code.
const Dashboard = lazy(() => import('./views/Dashboard').then((m) => ({ default: m.Dashboard })));
const EnergyView = lazy(() => import('./views/Energy').then((m) => ({ default: m.EnergyView })));
const WeatherView = lazy(() => import('./views/Weather').then((m) => ({ default: m.WeatherView })));
const SettingsView = lazy(() => import('./views/Settings').then((m) => ({ default: m.SettingsView })));
const PrinterView = lazy(() => import('./views/Printer').then((m) => ({ default: m.PrinterView })));
const SpotifyView = lazy(() => import('./views/Spotify').then((m) => ({ default: m.SpotifyView })));
const RadarView = lazy(() => import('./views/Radar').then((m) => ({ default: m.RadarView })));
const MowerView = lazy(() => import('./views/Mower').then((m) => ({ default: m.MowerView })));
const ExtensionPage = lazy(() => import('./components/Extension').then((m) => ({ default: m.ExtensionPage })));

/** Navigation of the current store state (swipe gestures). */
const currentNav = () => {
  const s = useStore.getState();
  return navItems(s.config, hasPrinter(s), hasSpotify(s), hasRadar(s), s.extensions);
};

/** Swipe left / right: next / previous page of the navigation (not past the first / last page, not from the settings). */
function swipePage(dir: 1 | -1) {
  const s = useStore.getState();
  const next = adjacentPage(currentNav(), s.view, dir);
  if (!next) return false;
  s.setView(next.id as View);
  return true;
}

type PageTransition = { direction: number; distance: number; reduced: boolean };
const pageVariants = {
  enter: ({ direction, distance, reduced }: PageTransition) => ({ left: reduced ? 0 : direction * distance, opacity: direction && !reduced ? 1 : 0 }),
  center: { left: 0, opacity: 1 },
  exit: ({ direction, distance, reduced }: PageTransition) => ({ left: reduced ? 0 : -direction * distance, opacity: direction && !reduced ? 1 : 0 }),
};

/** Animate `left`, not a transform: fixed dialogs inside pages must stay viewport-relative. */
function SlidingPage({ view, kioskHome, transition, gestureRef }: { view: View; kioskHome: boolean; transition: PageTransition; gestureRef: RefObject<HTMLElement | null> }) {
  const left = useMotionValue(0);
  const present = useIsPresent();
  useSwipe(gestureRef, swipePage, present, {
    canSwipe: (dir) => Boolean(adjacentPage(currentNav(), useStore.getState().view, dir)),
    onDrag: (dx) => {
      left.stop();
      left.set(transition.reduced ? 0 : dx);
    },
    onCancel: () => {
      animate(left, 0, { duration: transition.reduced ? 0 : 0.2, ease: 'easeOut' });
    },
  });
  return (
    <motion.div
      className={view === 'home' ? (kioskHome ? 'h-full min-h-0' : undefined) : `page-hud tone-${pageTone(view)}`}
      style={{ position: 'relative', gridArea: '1 / 1', minWidth: 0, left }}
      inert={!present}
      custom={transition}
      variants={pageVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: transition.reduced ? 0.1 : 0.28, ease: 'easeOut' }}
    >
      <StaticVisualsContext.Provider value={transition.reduced}>
        <Suspense fallback={<Loading />}>
          <Page view={view} />
        </Suspense>
      </StaticVisualsContext.Provider>
    </motion.div>
  );
}

/**
 * Animated gradient background with slowly drifting colour blobs; `nexus`: deep space for the Nexus
 * overview; `still`: the blobs do not move (standard overview and kiosk mode).
 */
function Backdrop({ nexus = false, still = false, part }: { nexus?: boolean; still?: boolean; part?: Daypart }) {
  return (
    <div className={`backdrop ${nexus ? 'backdrop-nexus' : ''} ${still ? 'backdrop-still' : ''}`} data-daypart={part} aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );
}

/** Backdrop of the running app, tinted by the time of day (sun times of the weather, see lib/ambience.ts). */
function AmbientBackdrop(props: { nexus: boolean; still: boolean }) {
  const now = useNow(5 * 60_000);
  const w = useWeatherData().data;
  // without a location the server only answers { configured: false }
  const today = w?.configured ? w.daily[0] : undefined;
  return <Backdrop {...props} part={daypart(new Date(now), today?.sunrise, today?.sunset)} />;
}

/** Icon matching the kind of a toast. */
function ToastIcon({ kind }: { kind: Toast['kind'] }) {
  if (kind === 'error') return <CircleAlert size={16} className="text-rose-400" />;
  if (kind === 'success') return <CircleCheck size={16} className="text-emerald-400" />;
  return <Info size={16} className="text-sky-400" />;
}

/** Stack of the current toasts; `raised` keeps them above a bottom bar or dock. */
function Toasts({ raised }: { raised: boolean }) {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className={`fixed z-[60] left-1/2 -translate-x-1/2 ${raised ? 'bottom-24' : 'bottom-6'} w-max max-w-[calc(100vw-2rem)] flex flex-col gap-2 items-center pointer-events-none`}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass !rounded-2xl px-4 py-3 text-sm flex items-center gap-2.5 pointer-events-auto shadow-xl"
            style={{ background: 'color-mix(in srgb, var(--bg2) 92%, transparent)' }}
          >
            <ToastIcon kind={t.kind} />
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Component of the current view. */
function Page({ view }: { view: View }) {
  const modules = useStore((s) => s.config?.modules);
  const extension = extensionIdOf(view);
  if (extension) return <ExtensionPage id={extension} />;
  if ((view === 'weather' || view === 'printer' || view === 'spotify' || view === 'mower') && modules?.[view] === false) {
    return <div className="glass p-6">Dieses integrierte Modul ist deaktiviert. Es kann unter Einstellungen → Module wieder aktiviert werden.</div>;
  }
  switch (view) {
    case 'home': return <Dashboard />;
    case 'weather': return <WeatherView />;
    case 'rooms': return <RoomsView />;
    case 'lights': return <LightsView />;
    case 'climate': return <ClimateView />;
    case 'energy': return <EnergyView />;
    case 'cameras': return <CamerasView />;
    case 'spotify': return <SpotifyView />;
    case 'printer': return <PrinterView />;
    case 'mower': return <MowerView />;
    case 'radar': return <RadarView />;
    case 'settings': return <SettingsView />;
  }
}

const DEMO_HINT_KEY = 'homeapp.demoHintHidden';

/** Hint while the demo data runs; can be dismissed for the session of this browser. */
function DemoBanner() {
  const demo = useStore((s) => s.status?.demo);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DEMO_HINT_KEY) === '1');
  if (!demo || hidden) return null;
  const hide = () => {
    sessionStorage.setItem(DEMO_HINT_KEY, '1');
    setHidden(true);
  };
  return (
    <div className="mx-4 md:mx-8 mt-2 text-xs rounded-xl pl-3 pr-1 py-1 bg-violet-500/15 border border-violet-400/30 flex items-center gap-2" style={{ color: 'color-mix(in srgb, #a78bfa 55%, var(--fg))' }}>
      <Info size={14} className="shrink-0" />
      <span className="flex-1 min-w-0">Demo-Modus: simulierte Daten. Unter Einstellungen → Verbindungen mit ioBroker oder Home Assistant verbinden.</span>
      <button className="grid place-items-center w-9 h-9 shrink-0 rounded-lg hover:bg-violet-500/20" onClick={hide} aria-label="Hinweis ausblenden" title="Hinweis ausblenden">
        <X size={14} />
      </button>
    </div>
  );
}

/** Shown until the bootstrap data is loaded: pulsing logo, or an error with a retry button. */
function BootScreen() {
  const loadError = useStore((s) => s.loadError);
  const boot = useStore((s) => s.boot);
  return (
    <>
      <Backdrop />
      <div className="h-full grid place-items-center p-6 text-center">
        {loadError ? (
          <div className="glass p-8 max-w-sm flex flex-col items-center gap-3">
            <WifiOff size={36} className="text-rose-400" />
            <h1 className="text-lg font-semibold">Server nicht erreichbar</h1>
            <p className="text-sm text-muted">{loadError}</p>
            <button className="btn primary" onClick={() => boot()}>Erneut versuchen</button>
          </div>
        ) : (
          <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.6, repeat: Infinity }} className="icon-bubble on !w-20 !h-20 !rounded-3xl tone-violet">
            <LayoutDashboard size={36} />
          </motion.div>
        )}
      </div>
    </>
  );
}

/** Frame rate overlay for measuring on the kiosk (`?fps=1`). */
const SHOW_FPS = fpsRequested();

/** Root component. */
export default function App() {
  const ready = useStore((s) => s.ready);
  const view = useStore((s) => s.view);
  const boot = useStore((s) => s.boot);
  const theme = useStore((s) => s.theme);
  const config = useStore((s) => s.config);
  const printer = useStore(hasPrinter);
  const spotify = useStore(hasSpotify);
  const radar = useStore(hasRadar);
  const extensions = useStore((s) => s.extensions);
  const pinned = useStore((s) => s.display.menuPinned);
  const shell = useNavShell();
  const kiosk = useStore((s) => s.display.kiosk);
  const kioskShift = useStore((s) => s.display.kioskShift);
  const kioskLayout = useKioskLayout(kiosk);
  const kioskZoom = useStore((s) => s.display.kioskZoom);
  // only while the kiosk layout applies: a manual zoom must not blow up the normal view on too small windows
  const kioskScale = useKioskScale(kioskLayout, kioskZoom);
  const [dx, dy] = usePixelShift(kiosk && kioskShift);
  // the Nexus overview is always dark (only while it is shown)
  const nexusHome = useStore((s) => s.display.dashboardDesign === 'nexus') && view === 'home';
  const shownTheme = nexusHome ? 'dark' : theme;
  const mainRef = useRef<HTMLElement>(null);
  const effects = useStore((s) => s.display.effects);
  // "low" animation details: page changes and entrance animations as with reduced motion
  const reduced = useMedia('(prefers-reduced-motion: reduce)') || effects === 'low';
  const nav = navItems(config, printer, spotify, radar, extensions);
  const [navigation, setNavigation] = useState({ view, direction: 0 });
  const direction = navigation.view === view ? navigation.direction : navigationDirection(nav, navigation.view, view);
  if (navigation.view !== view) setNavigation({ view, direction });

  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [view, ready]);

  useEffect(() => {
    boot();
  }, []);
  // apply the theme to <html> and the browser chrome colour
  useEffect(() => {
    document.documentElement.dataset.theme = shownTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nexusHome ? '#03050e' : shownTheme === 'dark' ? '#0a0e1c' : '#eef1f9');
  }, [shownTheme, nexusHome]);
  // animation details of this device (see styles/effects.css `[data-effects]`)
  useLayoutEffect(() => {
    document.documentElement.dataset.effects = effects;
  }, [effects]);
  // kiosk on a big screen (e.g. 1920×1200 or 1200×1920): everything larger, see styles/surfaces.css `[data-ui-scale]`
  useLayoutEffect(() => {
    const html = document.documentElement;
    if (kioskScale > 1) {
      html.dataset.uiScale = String(kioskScale);
      html.style.setProperty('--ui-scale', String(kioskScale));
    } else {
      delete html.dataset.uiScale;
      html.style.removeProperty('--ui-scale');
    }
  }, [kioskScale]);
  // back / forward buttons of the browser change the hash
  useEffect(() => {
    const onHash = () => {
      const v = viewFromHash();
      if (v) useStore.setState({ view: v, menuOpen: false });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!ready) return <BootScreen />;

  const appName = config?.app.name || 'Zuhause';
  // kiosk: the overview fills exactly one screen, the other pages scroll as usual
  const kioskHome = kioskLayout && view === 'home';

  return (
    <>
      <ScreensaverGate>
        <AmbientBackdrop nexus={nexusHome} still={kioskHome || !nexusHome} />
        <div className="h-full flex">
          {shell === 'sidebar' && pinned && <Sidebar nav={nav} view={view} appName={appName} />}

          {/* sidebar shell with the menu hidden: a gutter on the left keeps the handle from covering the content */}
          <div className={`flex-1 min-w-0 min-h-0 flex flex-col ${shell === 'sidebar' && !pinned ? 'menu-gutter' : ''}`}>
            {shell === 'bar' && <MobileHeader appName={appName} />}
            {shell === 'dock' ? <TopBar nav={nav} view={view} /> : <PagePosition nav={nav} view={view} />}

            <DemoBanner />
            <AlertBanner />
            <CameraPopupPauseBanner />

            {/* relative offset instead of a transform, so fixed dialogs inside the pages keep working */}
            <main
              ref={mainRef}
              className={kioskHome ? 'flex-1 min-h-0 overflow-hidden p-3' : `flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 md:px-8 pt-3 md:pt-6 ${shell === 'bar' && pinned ? 'pb-28' : 'pb-10'}`}
              style={{ position: 'relative', left: dx, top: dy }}
            >
              <div className={`grid ${kioskHome ? 'h-full min-h-0' : 'max-w-[1800px] mx-auto'}`}>
                <AnimatePresence initial={false} custom={{ direction, distance: mainRef.current?.clientWidth ?? window.innerWidth, reduced }}>
                  <SlidingPage key={view} view={view} kioskHome={kioskHome} gestureRef={mainRef} transition={{ direction, distance: mainRef.current?.clientWidth ?? window.innerWidth, reduced }} />
                </AnimatePresence>
              </div>
            </main>
            {shell === 'dock' && pinned && <Dock nav={nav} view={view} />}
          </div>
        </div>

        {shell === 'sidebar' && !pinned && <MenuHandle />}
        {shell === 'sidebar' && <MenuOverlay nav={nav} view={view} appName={appName} />}
        {shell !== 'sidebar' && <Launcher nav={nav} view={view} appName={appName} />}
        {shell === 'bar' && <BottomNav nav={nav} view={view} />}

        <MotionPopup />
        <PrinterPopup />
        <CameraViewer />
        <NotificationCenter />
        <ChangelogDialog />
        <Toasts raised={shell !== 'sidebar' && pinned} />
      </ScreensaverGate>
      <DisplayEffects />
      {SHOW_FPS && <FpsMeter />}
    </>
  );
}
