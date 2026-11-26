/** Pages of the navigation: entries, accent colours and which optional pages are available. */
import { Camera, CloudSun, Flame, LayoutDashboard, LayoutGrid, Lightbulb, Music, Printer3d, Puzzle, Radar, Zap, type LucideIcon } from 'lucide-react';
import type { View } from '../../lib/store';
import { enabledPages } from '../../lib/navigation';
import { radarAgentIds } from '../../lib/radar';
import { LawnMower, ICONS } from '../../lib/icons';
import { extensionPages, type ExtensionManifest } from '../../lib/extensions';
import type { AppConfig, StateEntry, Status } from '../../lib/types';

const NAV_ICONS = { home: LayoutDashboard, weather: CloudSun, rooms: LayoutGrid, lights: Lightbulb, climate: Flame, energy: Zap, cameras: Camera, spotify: Music, printer: Printer3d, mower: LawnMower, radar: Radar };
/** Accent colour of each page (frame of the page, launcher tiles). */
const PAGE_TONES = { home: 'violet', weather: 'cool', rooms: 'violet', lights: 'light', climate: 'heat', energy: 'energy', cameras: 'cool', spotify: 'green', printer: 'warm', mower: 'green', radar: 'green', settings: 'violet' } as const;
/** Accent colour of a page; the pages of external modules use violet. */
export const pageTone = (view: string): string => (PAGE_TONES as Record<string, string>)[view] ?? 'violet';

/** Entry of the navigation. */
export interface NavItem {
  id: View;
  label: string;
  icon: LucideIcon;
}

/**
 * Navigation entries; the settings page is reached through its own button. The weather page can be switched off;
 * Spotify and the printer page only exist while they are set up (or their demo runs), the radar page once a wall
 * display reported its presence radar, the mower page once a robotic mower is configured. Enabled external modules
 * with an own page follow the built-in pages.
 */
export const navItems = (config: AppConfig | null, printer: boolean, spotify: boolean, radar: boolean, extensions: readonly ExtensionManifest[] = []): NavItem[] => [
  ...enabledPages(config?.weather?.enabled !== false, printer, spotify, radar, hasMower(config)).map((page) => ({ ...page, icon: NAV_ICONS[page.id] })),
  ...extensionPages(extensions, config?.extensions).map((page) => ({ ...page, icon: ICONS[page.icon] ?? Puzzle })),
];

/** True while a robotic mower is configured (its page belongs to the navigation). */
const hasMower = (config: AppConfig | null) => Boolean(config?.devices.some((d) => d.type === 'mower'));

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
