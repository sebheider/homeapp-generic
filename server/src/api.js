import { MjpegHub } from './mjpeg.js';
import { isKioskId } from './kiosk.js';
import { previewWaste } from './waste.js';
import { appLink, sanitizePushover } from './pushover.js';

/**
 * Authenticated HTTP endpoints. The server bootstrap owns the integrations and
 * passes them here so routes can be tested and maintained independently.
 */
export function registerApiRoutes(app, {
  store,
  getSource,
  demo,
  history,
  weather,
  validCoords,
  demoForecast,
  discover,
  controlIds,
  buildFixScript,
  cameraList,
  alerts,
  motion,
  printer,
  spotify,
  surveillance,
  kindPopupAllowed,
  statusPayload,
  broadcast,
  demoCoverSvg,
  streams = new MjpegHub(),
  kiosk = null,
  waste = null,
  ventilation = null,
  allAlerts = () => alerts.list(),
  pushover = null,
  extensionManifests = () => [],
}) {
  for (const id of ['weather', 'printer', 'spotify']) {
    app.use(`/api/${id}`, (_req, res, next) => {
      if (store.effective?.modules?.[id] === false) return res.status(404).json({ error: `Modul ${id} ist deaktiviert` });
      next();
    });
  }
  const stateSnapshot = () => ({ ...Object.fromEntries(getSource().states), ...(kiosk ? Object.fromEntries(kiosk.states) : {}) });
  /** Configured ids and the local kiosk datapoints. */
  const knownId = (id) => store.stateIds().has(id) || Boolean(kiosk?.states.has(id));

  app.get('/api/bootstrap', (_req, res) => {
    res.json({
      config: store.publicConfig(),
      states: stateSnapshot(),
      status: statusPayload(),
      cameras: cameraList(),
      recentMotion: motion.recent,
      alerts: allAlerts(),
      printer: printer.data,
      spotify: spotify.current(),
      waste: waste?.data() ?? null,
      ventilation: ventilation?.data() ?? null,
      extensions: extensionManifests(),
    });
  });

  app.get('/api/alerts', (_req, res) => res.json(allAlerts()));
  app.post('/api/alerts/ack', (_req, res) => res.json({ ok: true, acknowledged: alerts.ackAll() }));
  app.post('/api/alerts/:id/ack', (req, res) => {
    if (!alerts.ack(req.params.id)) return res.status(404).json({ error: 'Keine offene Benachrichtigung mit dieser ID' });
    res.json({ ok: true });
  });

  app.get('/api/cameras', (_req, res) => res.json(cameraList()));

  app.post('/api/state', async (req, res) => {
    const { id, value } = req.body || {};
    if (typeof id !== 'string' || !store.stateIds().has(id)) return res.status(400).json({ error: 'Unbekannter Datenpunkt' });
    if (isKioskId(id)) return res.status(400).json({ error: 'Kiosk-Sensoren können nur gelesen werden' });
    try {
      await getSource().set(id, value);
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.post('/api/scenes/:id/run', async (req, res) => {
    const scene = store.effective.scenes.find((s) => s.id === req.params.id);
    if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });
    const results = await Promise.allSettled((scene.actions || []).map((a) => getSource().set(a.state, a.value)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    res.json({ ok: failed === 0, failed });
  });

  app.get('/api/history', (req, res) => {
    const ids = String(req.query.ids || '').split(',').filter((id) => id && knownId(id));
    const hours = Math.min(48, Math.max(1, Number(req.query.hours) || 24));
    // the kiosk sensors are real even in demo mode, so their recorded history is used
    const recorded = store.isDemo ? ids.filter(isKioskId) : ids;
    const simulated = store.isDemo ? ids.filter((id) => !isKioskId(id)) : [];
    res.json({ ...Object.fromEntries(simulated.map((id) => [id, demo.history(id, hours)])), ...history.query(recorded, hours) });
  });

  app.get('/api/iobroker/search', (req, res) => {
    const max = Math.min(100, Number(req.query.limit) || 30);
    const local = kiosk ? kiosk.search(req.query.q, max) : [];
    res.json([...local, ...getSource().search(req.query.q, max - local.length)]);
  });

  app.get('/api/weather', async (_req, res) => {
    const w = store.effective.weather;
    const pos = validCoords(w?.latitude, w?.longitude);
    if (!pos) {
      if (store.isDemo) return res.json({ configured: true, ...demoForecast() });
      return res.json({ configured: false });
    }
    try {
      res.json({ configured: true, ...(await weather.forecast(pos.lat, pos.lon)) });
    } catch (err) {
      res.status(502).json({ error: `Wetterdaten nicht erreichbar: ${err.message}` });
    }
  });

  app.get('/api/weather/geocode', async (req, res) => {
    try {
      res.json(await weather.geocode(req.query.q));
    } catch (err) {
      res.status(502).json({ error: `Ortssuche nicht erreichbar: ${err.message}` });
    }
  });

  app.get('/api/weather/radar', async (_req, res) => {
    try {
      res.json(await weather.radar());
    } catch (err) {
      res.status(502).json({ error: `Regenradar nicht erreichbar: ${err.message}` });
    }
  });

  app.post('/api/discovery', async (_req, res) => {
    const source = getSource();
    if (source.kind === 'homeassistant') {
      if (!source.connected) return res.status(409).json({ error: 'Home Assistant ist nicht verbunden.' });
      return res.json(source.discover());
    }
    if (store.isDemo || !source.connected || !source.objects.size) {
      return res.status(409).json({ error: 'Die automatische Erkennung benötigt eine bestehende ioBroker-Verbindung (kein Demo-Modus).' });
    }
    try {
      res.json(await discover(source.objects, (id) => source.read(id)));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/iobroker/permissions', async (_req, res) => {
    const source = getSource();
    if (source.kind === 'homeassistant') return res.status(409).json({ error: 'Die ioBroker-Schreibrechteprüfung ist für Home Assistant nicht verfügbar.' });
    if (store.isDemo) return res.status(409).json({ error: 'Im Demo-Modus nicht verfügbar.' });
    if (!source.connected) return res.status(409).json({ error: 'ioBroker ist nicht verbunden.' });
    if (!store.effective.iobroker.user) return res.json({ anonymous: true, total: 0, blocked: [], script: '' });
    try {
      const ids = controlIds(store.effective);
      const check = await source.checkWriteAccess(ids);
      const blocked = check.items.filter((i) => i.found && !i.writable);
      res.json({
        user: check.userId,
        groups: check.groups,
        groupsAllowWrite: check.groupsAllowWrite,
        total: ids.length,
        missing: check.items.filter((i) => !i.found).map((i) => i.id),
        blocked: blocked.map(({ id, owner, ownerGroup, state }) => ({ id, owner, ownerGroup, state })),
        script: blocked.length ? buildFixScript(blocked.map((b) => b.id)) : '',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/config', (_req, res) => {
    res.json({ config: store.editableConfig(), webhookToken: store.raw.webhookToken, kioskToken: store.raw.kioskToken, envDefaults: store.envInfo() });
  });

  app.get('/api/kiosk', (_req, res) => res.json({ agents: kiosk ? kiosk.list() : [] }));

  app.get('/api/waste', (_req, res) => res.json({ ...(waste?.data() ?? { enabled: false, upcoming: [] }), kinds: waste?.kinds() ?? [] }));
  app.post('/api/waste/refresh', async (_req, res) => {
    if (!waste?.cfg.url) return res.status(409).json({ error: 'Keine Kalender-Adresse gespeichert' });
    await waste.refresh();
    res.json({ ...waste.data(), kinds: waste.kinds() });
  });
  // checks a calendar address before it is saved
  app.post('/api/waste/preview', async (req, res) => {
    try {
      res.json(await previewWaste(req.body?.url));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/ventilation', (_req, res) => res.json(ventilation?.data() ?? { enabled: false, outdoor: null, rooms: [] }));

  app.get('/api/pushover', (_req, res) => res.json(pushover?.status() ?? { active: false, demo: false, lastSent: null, lastError: null }));
  // test message with the values of the settings page; empty keys = the stored ones
  app.post('/api/pushover/test', async (req, res) => {
    if (!pushover) return res.status(404).json({ error: 'Pushover nicht verfügbar' });
    const stored = store.raw.pushover ?? {};
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const cfg = sanitizePushover({ ...body, user: body.user || stored.user, token: body.token || stored.token });
    try {
      await pushover.send({ title: 'HomeApp', message: 'Testnachricht – Pushover ist richtig eingerichtet.', url: appLink(cfg.appUrl) }, cfg);
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.put('/api/config', (req, res) => {
    try {
      store.update(req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/dashboard', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.widgets)) return res.status(400).json({ error: 'Ungültige Startseite' });
    res.json({ ok: true, dashboard: store.setDashboard(req.body) });
  });

  app.get('/api/status', (_req, res) => res.json(statusPayload()));

  app.get('/api/popup-preview', (_req, res) => {
    const cfg = store.effective;
    const now = new Date();
    const allowed = (kind, id) => kindPopupAllowed(cfg.app, kind, id, now);
    const cams = cameraList();
    res.json({
      now: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      rules: (cfg.app.popupRules || []).filter((r) => r.enabled !== false).length,
      motion: cams.length ? cams.some((c) => allowed('motion', c.id)) : allowed('motion', ''),
      people: cams.length ? cams.some((c) => allowed('people', c.id)) : allowed('people', ''),
    });
  });

  app.get('/api/cameras/:id/snapshot', async (req, res) => {
    const { id } = req.params;
    res.set('Cache-Control', 'no-store');
    try {
      if (store.isDemo) {
        const svg = demo.cameraSvg(id);
        if (!svg) return res.status(404).end();
        return res.type('image/svg+xml').send(svg);
      }
      const snap = await surveillance.snapshot(id, String(req.query.q || 'balanced'));
      res.type(snap.type).send(snap.body);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/cameras/:id/stream', async (req, res) => {
    if (store.isDemo) return res.status(404).json({ error: 'Kein Live-Stream im Demo-Modus' });
    try {
      const id = String(req.params.id);
      await streams.attach(`camera:${id}`, () => surveillance.openStream(id), req, res);
    } catch (err) {
      if (!res.headersSent) res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/printer', (_req, res) => res.json(printer.data));

  app.get('/api/printer/temps', async (_req, res) => {
    if (!printer.status().enabled) return res.status(404).json({ error: 'Kein 3D-Drucker eingerichtet' });
    try {
      res.json(await printer.temps());
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/printer/snapshot', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!printer.status().enabled) return res.status(404).json({ error: 'Kein 3D-Drucker eingerichtet' });
    try {
      const snap = await printer.snapshot();
      res.type(snap.type).send(snap.body);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.post('/api/printer/command', async (req, res) => {
    const { action, on, level } = req.body ?? {};
    if (!['pause', 'resume', 'stop', 'light', 'speed'].includes(action)) return res.status(400).json({ error: 'Unbekannter Befehl' });
    try {
      await printer.command(action, { on: Boolean(on), level: Number(level) });
      res.json(printer.data);
    } catch (err) {
      res.status(err.status ?? 409).json({ error: err.message });
    }
  });

  app.get('/api/printer/stream', async (req, res) => {
    if (!printer.status().enabled) return res.status(404).json({ error: 'Kein 3D-Drucker eingerichtet' });
    try {
      await streams.attach('printer', () => printer.openStream(), req, res);
    } catch (err) {
      if (!res.headersSent) res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/spotify', (_req, res) => res.json(spotify.current()));

  const spotifyJson = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
      res.status(err.status >= 400 && err.status < 500 ? err.status : 502).json({ error: err.message });
    }
  };
  app.post('/api/spotify/command', spotifyJson(async (req) => {
    const { action, ...params } = req.body || {};
    await spotify.command(String(action || ''), params);
    return { ok: true };
  }));
  app.get('/api/spotify/search', spotifyJson((req) => spotify.search(req.query.q)));
  app.get('/api/spotify/playlists', spotifyJson(() => spotify.playlists()));
  app.get('/api/spotify/devices', spotifyJson(() => spotify.devices()));
  app.get('/api/spotify/queue', spotifyJson(() => spotify.queue()));
  app.get('/api/spotify/recent', spotifyJson(() => spotify.recent()));

  const backToSettings = (res, params) => res.redirect(`/?${new URLSearchParams({ tab: 'spotify', ...params })}#settings`);
  app.get('/api/spotify/login', (req, res) => {
    try {
      res.redirect(spotify.startLogin(store.effective.spotify.clientId, req.query.origin));
    } catch (err) {
      backToSettings(res, { spotify: 'error', message: err.message });
    }
  });
  app.get('/api/spotify/callback', async (req, res) => {
    try {
      const login = await spotify.finishLogin(req.query);
      if (login.clientId !== store.effective.spotify.clientId) throw new Error('Die Client-ID wurde inzwischen geändert – bitte erneut verbinden.');
      store.setSpotifyAuth({ refreshToken: login.refreshToken, account: login.account });
      spotify.configure(store.effective.spotify, { demo: store.isDemo });
      broadcast({ t: 'config' });
      backToSettings(res, { spotify: 'connected' });
    } catch (err) {
      console.warn(`[Spotify] Anmeldung fehlgeschlagen: ${err.message}`);
      if (err.cause) console.warn(err.cause);
      backToSettings(res, { spotify: 'error', message: err.message });
    }
  });
  app.post('/api/spotify/logout', (_req, res) => {
    store.setSpotifyAuth({ refreshToken: '', account: '' });
    spotify.configure(store.effective.spotify, { demo: store.isDemo });
    broadcast({ t: 'config' });
    res.json({ ok: true });
  });
  app.get('/api/spotify/demo-cover/:n', (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400').type('image/svg+xml').send(demoCoverSvg(req.params.n));
  });
}
