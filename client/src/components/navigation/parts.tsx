/** Building blocks of the navigation shells: logo, clock, connection state, theme / settings buttons, page buttons and the page position. */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LayoutDashboard, Moon, Settings as SettingsIcon, Sun, type LucideIcon } from 'lucide-react';
import { useStore, type View } from '../../lib/store';
import { useNow } from '../../lib/hooks';
import { clockTime } from '../../lib/format';
import { pagePosition } from '../../lib/navigation';
import type { NavItem } from './pages';

/** Background of the app logo. */
const BRAND_GRADIENT = 'linear-gradient(135deg,#7c5cff,#22d3ee)';
/** Background of docked menus and sheets. */
export const barStyle = (opacity: number) => ({ background: `color-mix(in srgb, var(--bg) ${opacity}%, transparent)`, backdropFilter: 'blur(20px)' });

/** Current time "HH:MM", refreshed every 15 seconds. */
export function Clock({ className = '' }: { className?: string }) {
  const now = useNow(15000);
  return <span className={`tabular-nums ${className}`}>{clockTime(now)}</span>;
}

/** Square app logo with the brand gradient. */
export function AppLogo({ className, iconSize }: { className: string; iconSize: number }) {
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
export function ConnectionStatus({ className = 'flex flex-col gap-1.5' }: { className?: string }) {
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
export function ConnectionDots() {
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
export function ThemeButton({ className = '', label = false }: { className?: string; label?: boolean }) {
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
export function SettingsButton({ highlight = false, label = false, className = '' }: { highlight?: boolean; label?: boolean; className?: string }) {
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
export function NavButton({ item, active, onClick, variant, label }: { item: Pick<NavItem, 'label' | 'icon'> | { label: string; icon: LucideIcon }; active: boolean; onClick: () => void; variant: NavVariant; label?: string }) {
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

/** Closes the menu overlay / launcher with Escape while it is open. */
export function useEscapeToClose(open: boolean) {
  const setMenuOpen = useStore((s) => s.setMenuOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}
