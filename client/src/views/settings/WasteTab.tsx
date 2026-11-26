/**
 * Settings tab "Müllabfuhr": address of the pickup calendar (ICS / webcal of the local disposal company),
 * reminder window and kinds of waste without reminders.
 */
import { useEffect, useState } from 'react';
import { CalendarCheck, RotateCw } from 'lucide-react';
import { api, type WastePreview } from '../../lib/api';
import { useStore } from '../../lib/store';
import { daysUntil, pickupDay } from '../../lib/waste';
import type { WasteConfig, WasteData, WasteItem } from '../../lib/types';
import { Toggle } from '../../components/ui';
import { WasteBin } from '../../components/Waste';
import { Card, Field, dimUnless, toggleItem, type TabProps } from './shared';

const DEFAULT_WASTE: WasteConfig = { enabled: false, url: '', remindFrom: '17:00', remindUntil: '10:00', severity: 'warning', hidden: [] };

/** Warns when the calendar runs out soon (the yearly calendars of many disposal companies end on 31 Dec). */
function ExpiryNote({ last }: { last: string | null | undefined }) {
  if (!last) return null;
  const left = daysUntil(last, new Date());
  if (left > 21) return <p className="text-xs text-muted mt-1">Termine bis {new Date(`${last}T12:00`).toLocaleDateString('de-DE')}.</p>;
  return (
    <p className="text-xs text-amber-400 mt-1">
      {left < 0 ? 'Der Kalender enthält keine künftigen Termine mehr' : `Der Kalender endet in ${left} Tagen`} – bitte die Adresse für das neue Jahr beim Entsorger abrufen und hier eintragen.
    </p>
  );
}

export function WasteTab({ draft, setDraft }: TabProps) {
  const w = { ...DEFAULT_WASTE, ...draft.waste };
  const set = (p: Partial<WasteConfig>) => setDraft({ ...draft, waste: { ...w, ...p } });
  const toast = useStore((s) => s.toast);
  const live = useStore((s) => s.waste);
  const [preview, setPreview] = useState<WastePreview | null>(null);
  const [server, setServer] = useState<WasteData | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.waste().then(setServer).catch(() => {}); }, [live?.fetchedAt]);

  const test = async () => {
    setBusy(true);
    try {
      const p = await api.wastePreview(w.url);
      setPreview(p);
      if (p.url !== w.url) set({ url: p.url });
      toast(`${p.count} Termine gefunden`, 'success');
    } catch (e) {
      setPreview(null);
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const d = await api.wasteRefresh();
      setServer(d);
      if (d.error) toast(d.error, 'error');
      else toast('Abfuhrkalender aktualisiert', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // kinds of waste: from the check of a new address, otherwise from the calendar the server holds
  const kinds: WasteItem[] = preview?.kinds ?? server?.kinds ?? [];
  const next = preview?.next ?? server?.upcoming.slice(0, 5) ?? [];
  const last = preview ? preview.last : server?.last;
  return (
    <>
      <Card title="Abfuhrkalender" right={<Toggle checked={w.enabled} onChange={(v) => set({ enabled: v })} label="Müllabfuhr anzeigen" />}>
        <div className={`grid gap-4 ${dimUnless(w.enabled)}`}>
          <Field
            label="Kalender-Adresse (ICS oder webcal)"
            hint="Beim Entsorger den Abfuhrkalender für die eigene Straße als „Kalender abonnieren“ / iCal-Link kopieren, z. B. https://entsorger.example/abfuhrkalender/…/ics"
            note={<ExpiryNote last={last} />}
          >
            <div className="flex gap-2">
              <input className="field flex-1" value={w.url} placeholder="https://…/ics" onChange={(e) => { set({ url: e.target.value }); setPreview(null); }} />
              <button className="btn" disabled={busy || !w.url.trim()} onClick={test}><CalendarCheck size={15} /> Testen</button>
            </div>
          </Field>
          {server?.error && !preview && <p className="text-xs text-amber-400">Letzter Abruf: {server.error}</p>}
          {next.length > 0 && (
            <div>
              <div className="lbl">{preview ? 'Nächste Termine (Test)' : 'Nächste Termine'}{server?.demo && !preview ? ' – Beispielkalender (Demo-Modus)' : ''}</div>
              <ul className="grid gap-1 text-sm">
                {next.map((d) => (
                  <li key={d.date} className="flex items-center gap-3">
                    <span className="w-24 text-muted shrink-0">{pickupDay(d.date, new Date())}</span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1">{d.items.map((i) => <span key={i.key} className="inline-flex items-center gap-1.5"><WasteBin item={i} size={12} /> {i.label}</span>)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <button className="btn !py-1 !text-xs" disabled={busy || !server?.enabled} onClick={refresh}><RotateCw size={13} /> Jetzt neu abrufen</button>
            <span className="text-xs text-muted ml-2">
              {server?.fetchedAt ? `Zuletzt abgerufen ${new Date(server.fetchedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}; ` : ''}
              automatisch alle 6 Stunden (gespeicherte Adresse).
            </span>
          </div>
        </div>
      </Card>

      <Card title="Erinnerung">
        <div className={`grid sm:grid-cols-3 gap-4 ${dimUnless(w.enabled)}`}>
          <Field label="Am Vorabend ab" hint="Hinweis „Morgen: …“">
            <input className="field" type="time" value={w.remindFrom} onChange={(e) => set({ remindFrom: e.target.value || '17:00' })} />
          </Field>
          <Field label="Am Abholtag bis" hint="Hinweis „Heute: …“">
            <input className="field" type="time" value={w.remindUntil} onChange={(e) => set({ remindUntil: e.target.value || '10:00' })} />
          </Field>
          <Field label="Darstellung">
            <select className="field" value={w.severity} onChange={(e) => set({ severity: e.target.value as WasteConfig['severity'] })}>
              <option value="warning">Banner + Meldung (auffällig)</option>
              <option value="info">Nur in den Benachrichtigungen</option>
            </select>
          </Field>
          <div className="sm:col-span-3">
            <div className="lbl">Erinnern an</div>
            {kinds.length === 0 ? <p className="text-xs text-muted">Nach dem Testen oder Speichern erscheinen hier die Abfallarten des Kalenders.</p> : (
              <div className="flex flex-wrap gap-2">
                {kinds.map((k) => (
                  <label key={k.key} className={`chip cursor-pointer ${w.hidden.includes(k.key) ? '' : 'on'}`} title={k.summary}>
                    <input type="checkbox" className="sr-only" checked={!w.hidden.includes(k.key)} onChange={() => set({ hidden: toggleItem(w.hidden, k.key) })} />
                    <WasteBin item={k} size={12} /> {k.label}
                  </label>
                ))}
              </div>
            )}
            <p className="text-[0.7rem] text-muted mt-2">Ausgeblendete Arten erscheinen weder als Hinweis noch im Widget.</p>
          </div>
        </div>
      </Card>
    </>
  );
}
