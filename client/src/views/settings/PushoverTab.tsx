/**
 * Settings tab "Pushover": push notifications to phones – credentials, test message, which events are sent
 * with which priority, and quiet hours.
 */
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import type { PushEvent, PushPriority, PushoverConfig, PushoverStatus } from '../../lib/types';
import { Toggle } from '../../components/ui';
import { Card, Field, Switch, dimUnless, type TabProps } from './shared';

const ev = (enabled: boolean, priority: PushPriority) => ({ enabled, priority });
export const DEFAULT_PUSHOVER: PushoverConfig = {
  enabled: false,
  device: '',
  sound: '',
  appUrl: '',
  quietFrom: '',
  quietUntil: '',
  attachImage: true,
  cameraFollowPopup: true,
  printerProgressMinutes: 30,
  events: {
    alarm: ev(true, 1), warning: ev(true, 0), info: ev(false, -1), cleared: ev(false, -1), waste: ev(true, 0), ventilation: ev(false, -1),
    printerDone: ev(true, 0), printerError: ev(true, 1), printerCancelled: ev(false, 0), printerPaused: ev(true, 0), printerProgress: ev(false, -1), people: ev(true, 0), motion: ev(false, -1),
  },
};

const PRIORITIES: { value: PushPriority; label: string }[] = [
  { value: -1, label: 'Leise' },
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Hoch (auch bei „Nicht stören“)' },
  { value: 2, label: 'Notfall (wiederholt bis bestätigt)' },
];

/** Choices for the interval of the printer status updates (minutes). */
const PROGRESS_MINUTES = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
const minutesLabel = (m: number) => (m < 60 ? `${m} Minuten` : m === 60 ? '1 Stunde' : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} Stunden`);

const SOUNDS = ['pushover', 'bike', 'bugle', 'cashregister', 'classical', 'cosmic', 'falling', 'gamelan', 'incoming', 'intermission', 'magic', 'mechanical', 'pianobar', 'siren', 'spacealarm', 'tugboat', 'alien', 'climb', 'persistent', 'echo', 'updown', 'vibrate', 'none'];

/** Events grouped as shown in the settings. */
const GROUPS: { title: string; hint?: string; events: { key: PushEvent; label: string; hint: string }[] }[] = [
  {
    title: 'Eigene Benachrichtigungen (Sensoren)',
    hint: 'Regeln aus „Benachrichtigungen“ – je Regel kann Pushover dort auch abgeschaltet werden.',
    events: [
      { key: 'alarm', label: 'Alarme', hint: 'Regeln der Art „Alarm“' },
      { key: 'warning', label: 'Warnungen', hint: 'Regeln der Art „Warnung“' },
      { key: 'info', label: 'Hinweise', hint: 'Regeln der Art „Hinweis“' },
      { key: 'cleared', label: 'Entwarnung', hint: 'Wenn die Bedingung einer gesendeten Benachrichtigung vorbei ist' },
    ],
  },
  {
    title: 'Erinnerungen',
    events: [
      { key: 'waste', label: 'Müllabfuhr', hint: 'Am Vorabend und am Morgen der Abholung' },
      { key: 'ventilation', label: 'Lüftung', hint: 'Lüften empfohlen bzw. Fenster schließen' },
    ],
  },
  {
    title: '3D-Drucker',
    events: [
      { key: 'printerDone', label: 'Druck fertig', hint: 'Mit Dauer und Webcam-Bild' },
      { key: 'printerError', label: 'Druckfehler', hint: 'Druck mit Fehler beendet' },
      { key: 'printerCancelled', label: 'Druck abgebrochen', hint: '' },
      { key: 'printerPaused', label: 'Druck pausiert', hint: 'z. B. Filament leer' },
      { key: 'printerProgress', label: 'Statusupdates während des Drucks', hint: 'Regelmäßig mit Fortschritt, Restzeit und Webcam-Foto' },
    ],
  },
  {
    title: 'Kameras',
    events: [
      { key: 'people', label: 'Person erkannt', hint: 'Erweiterte Erkennung' },
      { key: 'motion', label: 'Bewegung', hint: 'Normale Bewegungserkennung' },
    ],
  },
];

/** Status line: active, last message, last error. */
function StatusLine({ status, enabled }: { status: PushoverStatus | null; enabled: boolean }) {
  if (!status || !enabled) return null;
  const time = (ts: number) => new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (status.demo) return <p className="text-sm text-muted mb-3">Im Demo-Modus werden keine Ereignisse gesendet – die Testnachricht funktioniert.</p>;
  return (
    <div className="text-sm mb-3 grid gap-0.5">
      {status.active ? <p className="text-emerald-400">✓ Aktiv</p> : <p className="text-muted">Nach dem Speichern aktiv, sobald Schlüssel und Token eingetragen sind.</p>}
      {status.lastSent && <p className="text-muted">Zuletzt gesendet: {status.lastSent.title} · {time(status.lastSent.ts)}</p>}
      {status.lastError && (!status.lastSent || status.lastError.ts > status.lastSent.ts) && <p className="text-rose-400">{status.lastError.message} · {time(status.lastError.ts)}</p>}
    </div>
  );
}

export function PushoverTab({ draft, setDraft }: TabProps) {
  const p: PushoverConfig = { ...DEFAULT_PUSHOVER, ...draft.pushover, events: { ...DEFAULT_PUSHOVER.events, ...draft.pushover?.events } };
  const set = (patch: Partial<PushoverConfig>) => setDraft({ ...draft, pushover: { ...p, ...patch } });
  const setEvent = (key: PushEvent, patch: Partial<PushoverConfig['events'][PushEvent]>) => set({ events: { ...p.events, [key]: { ...p.events[key], ...patch } } });
  const toast = useStore((s) => s.toast);
  const [status, setStatus] = useState<PushoverStatus | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    api.pushoverStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  const hasKeys = Boolean((p.user || p.userSet) && (p.token || p.tokenSet));

  const test = async () => {
    setTesting(true);
    try {
      await api.pushoverTest(p);
      toast('Testnachricht gesendet', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Card title="Pushover" right={<Toggle checked={p.enabled} onChange={(v) => set({ enabled: v })} label="Pushover" />}>
        <StatusLine status={status} enabled={p.enabled} />
        <p className="text-sm text-muted mb-4">
          Schickt Benachrichtigungen als Push-Nachricht aufs Handy – auch unterwegs. Dazu bei <a className="underline" href="https://pushover.net" target="_blank" rel="noreferrer">pushover.net</a> anmelden, die Pushover-App installieren und unter „Create an Application/API Token“ eine Anwendung (z. B. „HomeApp“) anlegen.
        </p>
        <div className={`grid sm:grid-cols-2 gap-4 ${dimUnless(p.enabled)}`}>
          {/* the stored keys are never sent to the browser; an empty field keeps them */}
          <Field label="Benutzer- oder Gruppen-Schlüssel" hint={`${p.userSet ? 'Gespeichert – leer lassen, um ihn zu behalten. ' : ''}Steht nach der Anmeldung oben auf pushover.net („Your User Key“).`}>
            <input className="field font-mono" type="password" autoComplete="new-password" value={p.user ?? ''} placeholder={p.userSet ? '••••••••••••••••' : ''} onChange={(e) => set({ user: e.target.value })} />
          </Field>
          <Field label="API-Token der Anwendung" hint={`${p.tokenSet ? 'Gespeichert – leer lassen, um ihn zu behalten. ' : ''}Token der eigenen Pushover-Anwendung.`}>
            <input className="field font-mono" type="password" autoComplete="new-password" value={p.token ?? ''} placeholder={p.tokenSet ? '••••••••••••••••' : ''} onChange={(e) => set({ token: e.target.value })} />
          </Field>
          <Field label="Geräte" hint="Gerätenamen aus Pushover, mit Komma getrennt. Leer = alle Geräte.">
            <input className="field" value={p.device} maxLength={100} placeholder="z. B. iphone,ipad" onChange={(e) => set({ device: e.target.value })} />
          </Field>
          <Field label="Ton">
            <select className="field" value={p.sound} onChange={(e) => set({ sound: e.target.value })}>
              <option value="">Standard des Kontos</option>
              {SOUNDS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field
            label="Adresse der App (für Links)"
            className="sm:col-span-2"
            hint="Ein Tipp auf den Link in der Nachricht öffnet die passende Seite. Leer = ohne Link."
            note={p.appUrl !== location.origin && <button type="button" className="btn !py-1 !text-xs mt-2" onClick={() => set({ appUrl: location.origin })}>Diese Adresse übernehmen ({location.origin})</button>}
          >
            <input className="field" value={p.appUrl} placeholder="https://homeapp.fritz.box:8080" onChange={(e) => set({ appUrl: e.target.value })} />
          </Field>
        </div>
        <div className={`mt-4 ${dimUnless(p.enabled)}`}>
          <button className="btn" disabled={!hasKeys || testing} onClick={test}><Send size={15} /> {testing ? 'Sendet …' : 'Testnachricht senden'}</button>
        </div>
      </Card>

      <div className={dimUnless(p.enabled)}>
        {GROUPS.map((g) => (
          <Card key={g.title} title={g.title}>
            {g.hint && <p className="text-xs text-muted -mt-2 mb-3">{g.hint}</p>}
            <div className="grid gap-3">
              {g.events.map((e) => {
                const cur = p.events[e.key];
                return (
                  <div key={e.key} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex-1 min-w-[10rem]">
                      <div className="text-sm">{e.label}</div>
                      {e.hint && <div className="text-[0.7rem] text-muted">{e.hint}</div>}
                    </div>
                    <select className={`field !w-auto ${cur.enabled ? '' : 'opacity-50'}`} aria-label={`Priorität ${e.label}`} value={cur.priority} onChange={(x) => setEvent(e.key, { priority: Number(x.target.value) as PushPriority })}>
                      {PRIORITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <Toggle checked={cur.enabled} onChange={(v) => setEvent(e.key, { enabled: v })} label={e.label} />
                  </div>
                );
              })}
            </div>
            {g.title === '3D-Drucker' && (
              <div className={`mt-3 ${p.events.printerProgress.enabled ? '' : 'opacity-50'}`}>
                <Field label="Statusupdate alle" hint="Nur solange gedruckt wird – das erste nach dieser Zeit ab Druckbeginn. Das Foto wird immer angehängt.">
                  <select className="field !w-auto" value={p.printerProgressMinutes} onChange={(e) => set({ printerProgressMinutes: Number(e.target.value) })}>
                    {[...new Set([...PROGRESS_MINUTES, p.printerProgressMinutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {g.title === 'Kameras' && (
              <div className="mt-3 grid sm:grid-cols-2 gap-x-8">
                <Switch label="Nur wenn das Pop-up erscheinen würde" checked={p.cameraFollowPopup} onChange={(v) => set({ cameraFollowPopup: v })} />
                <Switch label="Kamera- bzw. Webcam-Bild anhängen" checked={p.attachImage} onChange={(v) => set({ attachImage: v })} />
              </div>
            )}
          </Card>
        ))}

        <Card title="Ruhezeit">
          <p className="text-sm text-muted mb-3">In dieser Zeit kommen Nachrichten mit normaler oder leiser Priorität ohne Ton an. „Hoch“ und „Notfall“ klingeln weiterhin. Es gilt die Uhrzeit des Servers.</p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <Field label="Von"><input className="field" type="time" value={p.quietFrom} onChange={(e) => set({ quietFrom: e.target.value })} /></Field>
            <Field label="Bis"><input className="field" type="time" value={p.quietUntil} onChange={(e) => set({ quietUntil: e.target.value })} /></Field>
          </div>
          {(p.quietFrom || p.quietUntil) && <button type="button" className="btn !py-1 !text-xs mt-3" onClick={() => set({ quietFrom: '', quietUntil: '' })}>Keine Ruhezeit</button>}
        </Card>
      </div>
    </>
  );
}
