/** `dock` shell (portrait tablets, wall displays): top row, pinned dock and the launcher sheet. */
import { useEffect, useRef, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { useStore, type View } from '../../lib/store';
import { launcherColumns, menuMode, menuModeSettings, type MenuMode } from '../../lib/display';
import { NotificationBell } from '../Notifications';
import { VersionLink } from '../Changelog';
import { pageTone, type NavItem } from './pages';
import { barStyle, Clock, AppLogo, ConnectionStatus, ThemeButton, SettingsButton, NavButton, PagePosition, useEscapeToClose } from './parts';

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
                  <button key={n.id} className={`launcher-tile tone-${pageTone(n.id)} ${active ? 'active' : ''}`} onClick={() => setView(n.id)} aria-current={active ? 'page' : undefined}>
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
