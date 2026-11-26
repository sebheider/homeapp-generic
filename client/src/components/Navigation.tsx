/**
 * Navigation of the app shell, one shell per screen (lib/display.ts `navShell`):
 * - `bar` (phones): compact header and a bottom bar that slides away while the menu is hidden.
 * - `dock` (tablets and wall displays in portrait format, e.g. 10" with 1200×1920): a top row with the
 *   menu button, page position and quick actions, a dock with all pages at the bottom while the menu is
 *   pinned and a launcher sheet with large tiles, quick actions and the menu size.
 * - `sidebar` (landscape tablets and desktops): side menu (full / small icon rail / hidden with handle and overlay).
 * The shells and their building blocks live in components/navigation/; this module re-exports them.
 */
export { pageTone, navItems, hasPrinter, hasSpotify, hasRadar } from './navigation/pages';
export type { NavItem } from './navigation/pages';
export { PagePosition } from './navigation/parts';
export { Sidebar, MenuHandle, MenuOverlay } from './navigation/Sidebar';
export { MobileHeader, BottomNav } from './navigation/PhoneBar';
export { TopBar, Dock, Launcher } from './navigation/Dock';
