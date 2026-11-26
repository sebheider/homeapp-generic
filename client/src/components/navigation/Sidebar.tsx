/** `sidebar` shell (landscape screens): the side menu, its handle while hidden and the menu overlay. */
import { AnimatePresence, motion } from 'motion/react';
import { Menu, PanelLeftClose, PanelLeftDashed, Pin, X } from 'lucide-react';
import { useStore, type View } from '../../lib/store';
import { menuMode, menuModeSettings, nextMenuMode } from '../../lib/display';
import { useMedia } from '../../lib/hooks';
import { NotificationBell } from '../Notifications';
import { VersionLink } from '../Changelog';
import type { NavItem } from './pages';
import { barStyle, Clock, AppLogo, ConnectionStatus, ThemeButton, SettingsButton, NavButton, useEscapeToClose } from './parts';

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
 * bell, so every page stays reachable – also in kiosk mode (styles/navigation.css `.menu-gutter` keeps it off the content).
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
