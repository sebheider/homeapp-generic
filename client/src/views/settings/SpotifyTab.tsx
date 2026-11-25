/** Settings tab "Spotify": app registration, login, the device (amplifier) and the mini player of the overview. */
import { useEffect, useState } from 'react';
import { ExternalLink, Link2, LogOut, RotateCw } from 'lucide-react';
import { api, spotifyLoginUrl, spotifyRedirectUri } from '../../lib/api';
import { useStore } from '../../lib/store';
import type { SpotifyDevice } from '../../lib/types';
import { Toggle } from '../../components/ui';
import { Card, CopyUrl, Field, NumInput, Switch, dimUnless, sectionSetter, type TabProps } from './shared';

export function SpotifyTab({ draft, setDraft }: TabProps) {
  const sp = draft.spotify;
  const set = sectionSetter(draft, setDraft, 'spotify');
  const saved = useStore((s) => s.config?.spotify);
  const status = useStore((s) => s.status?.spotify);
  const toast = useStore((s) => s.toast);
  const [devices, setDevices] = useState<SpotifyDevice[] | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const live = Boolean(status?.enabled && status.connected);
  // the live configuration knows about a login / logout right away, the draft only after reloading
  const connected = saved?.connected ?? sp.connected;
  const account = saved?.account ?? sp.account;
  const loadDevices = () => {
    setDevicesError(null);
    api.spotifyDevices().then(setDevices).catch((e: Error) => setDevicesError(e.message));
  };
  useEffect(() => {
    if (live) loadDevices();
  }, [live]);

  // the login uses the saved client id: unsaved changes would be lost by the redirect
  const unsaved = (saved?.clientId ?? '') !== sp.clientId || saved?.enabled !== sp.enabled;
  const canConnect = sp.enabled && Boolean(sp.clientId) && !unsaved;
  const logout = async () => {
    try {
      await api.spotifyLogout();
      toast('Spotify-Konto getrennt', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      <Card title="Spotify-Konto" right={<Toggle checked={sp.enabled} onChange={(v) => set({ enabled: v })} label="Spotify" />}>
        {connected ? (
          <p className={`text-sm mb-3 ${status?.error ? 'text-rose-400' : 'text-emerald-400'}`}>
            {status?.error ?? `✓ Verbunden${account ? ` als ${account}` : ''}`}
          </p>
        ) : (
          sp.enabled && <p className="text-sm text-muted mb-3">Noch nicht verbunden.</p>
        )}
        {status?.demo && <p className="text-sm text-muted mb-3">Im Demo-Modus spielt ein simulierter Player, solange kein Spotify-Konto verbunden ist.</p>}
        <div className={dimUnless(sp.enabled)}>
          <ol className="text-sm text-muted list-decimal pl-5 space-y-1.5 mb-4">
            <li>
              Im <a className="underline hover:text-fg inline-flex items-center gap-1" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify-Developer-Dashboard <ExternalLink size={12} /></a> eine App anlegen (API: <b>Web API</b>) und als Redirect-URI genau diese Adresse eintragen:
              <CopyUrl label="" url={spotifyRedirectUri()} />
              Spotify verlangt HTTPS (wie HomeApp es standardmäßig nutzt). Verbinde dich über dieselbe Adresse, unter der du die App jetzt geöffnet hast.
              {location.protocol === 'http:' && !/^(127\.0\.0\.1|\[::1\])$/.test(location.hostname) && (
                <span className="block mt-1 text-amber-400">Diese Adresse nutzt HTTP – Spotify lehnt sie ab. Öffne HomeApp über https:// (oder lokal über http://127.0.0.1) und verbinde dich dort.</span>
              )}
            </li>
            <li>Die <b>Client-ID</b> der App unten eintragen und speichern. Ein Client-Secret ist nicht nötig.</li>
            <li>„Mit Spotify verbinden“ wählen und den Zugriff erlauben. Gehört das Konto nicht dem Besitzer der App, trage es im Dashboard unter <i>User Management</i> ein.</li>
          </ol>
          <p className="text-xs text-muted mb-4">Seit Februar 2026 braucht der Besitzer der App Spotify Premium; zum Steuern der Wiedergabe ist Premium ebenfalls nötig.</p>
          <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
            <Field label="Client-ID">
              <input className="field font-mono" autoComplete="off" spellCheck={false} value={sp.clientId} placeholder="z. B. 1a2b3c4d5e6f…" onChange={(e) => set({ clientId: e.target.value.trim() })} />
            </Field>
            <div className="flex gap-2">
              <button
                className="btn primary"
                disabled={!canConnect}
                title={canConnect ? undefined : unsaved ? 'Erst speichern' : 'Erst die Client-ID eintragen'}
                onClick={() => {
                  window.location.href = spotifyLoginUrl();
                }}
              >
                <Link2 size={15} /> {connected ? 'Neu verbinden' : 'Mit Spotify verbinden'}
              </button>
              {connected && <button className="btn" onClick={logout}><LogOut size={15} /> Trennen</button>}
            </div>
          </div>
          {unsaved && sp.enabled && sp.clientId && <p className="text-xs text-muted mt-2">Speichere zuerst, dann kannst du dich verbinden.</p>}
          <p className="text-xs text-muted mt-2">Eine andere Client-ID trennt das verbundene Konto.</p>
        </div>
      </Card>

      <Card title="Gerät & Übersicht">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Gerät (z. B. dein Verstärker)" hint="Darauf startet die Wiedergabe, wenn gerade nichts läuft. Spotify zeigt Geräte, die eingeschaltet und mit dem Konto verbunden sind.">
            <div className="flex gap-2">
              <input className="field" list="spotify-devices" value={sp.device} placeholder="z. B. AV-Receiver Wohnzimmer" onChange={(e) => set({ device: e.target.value })} />
              <button className="btn btn-icon" onClick={loadDevices} disabled={!live} aria-label="Geräte suchen" title="Geräte suchen"><RotateCw size={15} /></button>
            </div>
            <datalist id="spotify-devices">
              {(devices ?? []).map((d) => <option key={d.id} value={d.name} />)}
            </datalist>
            {devices && devices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {devices.map((d) => (
                  <button key={d.id} className={`chip !text-xs ${d.name === sp.device ? 'on' : ''}`} onClick={() => set({ device: d.name })}>{d.name}{d.active ? ' · aktiv' : ''}</button>
                ))}
              </div>
            )}
            {devicesError && <p className="text-xs text-rose-400 mt-1">{devicesError}</p>}
          </Field>
          <Field label="Abfrage-Intervall (Sekunden)" hint="Wie oft der Wiedergabestatus gelesen wird (2–30).">
            <NumInput value={sp.pollSeconds} onChange={(v) => set({ pollSeconds: v ?? 3 })} />
          </Field>
        </div>
        <div className="mt-3">
          <Switch label="Mini-Player auf den Übersichten anzeigen, solange Musik läuft" checked={sp.dashboard} onChange={(v) => set({ dashboard: v })} />
          <div className={dimUnless(sp.dashboard)}>
            <Switch label="Nur anzeigen, wenn auf dem gewählten Gerät gespielt wird" checked={sp.onlyDevice} onChange={(v) => set({ onlyDevice: v })} />
            <Field label="Nach dem Pausieren noch anzeigen (Minuten)" hint="So lässt sich die Musik von der Übersicht aus fortsetzen; 0 = sofort ausblenden." className="max-w-md mt-2">
              <NumInput value={sp.pauseMinutes} onChange={(v) => set({ pauseMinutes: v ?? 5 })} />
            </Field>
          </div>
        </div>
      </Card>
    </>
  );
}
