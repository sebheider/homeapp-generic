/**
 * Navigation of the app shell, one shell per screen (lib/display.ts `navShell`):
 * - `bar` (phones): compact header and a bottom bar that slides away while the menu is hidden.
 * - `dock` (tablets and wall displays in portrait format, e.g. 10" with 1200×1920): a top row with the
 *   menu button, page position and quick actions, a dock with all pages at the bottom while the menu is
 *   pinned and a launcher sheet with large tiles, quick actions and the menu size.
 * - `sidebar` (landscape tablets and desktops): side menu (full / small icon rail / hidden with handle and overlay).
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, CloudSun, Ellipsis, Flame, LayoutDashboard, LayoutGrid, Lightbulb, Menu, Moon, Music, PanelLeftClose, PanelLeftDashed, Pin, Printer3d, Radar, Settings as SettingsIcon, Sun, X, Zap, type LucideIcon } from 'lucide-react';
import { useStore, type View } from '../lib/store';
import { useNow } from '../lib/hooks';
import { clockTime } from '../lib/format';
import { launcherColumns, menuMode, menuModeSettings, nextMenuMode, useMedia, type MenuMode } from '../lib/display';
import { enabledPages, pagePosition } from '../lib/navigation';
import { radarAgentIds } from '../lib/radar';
import { LawnMower } from '../lib/icons';
import type { AppConfig, StateEntry, Status } from '../lib/types';
import { NotificationBell } from './Notifications';
import { VersionLink } from './Changelog';

const NAV_ICONS = { home: LayoutDashboard, weather: CloudSun, rooms: LayoutGrid, lights: Lightbulb, climate: Flame, energy: Zap, cameras: Camera, spotify: Music, printer: Printer3d, mower: LawnMower, radar: Radar };
/** Accent colour of each page (frame of the page, launcher tiles). */
export const PAGE_TONES = { home: 'violet', weather: 'cool', rooms: 'violet', lights: 'light', climate: 'heat', energy: 'energy', cameras: 'cool', spotify: 'green', printer: 'warm', mower: 'green', radar: 'green', settings: 'violet' } as const;

/**
 * Navigation entries; the settings page is reached through its own button. The weather page can be switched off;
 * Spotify and the printer page only exist while they are set up (or their demo runs), the radar page once a wall
 * display reported its presence radar, the mower page once a robotic mower is configured.
 */
export const navItems = (config: AppConfig | null, printer: boolean, spotify: boolean, radar: boolean) =>
  enabledPages(config?.weather?.enabled !== false, printer, spotify, radar, hasMower(config))
    .map((page) => ({ ...page, icon: NAV_ICONS[page.id] }));
export type NavItem = ReturnType<typeof navItems>[number];

/** True while a robotic mower is configured (its page belongs to the navigation). */
export const hasMower = (config: AppConfig | null) => Boolean(config?.devices.some((d) => d.type === 'mower'));

/** True while the printer page belongs to the navigation. */
export const hasPrinter = (s: { status: Status | null }) => Boolean(s.status?.printer?.enabled);
/** True while the Spotify page belongs to the navigation. */
export const hasSpotify = (s: { status: Status | null }) => Boolean(s.status?.spotify?.enabled);
/** True once a presence radar reported (cached per states object: the selector runs on every store change). */
let radarStates: object | null = null;
let radarFound = false;
export const hasRadar = (s: { states: Record<string, StateEntry> }) => {
  if (s.states !== radarStates) {
    radarStates = s.states;
    radarFound = radarAgentIds(s.states).length > 0;
  }
  return radarFound;
};

/** Background of the app logo. */
const BRAND_GRADIENT = 'linear-gradient(135deg,#7c5cff,#22d3ee)';
/** Background of docked menus and sheets. */
const barStyle = (opacity: number) => ({ background: `color-mix(in srgb, var(--bg) ${opacity}%, transparent)`, backdropFilter: 'blur(20px)' });

/** Current time "HH:MM", refreshed every 15 seconds. */
function Clock({ className = '' }: { className?: string }) {
  const now = useNow(15000);
  return <span className={`tabular-nums ${className}`}>{clockTime(now)}</span>;
}

/** Square app logo with the brand gradient. */
function AppLogo({ className, iconSize }: { className: string; iconSize: number }) {
  return (
    <div className={`grid place-items-center text-white ${className}`} style={{ background: BRAND_GRADIENT }}>
      <LayoutDashboard size={iconSize} />
    </div>
  );
}

/** Connection state of the browser WebSocket and the server's data sources. */
function useConnection() {
  const status = useStore((s) => s.status);
  const ws = useStore((s) => s.wsConnected);
  return { status, ws };
}

/** Small coloured dot + label that shows the health of a connection. */
function StatusDot({ ok, label, title }: { ok: boolean; label: string; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={title}>
      <i className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400 anim-breathe'}`} />
      {label}
    </span>
  );
}

/** Connection list: server, ioBroker (or demo), Surveillance Station, 3D printer and Spotify. */
function ConnectionStatus({ className = 'flex flex-col gap-1.5' }: { className?: string }) {
  const { status, ws } = useConnection();
  const sourceMode = useStore((s) => s.config?.iobroker.mode);
  return (
    <div className={className}>
      <StatusDot ok={ws} label="Server" />
      <StatusDot ok={Boolean(status?.source.connected)} label={status?.demo ? 'Demo-Daten' : sourceMode === 'homeassistant' ? 'Home Assistant' : 'ioBroker'} title={status?.source.error ?? undefined} />
      {status?.surveillance.enabled && <StatusDot ok={status.surveillance.connected} label="Surveillance" title={status.surveillance.error ?? undefined} />}
      {status?.printer?.enabled && <StatusDot ok={status.printer.connected} label="3D-Drucker" title={status.printer.error ?? undefined} />}
      {status?.spotify?.enabled && <StatusDot ok={status.spotify.connected} label="Spotify" title={status.spotify.error ?? undefined} />}
    </div>
  );
}

/** Compact connection indicator for the phone header (same order as `ConnectionStatus`). */
function ConnectionDots() {
  const { status, ws } = useConnection();
  const dot = (ok: boolean) => <i className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />;
  return (
    <span className="flex items-center gap-1">
      {dot(ws)}
      {dot(Boolean(status?.source.connected))}
      {status?.surveillance.enabled && dot(status.surveillance.connected)}
      {status?.printer?.enabled && dot(status.printer.connected)}
      {status?.spotify?.enabled && dot(status.spotify.connected)}
    </span>
  );
}

/** Switches between dark and light theme (with a small rotation animation); `label` shows the target as text. */
function ThemeButton({ className = '', label = false }: { className?: string; label?: boolean }) {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  return (
    <button className={`btn ${label ? '' : 'btn-icon'} ${className}`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={label ? undefined : 'Farbschema wechseln'}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} className="grid" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
          {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
        </motion.span>
      </AnimatePresence>
      {label && (theme === 'dark' ? 'Helles Design' : 'Dunkles Design')}
    </button>
  );
}

/** Opens the settings page; `highlight` marks it while the settings are open. */
function SettingsButton({ highlight = false, label = false, className = '' }: { highlight?: boolean; label?: boolean; className?: string }) {
  const setView = useStore((s) => s.setView);
  return (
    <button className={`btn ${label ? '' : 'btn-icon'} ${highlight ? 'primary' : ''} ${className}`} onClick={() => setView('settings')} aria-label={label ? undefined : 'Einstellungen'} aria-current={highlight ? 'page' : undefined}>
      <SettingsIcon size={18} />
      {label && 'Einstellungen'}
    </button>
  );
}

type NavVariant = 'side' | 'rail' | 'bottom' | 'dock' | 'dock-small';

/** Navigation entry of the sidebar (lg), the icon rail (md), the phone bar and the portrait dock. */
function NavButton({ item, active, onClick, variant, label }: { item: Pick<NavItem, 'label' | 'icon'> | { label: string; icon: LucideIcon }; active: boolean; onClick: () => void; variant: NavVariant; label?: string }) {
  const Icon = item.icon;
  const layout = {
    side: 'gap-3 px-4 py-3 rounded-2xl text-[0.95rem] font-medium',
    rail: 'flex-col gap-1 py-2.5 rounded-2xl text-[0.68rem] font-medium w-full',
    bottom: 'flex-col justify-center gap-0.5 min-h-[3.25rem] rounded-2xl text-[0.68rem] font-medium flex-1 min-w-0',
    dock: 'flex-col justify-center gap-1 min-h-[4rem] px-1 rounded-2xl text-[0.72rem] font-semibold min-w-0',
    'dock-small': 'justify-center min-h-[3rem] rounded-2xl flex-1 min-w-0',
  }[variant];
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center transition-colors ${layout} ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}
      aria-current={active ? 'page' : undefined}
      aria-label={label ?? (variant === 'dock-small' ? item.label : undefined)}
      title={label ?? (variant === 'dock-small' ? item.label : undefined)}
    >
      {/* the highlight pill slides between entries (shared layout animation per variant) */}
      {active && (
        <motion.span
          layoutId={`nav-pill-${variant}`}
          className="absolute inset-0 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, rgba(124,92,255,.35), rgba(34,211,238,.2))', border: '1px solid rgba(124,92,255,.45)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
      <Icon size={variant === 'side' ? 20 : 22} className="relative z-10 shrink-0" />
      {variant !== 'dock-small' && <span className="relative z-10 truncate max-w-full">{item.label}</span>}
    </button>
  );
}

/**
 * Name and position of the current page plus one dot per page (tap = open the page). Always visible,
 * independent of the pinned/hidden navigation and the scrolling page; `stacked`: label above the dots (top row of the dock shell).
 */
export function PagePosition({ nav, view, stacked = false }: { nav: NavItem[]; view: View; stacked?: boolean }) {
  const setView = useStore((s) => s.setView);
  const { label, ordinal, total } = pagePosition(nav, view);
  return (
    <nav aria-label="Seitenposition" className={`page-position ${stacked ? 'stacked' : ''}`}>
      <span aria-live="polite" aria-atomic="true">
        <strong>{label}</strong> <span className="text-muted">{ordinal === null ? '· außerhalb der Wischfolge' : `· ${ordinal} / ${total}`}</span>
      </span>
      <ol className="flex items-center">
        {nav.map((page, index) => (
          <li key={page.id}>
            <button
              onClick={() => setView(page.id)}
              aria-label={`${page.label}, ${index + 1} von ${total}`}
              title={`${page.label} · ${index + 1} / ${total}`}
              aria-current={page.id === view ? 'page' : undefined}
            ><span /></button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Side menu of the `sidebar` shell. Docked (menu pinned): desktop with labels, icon rail on tablets;
 * "small" shows the icon rail on desktops too. As overlay (menu hidden, opened through the handle):
 * always the wide variant with labels. The hide button of the docked menu steps through
 * full → small → hidden (tablets: hidden directly, they show the rail anyway).
 */
export function Sidebar({ nav, view, appName, overlay = false }: { nav: NavItem[]; view: View; appName: string; overlay?: boolean }) {
  const setView = useStore((s) => s.setView);
  const setDisplay = useStore((s) => s.setDisplay);
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  const mode = useStore((s) => menuMode(s.display));
  const wide = useMedia('(min-width: 64rem)');
  const size = overlay ? 'overlay' : mode === 'small' ? 'small' : 'docked';
  // per size: overlay (wide), docked (rail on tablets, wide on desktops), small (always the rail)
  const pick = (classes: Record<typeof size, string>) => classes[size];
  const next = overlay ? 'full' : nextMenuMode(mode, wide);
  // pins the overlay as permanent sidebar again / shrinks or hides the docked sidebar
  const togglePin = () => {
    setDisplay(overlay ? { menuPinned: true } : menuModeSettings(next));
    setMenuOpen(false);
  };
  const PinIcon = overlay ? Pin : next === 'small' ? PanelLeftClose : PanelLeftDashed;
  const pinLabel = overlay ? 'Menü anheften' : next === 'small' ? 'Menü verkleinern' : 'Menü ausblenden';
  return (
    <aside
      className={pick({
        overlay: 'flex flex-col w-72 h-full p-4 gap-2 border-r border-line overflow-y-auto',
        docked: 'flex flex-col shrink-0 w-[5.5rem] lg:w-64 p-3 lg:p-4 gap-2 border-r border-line overflow-y-auto',
        small: 'flex flex-col shrink-0 w-[5.5rem] p-3 gap-2 border-r border-line overflow-y-auto',
      })}
      style={barStyle(overlay ? 90 : 40)}
    >
      <div className={`flex items-center gap-3 px-1 py-2 mb-2 ${pick({ overlay: 'px-2', docked: 'lg:px-2 justify-center lg:justify-start', small: 'justify-center' })}`}>
        <AppLogo className="w-10 h-10 rounded-2xl shrink-0" iconSize={20} />
        <div className={`${pick({ overlay: 'block', docked: 'hidden lg:block', small: 'hidden' })} min-w-0 flex-1`}>
          <div className="font-bold leading-tight truncate">{appName}</div>
          <Clock className="text-sm text-muted" />
        </div>
        {overlay && (
          <button className="btn btn-icon" onClick={() => setMenuOpen(false)} aria-label="Menü schließen">
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="flex flex-col gap-1">
        {/* docked: both variants are rendered and CSS breakpoints decide which one is visible */}
        {nav.map((n) =>
          size === 'docked' ? (
            <span key={n.id} className="contents">
              <span className="lg:hidden"><NavButton item={n} active={view === n.id} onClick={() => setView(n.id)} variant="rail" /></span>
              <span className="hidden lg:block"><NavButton item={n} active={view === n.id} onClick={() => setView(n.id)} variant="side" /></span>
            </span>
          ) : (
            <NavButton key={n.id} item={n} active={view === n.id} onClick={() => setView(n.id)} variant={overlay ? 'side' : 'rail'} />
          ),
        )}
      </nav>
      <div className={`mt-auto flex flex-col gap-3 ${pick({ overlay: 'items-stretch', docked: 'items-center lg:items-stretch', small: 'items-center' })}`}>
        <div className={`${pick({ overlay: 'block', docked: 'hidden lg:block', small: 'hidden' })} px-2`}><ConnectionStatus /></div>
        <div className={`flex gap-2 ${pick({ overlay: 'flex-row', docked: 'lg:flex-row flex-col', small: 'flex-col' })}`}>
          <NotificationBell />
          <ThemeButton />
          <SettingsButton highlight={view === 'settings'} />
          <button className="btn btn-icon" onClick={togglePin} aria-label={pinLabel} title={pinLabel}>
            <PinIcon size={18} />
          </button>
        </div>
        <VersionLink className={`${pick({ overlay: 'inline-flex', docked: 'hidden lg:inline-flex', small: 'hidden' })} px-2`} />
      </div>
    </aside>
  );
}

/**
 * `sidebar` shell with the menu hidden: a small rail in the top left corner with the menu handle and the
 * bell, so every page stays reachable – also in kiosk mode (index.css `.menu-gutter` keeps it off the content).
 */
export function MenuHandle() {
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  return (
    <div className="fixed left-3 top-3 z-30 flex flex-col gap-2">
      <button className="btn btn-icon shadow-lg" onClick={() => setMenuOpen(true)} aria-label="Menü öffnen" title="Menü öffnen">
        <Menu size={20} />
      </button>
      <NotificationBell />
    </div>
  );
}

/** Closes the menu overlay / launcher with Escape while it is open. */
function useEscapeToClose(open: boolean) {
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}

/** `sidebar` shell: the hidden menu, slid in over the page; a tap next to it or Escape closes it. */
export function MenuOverlay({ nav, view, appName }: { nav: NavItem[]; view: View; appName: string }) {
  const open = useStore((s) => s.menuOpen);
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  useEscapeToClose(open);
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="menu-overlay" className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} />
          <motion.div className="absolute left-0 top-0 bottom-0 shadow-2xl" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
            <Sidebar nav={nav} view={view} appName={appName} overlay />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** `bar` shell: compact header for phones. */
export function MobileHeader({ appName }: { appName: string }) {
  return (
    <header className="flex items-center gap-2 px-4 pt-3 pb-2 safe-t">
      <AppLogo className="w-9 h-9 rounded-xl shrink-0" iconSize={18} />
      <div className="flex-1 min-w-0 ml-1">
        <div className="font-bold leading-tight truncate">{appName}</div>
        <div className="flex items-center gap-2"><Clock className="text-xs text-muted" /><ConnectionDots /></div>
      </div>
      <NotificationBell />
      <ThemeButton />
      <SettingsButton />
    </header>
  );
}

/** Pages shown directly in the phone bar; the others are reached through "Mehr" (launcher). */
const BAR_PAGES = 4;

/**
 * `bar` shell: bottom navigation bar for phones with the first pages and "Mehr", which opens the launcher with
 * all pages (and shows the current page while it is one of the others). While the menu is hidden the bar is
 * gone and a round button in the bottom right corner opens the launcher.
 */
export function BottomNav({ nav, view }: { nav: NavItem[]; view: View }) {
  const setView = useStore((s) => s.setView);
  const pinned = useStore((s) => s.display.menuPinned);
  const small = useStore((s) => s.display.menuCompact);
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  if (!pinned) {
    return (
      <button className="btn btn-icon !w-14 !h-14 !rounded-full shadow-xl fixed right-4 bottom-4 z-30 mb-[env(safe-area-inset-bottom)]" onClick={() => setMenuOpen(true)} aria-label="Menü öffnen">
        <Menu size={22} />
      </button>
    );
  }
  const direct = nav.length <= BAR_PAGES + 1 ? nav : nav.slice(0, BAR_PAGES);
  const rest = nav.slice(direct.length);
  const current = rest.find((n) => n.id === view);
  const more = rest.length ? current ?? { label: 'Mehr', icon: Ellipsis } : null;
  const variant = small ? 'dock-small' : 'bottom';
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 flex gap-1 px-2 pt-1 safe-b border-t border-line" style={barStyle(82)} aria-label="Seiten">
      {direct.map((n) => <NavButton key={n.id} item={n} active={view === n.id} onClick={() => setView(n.id)} variant={variant} />)}
      {more && <NavButton item={more} active={Boolean(current)} onClick={() => setMenuOpen(true)} variant={variant} label={current ? `${current.label} – alle Seiten` : 'Alle Seiten'} />}
    </nav>
  );
}

/**
 * `dock` shell: top row with the menu button (opens the launcher), the page position and the quick actions –
 * the same arrangement whether the dock is pinned or hidden.
 */
export function TopBar({ nav, view }: { nav: NavItem[]; view: View }) {
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  return (
    <header className="top-bar">
      <div className="flex items-center gap-2">
        <button className="btn btn-icon" onClick={() => setMenuOpen(true)} aria-label="Menü öffnen" title="Menü öffnen">
          <Menu size={20} />
        </button>
      </div>
      <PagePosition nav={nav} view={view} stacked />
      <div className="flex items-center justify-end gap-2">
        <NotificationBell />
        <ThemeButton />
        <SettingsButton highlight={view === 'settings'} />
      </div>
    </header>
  );
}

/** `dock` shell with the menu pinned: all pages along the bottom edge (labels in "full", icons only in "small"). */
export function Dock({ nav, view }: { nav: NavItem[]; view: View }) {
  const setView = useStore((s) => s.setView);
  const small = useStore((s) => s.display.menuCompact);
  const variant = small ? 'dock-small' : 'dock';
  return (
    <nav className="dock" style={{ ...barStyle(55), gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }} aria-label="Seiten">
      {nav.map((n) => <NavButton key={n.id} item={n} active={view === n.id} onClick={() => setView(n.id)} variant={variant} />)}
    </nav>
  );
}

const MENU_MODES: { mode: MenuMode; label: string }[] = [
  { mode: 'full', label: 'Mit Namen' },
  { mode: 'small', label: 'Nur Symbole' },
  { mode: 'hidden', label: 'Ausgeblendet' },
];

/**
 * `dock` shell: the menu as a sheet from the bottom edge – large page tiles, quick actions, the size of the dock
 * and the connection state. A tap next to it, Escape or swiping it down closes it.
 */
export function Launcher({ nav, view, appName }: { nav: NavItem[]; view: View; appName: string }) {
  const open = useStore((s) => s.menuOpen);
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  const setView = useStore((s) => s.setView);
  const setDisplay = useStore((s) => s.setDisplay);
  const mode = useStore((s) => menuMode(s.display));
  const reduced = useStore((s) => s.display.effects === 'low');
  const sheetRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(open);
  useEffect(() => {
    if (open) sheetRef.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => setMenuOpen(false);
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="launcher" className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={close} />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menü"
            tabIndex={-1}
            className="launcher"
            style={barStyle(88)}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 360, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => (info.offset.y > 90 || info.velocity.y > 600) && close()}
          >
            <div className="launcher-grip" aria-hidden />
            <div className="flex items-center gap-3">
              <AppLogo className="w-12 h-12 rounded-2xl shrink-0" iconSize={24} />
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold leading-tight truncate">{appName}</div>
                <Clock className="text-sm text-muted" />
              </div>
              <button className="btn btn-icon" onClick={close} aria-label="Menü schließen">
                <X size={20} />
              </button>
            </div>

            <nav aria-label="Seiten" className="launcher-grid" style={{ gridTemplateColumns: `repeat(var(--cols), minmax(0, 1fr))`, "--cols": launcherColumns(nav.length) } as CSSProperties}>
              {nav.map((n) => {
                const Icon = n.icon;
                const active = view === n.id;
                return (
                  <button key={n.id} className={`launcher-tile tone-${PAGE_TONES[n.id]} ${active ? 'active' : ''}`} onClick={() => setView(n.id)} aria-current={active ? 'page' : undefined}>
                    <span className={`icon-bubble ${active ? 'on' : ''}`}><Icon size={24} /></span>
                    <span className="line-clamp-2 max-w-full text-center leading-tight [overflow-wrap:anywhere] [hyphens:auto]" lang="de">{n.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="grid grid-cols-2 gap-3">
              <SettingsButton label highlight={view === 'settings'} className="min-h-14" />
              <ThemeButton label className="min-h-14" />
            </div>

            <div className="flex flex-col gap-2">
              <span className="section-title">Menüleiste unten</span>
              <div className="segmented" role="radiogroup" aria-label="Menüleiste unten">
                {MENU_MODES.map((m) => (
                  <button key={m.mode} role="radio" aria-checked={mode === m.mode} onClick={() => setDisplay(menuModeSettings(m.mode))}>{m.label}</button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
              <ConnectionStatus className="flex flex-wrap gap-x-4 gap-y-1.5" />
              <VersionLink />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
