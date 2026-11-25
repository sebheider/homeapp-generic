/**
 * Progressive Web App support: registers the service worker and keeps the browser's install
 * prompt (Android / Chrome / Edge) so the settings can offer an "App installieren" button.
 * Open pages switch to a newly deployed version by themselves (important for kiosk displays).
 *
 * Installing as a real app (own window without browser bars) needs a secure context: HTTPS, or
 * `localhost`. Over plain http in the home network Chrome only offers a home-screen shortcut.
 */
import { useEffect, useState } from 'react';

/** The non-standard event Chrome fires when the app can be installed. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const RELOAD_KEY = 'reloadAt';

/**
 * Loads the page again if the server delivers a newer build than the one running (e.g. after an
 * automatic update of the container). Called when the connection to the server comes back, so
 * permanently open displays (kiosk) update themselves.
 */
export async function reloadIfUpdated() {
  const current = document.querySelector('script[type="module"][src]')?.getAttribute('src');
  if (!current) return;
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    if (!html.includes(current)) location.reload();
  } catch {
    /* server not reachable (yet): the next reconnect checks again */
  }
}

/** True while the app runs installed (standalone window instead of a browser tab). */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Call once at start-up: service worker + install prompt handling. */
export function initPwa() {
  // a page that is open while a new version is deployed asks for code chunks that no longer exist:
  // load the page again (at most every 10 s, so a real error cannot cause a reload loop)
  window.addEventListener('vite:preloadError', (e) => {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 10000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    e.preventDefault();
    location.reload();
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    // keep the event for our own button instead of the browser's mini info bar
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  if (import.meta.env.PROD) {
    // fallback in case a short server restart was not noticed as a reconnect
    setInterval(() => document.visibilityState === 'visible' && void reloadIfUpdated(), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reloadIfUpdated());
  }
  // only in the production build: the dev server must not be cached
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
  }
}

/** Whether the browser currently offers installation, and a function that shows its dialog. */
export function useInstallPrompt() {
  const [available, setAvailable] = useState(Boolean(deferred));
  useEffect(() => {
    const update = () => setAvailable(Boolean(deferred));
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === 'accepted';
  };
  return { available, install };
}
