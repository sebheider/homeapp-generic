/** Shared enabled order for menus, gestures and the position indicator. */
export const PAGES = [
  { id: 'home', label: 'Übersicht' },
  { id: 'weather', label: 'Wetter' },
  { id: 'rooms', label: 'Räume' },
  { id: 'lights', label: 'Licht' },
  { id: 'climate', label: 'Klima' },
  { id: 'energy', label: 'Energie' },
  { id: 'cameras', label: 'Kameras' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'printer', label: '3D-Drucker' },
  { id: 'mower', label: 'Mähroboter' },
  { id: 'radar', label: 'Radar' },
] as const;

/**
 * Pages of the navigation: the weather page can be switched off, Spotify and the printer page exist once they are
 * set up, the radar page once a wall display reported its presence radar, the mower page once a robotic mower is
 * configured.
 */
export const enabledPages = (weatherEnabled = true, printerEnabled = false, spotifyEnabled = false, radarEnabled = false, mowerEnabled = false) =>
  PAGES.filter((p) => (p.id !== 'weather' || weatherEnabled) && (p.id !== 'printer' || printerEnabled) && (p.id !== 'spotify' || spotifyEnabled)
    && (p.id !== 'radar' || radarEnabled) && (p.id !== 'mower' || mowerEnabled));
type Page = { id: string; label: string };

export function adjacentPage(pages: readonly Page[], view: string, direction: 1 | -1) {
  const index = pages.findIndex((p) => p.id === view);
  return index < 0 ? undefined : pages[index + direction];
}

export function navigationDirection(pages: readonly Page[], from: string, to: string): -1 | 0 | 1 {
  const a = pages.findIndex((p) => p.id === from);
  const b = pages.findIndex((p) => p.id === to);
  return a < 0 || b < 0 ? 0 : Math.sign(b - a) as -1 | 0 | 1;
}

export function pagePosition(pages: readonly Page[], view: string) {
  const index = pages.findIndex((p) => p.id === view);
  return { label: index < 0 ? (view === 'settings' ? 'Einstellungen' : PAGES.find((p) => p.id === view)?.label ?? view) : pages[index].label,
    ordinal: index < 0 ? null : index + 1, total: pages.length };
}
