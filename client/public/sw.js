/*
 * HomeApp service worker.
 *
 * Makes the app installable and lets it start quickly:
 *   - built files under /assets/ have content hashes in their names -> cache first, kept forever
 *   - pages (navigation) -> network first, the cached start page is only used when the server
 *     is unreachable (the app then shows its own "Server nicht erreichbar" screen)
 *   - API calls, the WebSocket and camera pictures are never cached
 */
const CACHE = 'homeapp-v1';

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', (event) => {
  // drop caches of older service worker versions
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        await caches.open(CACHE).then((cache) => cache.put(req, res.clone())).catch(() => undefined);
      }
      return res;
    })());
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // only successful pages are kept (not the 401 of the access protection)
        if (res.ok) {
          await caches.open(CACHE).then((cache) => cache.put('/', res.clone())).catch(() => undefined);
        }
        return res;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
  }
});
