/** `bar` shell (phones): compact header and the bottom navigation bar. */
import { Ellipsis, Menu } from 'lucide-react';
import { useStore, type View } from '../../lib/store';
import { NotificationBell } from '../Notifications';
import type { NavItem } from './pages';
import { barStyle, Clock, AppLogo, ConnectionDots, ThemeButton, SettingsButton, NavButton } from './parts';

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
