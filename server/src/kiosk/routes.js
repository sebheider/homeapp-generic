/**
 * HTTP endpoints of the kiosk agents (authenticated with the kiosk token, not with the app login).
 */
import { safeEqual } from '../auth.js';
import { MAX_STREAMS } from './hub.js';
import { sanitizeKiosk } from './settings.js';

/**
 * Registers the agent routes (before the Basic Auth middleware: the agent authenticates with the
 * kiosk token as `?token=` or `Authorization: Bearer`):
 *   POST /api/kiosk/report  readings in, agent settings, the latest wake and `radar` (live radar wanted) out
 *   GET  /api/kiosk/events  server-sent events: `data: {id, reason, severity, title, ageMs}` per wake,
 *                           `data: {"type":"radar"}` when the radar page is opened
 *   POST /api/kiosk/radar   live radar frame `{id, radar}` in, `{ok, live}` out (live = keep sending)
 * @param {import('express').Express} app
 * @param {{hub: KioskHub, getToken: () => string, getSettings: () => object, pingMs?: number}} deps
 */
export function registerKioskReport(app, { hub, getToken, getSettings, pingMs = 25000 }) {
  const allowed = (req) => {
    const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1];
    const token = String(req.query.token || bearer || '');
    return Boolean(token) && safeEqual(token, getToken());
  };
  app.post('/api/kiosk/report', (req, res) => {
    if (!allowed(req)) return res.status(403).json({ error: 'token' });
    try {
      const id = hub.report(req.body, req.ip);
      res.json({ ok: true, id, settings: sanitizeKiosk(getSettings()), wake: hub.recentWake(), radar: hub.radarWatched });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post('/api/kiosk/radar', (req, res) => {
    if (!allowed(req)) return res.status(403).json({ error: 'token' });
    const ok = hub.radar(req.body?.id, req.body?.radar);
    res.json({ ok, live: ok && hub.radarWatched });
  });
  let streams = 0;
  app.get('/api/kiosk/events', (req, res) => {
    if (!allowed(req)) return res.status(403).json({ error: 'token' });
    if (streams >= MAX_STREAMS) return res.status(503).json({ error: 'Zu viele Verbindungen' });
    streams += 1;
    // X-Accel-Buffering: nginx must pass every event right away
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 5000\n\n');
    const send = (w) => res.write(`data: ${JSON.stringify({ ...w, ageMs: 0 })}\n\n`);
    // without an `id` older agents ignore it (they only know wakes)
    const askRadar = (on) => on && res.write(`data: ${JSON.stringify({ type: 'radar' })}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), pingMs); // keeps proxies and the agent's read timeout happy
    hub.on('wake', send);
    hub.on('radarWatch', askRadar);
    askRadar(hub.radarWatched);
    req.on('close', () => {
      streams -= 1;
      clearInterval(ping);
      hub.off('wake', send);
      hub.off('radarWatch', askRadar);
    });
  });
}
