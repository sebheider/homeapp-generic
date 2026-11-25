/** Settings tab "Verbindung": ioBroker connection and Synology Surveillance Station. */
import { useStore } from '../../lib/store';
import type { EnvDefault } from '../../lib/api';
import { Toggle } from '../../components/ui';
import { Card, Field, NumInput, Switch, WebhookUrls, dimUnless, sectionSetter, type TabProps } from './shared';
import { WriteAccessCard } from './WriteAccessCard';

/**
 * Note under a field that has a default from an environment variable: where the value comes from,
 * what wins, and a link to go back to the default (renders nothing for fields without such a default).
 */
function EnvNote({ field, envDefaults, resetEnv, toggleReset }: { field: string } & Pick<TabProps, 'envDefaults' | 'resetEnv' | 'toggleReset'>) {
  const d: EnvDefault | undefined = envDefaults.find((x) => x.field === field);
  if (!d) return null;
  const reset = resetEnv.includes(field);
  // secrets are never shown, not even as default
  const shown = d.secret ? '' : ` (Vorgabe: ${String(d.value)})`;
  return (
    <p className="text-[0.7rem] text-muted mt-1 flex flex-wrap items-center gap-x-2">
      {d.manual && !reset ? (
        <>
          <span>Manuell gesetzt – hat Vorrang vor <code>{d.env}</code>{shown}.</span>
          {!d.secret && <button type="button" className="underline hover:text-fg" onClick={() => toggleReset(field)}>Vorgabe wiederherstellen</button>}
        </>
      ) : reset ? (
        <>
          <span>Wird beim Speichern auf die Vorgabe aus <code>{d.env}</code>{shown} zurückgesetzt.</span>
          <button type="button" className="underline hover:text-fg" onClick={() => toggleReset(field)}>Abbrechen</button>
        </>
      ) : (
        <span>Vorgabe aus Umgebungsvariable <code>{d.env}</code> – was du hier speicherst, hat Vorrang.</span>
      )}
    </p>
  );
}

/** Connection settings of ioBroker and the Surveillance Station incl. webhook URLs. */
export function ConnectionTab({ draft, setDraft, webhookToken, envDefaults, resetEnv, toggleReset }: TabProps) {
  const status = useStore((s) => s.status);
  const io = draft.iobroker;
  const ss = draft.surveillance;
  const setIo = sectionSetter(draft, setDraft, 'iobroker');
  const ha = draft.homeassistant;
  const setHa = sectionSetter(draft, setDraft, 'homeassistant');
  const setSs = sectionSetter(draft, setDraft, 'surveillance');
  const note = (field: string) => <EnvNote field={field} envDefaults={envDefaults} resetEnv={resetEnv} toggleReset={toggleReset} />;
  const reasonStats = status?.surveillance.reasonStats ?? {};

  return (
    <>
      <Card
        title="Datenquelle"
        right={<span className={`chip ${status?.source.connected ? 'on' : ''}`} style={{ ['--tone' as string]: status?.source.connected ? '#10b981' : undefined }}>{status?.demo ? 'Demo' : status?.source.connected ? 'Verbunden' : 'Getrennt'}</span>}
      >
        {status && !status.demo && status.source.error && <p className="text-sm text-rose-400 mb-3">{status.source.error}</p>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Betriebsart" hint="Wähle die Datenquelle für die Geräte." note={note('iobroker.mode')}>
            <select className="field" value={io.mode} onChange={(e) => setIo({ mode: e.target.value as 'demo' | 'socketio' | 'homeassistant' })}>
              <option value="demo">Demo (Beispieldaten)</option>
              <option value="socketio">Live (ioBroker)</option>
              <option value="homeassistant">Live (Home Assistant)</option>
            </select>
          </Field>
          {io.mode !== 'homeassistant' && <>
          <Field label="Protokoll" hint="ws: Admin ab v6 / ws-Adapter. socketio: klassischer web- oder socketio-Adapter." note={note('iobroker.protocol')}>
            <select className="field" value={io.protocol ?? 'ws'} onChange={(e) => setIo({ protocol: e.target.value as 'ws' | 'socketio' })}>
              <option value="ws">WebSocket (ws)</option>
              <option value="socketio">socket.io</option>
            </select>
          </Field>
          <Field label="Host / IP" note={note('iobroker.host')}><input className="field" value={io.host} placeholder="192.168.1.10" onChange={(e) => setIo({ host: e.target.value })} /></Field>
          <Field label="Port" hint="Admin 8081, web 8082, socketio 8084" note={note('iobroker.port')}><NumInput value={io.port} onChange={(v) => setIo({ port: v ?? 8081 })} /></Field>
          <Field label="Benutzer (leer = ohne Anmeldung)" note={note('iobroker.user')}><input className="field" autoComplete="off" value={io.user ?? ''} onChange={(e) => setIo({ user: e.target.value })} /></Field>
          {/* the stored password is never sent to the browser; an empty field keeps it */}
          <Field label="Passwort" hint={io.passwordSet ? 'Gespeichert – leer lassen, um es zu behalten.' : undefined} note={note('iobroker.password')}>
            <input className="field" type="password" autoComplete="new-password" value={io.password ?? ''} placeholder={io.passwordSet ? '••••••••' : ''} onChange={(e) => setIo({ password: e.target.value })} />
          </Field>
          </>}
          {io.mode === 'homeassistant' && <>
            <Field label="Home-Assistant-Adresse" hint="Vollständige URL, z. B. https://homeassistant.local:8123" note={note('homeassistant.url')}>
              <input className="field" value={ha.url} placeholder="http://homeassistant.local:8123" onChange={(e) => setHa({ url: e.target.value })} />
            </Field>
            <Field label="Langlebiges Zugriffstoken" hint={ha.tokenSet ? 'Gespeichert – leer lassen, um es zu behalten.' : 'In deinem Home-Assistant-Profil erstellen.'} note={note('homeassistant.token')}>
              <input className="field" type="password" autoComplete="new-password" value={ha.token ?? ''} placeholder={ha.tokenSet ? '••••••••' : ''} onChange={(e) => setHa({ token: e.target.value })} />
            </Field>
            <Switch label="TLS-Zertifikat prüfen" checked={ha.verifySsl} onChange={(v) => setHa({ verifySsl: v })} />
          </>}
        </div>
        {io.mode !== 'homeassistant' && <>
        <div className="mt-2 grid sm:grid-cols-2 gap-x-8">
          <Switch label="HTTPS / WSS verwenden" checked={io.secure} onChange={(v) => setIo({ secure: v })} />
          <Switch label="Zertifikat prüfen (aus bei selbstsigniert)" checked={Boolean(io.verifySsl)} onChange={(v) => setIo({ verifySsl: v })} />
        </div>
        {status && !status.demo && status.source.connected && <WriteAccessCard />}
        </>}
      </Card>

      <Card title="Synology Surveillance Station" right={<Toggle checked={ss.enabled} onChange={(v) => setSs({ enabled: v })} label="Surveillance Station" />}>
        {status?.surveillance.error && ss.enabled && <p className="text-sm text-rose-400 mb-3">{status.surveillance.error}</p>}
        <div className={`grid sm:grid-cols-2 gap-4 ${dimUnless(ss.enabled)}`}>
          <Field label="Host / IP der Synology" note={note('surveillance.host')}><input className="field" value={ss.host} placeholder="192.168.1.5" onChange={(e) => setSs({ host: e.target.value })} /></Field>
          <Field label="Port" hint="DSM: 5000 (HTTP) oder 5001 (HTTPS)" note={note('surveillance.port')}><NumInput value={ss.port} onChange={(v) => setSs({ port: v ?? 5000 })} /></Field>
          <Field label="Benutzer" hint="Konten mit 2-Faktor-Anmeldung sind möglich (siehe 2-Faktor-Code unten)." note={note('surveillance.account')}><input className="field" autoComplete="off" value={ss.account} onChange={(e) => setSs({ account: e.target.value })} /></Field>
          <Field label="Passwort" hint={ss.passwordSet ? 'Gespeichert – leer lassen, um es zu behalten.' : undefined} note={note('surveillance.password')}>
            <input className="field" type="password" autoComplete="new-password" value={ss.password ?? ''} placeholder={ss.passwordSet ? '••••••••' : ''} onChange={(e) => setSs({ password: e.target.value })} />
          </Field>
          <Field label="Ereignis-Abfrage (Sekunden)"><NumInput value={ss.pollSeconds} onChange={(v) => setSs({ pollSeconds: v ?? 5 })} /></Field>
          <Field
            label="2-Faktor-Code (nur einmalig nötig)"
            hint="Nur bei Konten mit 2-Faktor-Anmeldung: aktuellen 6-stelligen Code aus der Authenticator-App eintragen und speichern. DSM stellt der App dann ein Geräte-Token aus, danach ist kein Code mehr nötig."
          >
            <input className="field tabular-nums tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="123456" value={ss.otp ?? ''} onChange={(e) => setSs({ otp: e.target.value.replace(/\D/g, '') })} />
          </Field>
          {ss.deviceIdSet && (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm">
              <span className="text-emerald-300">✓ App bei DSM als Gerät registriert – kein 2-Faktor-Code mehr nötig.</span>
              <button className={`btn !py-1 !text-xs ml-auto ${ss.resetDeviceId ? 'primary' : ''}`} onClick={() => setSs({ resetDeviceId: !ss.resetDeviceId })}>
                {ss.resetDeviceId ? 'Wird beim Speichern zurückgesetzt' : 'Registrierung zurücksetzen'}
              </button>
            </div>
          )}
          <Field label="Sperrzeit pro Kamera (Sekunden)" hint="Verhindert wiederholte Einblendungen"><NumInput value={ss.motionCooldownSeconds} onChange={(v) => setSs({ motionCooldownSeconds: v ?? 60 })} /></Field>
          <Field label="Aufzeichnungsarten = normale Bewegung" hint="2 = Bewegung, 3 = Alarm, 9 = Aktionsregel (Wert „reason“ der Ereignisse)"><input className="field" value={ss.eventReasons} onChange={(e) => setSs({ eventReasons: e.target.value })} /></Field>
          <Field label="Aufzeichnungsarten = erweiterte Erkennung (Person)" hint="Standard 7 (Analytik). Passe den Wert an, falls deine Station einen anderen Code liefert."><input className="field" value={ss.peopleReasons ?? ''} onChange={(e) => setSs({ peopleReasons: e.target.value })} /></Field>
          {/* diagnostics: which reason codes the station actually delivered */}
          <div className="sm:col-span-2 text-xs text-muted">
            <span className="font-semibold text-fg">Zuletzt gesehene Ereignisarten: </span>
            {Object.keys(reasonStats).length === 0
              ? 'noch keine. Kameras mit Dauer-Aufzeichnung (Art 0) liefern hier keine Bewegung – nutze dafür die Webhooks unten.'
              : Object.entries(reasonStats).map(([r, s]) => (
                  <span key={r} className="chip !cursor-default ml-1">Art {r || '–'}: {s.count}×</span>
                ))}
          </div>
        </div>
        <div className={`mt-2 grid sm:grid-cols-2 gap-x-8 ${dimUnless(ss.enabled)}`}>
          <Switch label="HTTPS verwenden" checked={ss.https} onChange={(v) => setSs({ https: v })} />
          <Switch label="Zertifikat prüfen" checked={ss.verifySsl} onChange={(v) => setSs({ verifySsl: v })} />
        </div>
        <div className="mt-4 rounded-2xl border border-line p-3 text-xs text-muted">
          <div className="font-semibold text-fg mb-1">Bewegungsmeldung per Webhook (empfohlen, in Echtzeit)</div>
          Lege in der Surveillance Station <b>pro Kamera und Art</b> eine Aktionsregel an (Auslöser: „Bewegung erkannt“ bzw. „Erweiterte Bewegungserkennung“ → Aktion: Webhook / HTTP-Anfrage). Die Kamera kann als ID (z. B. 21) oder Name (z. B. Terrasse) angegeben werden. Fertige URLs je Kamera stehen unter <i>Kameras</i>.
          <WebhookUrls camera="<Kamera>" token={webhookToken} />
        </div>
      </Card>
    </>
  );
}
