/**
 * Schedule rules for the pop-ups. With at least one enabled rule a pop-up is only shown when a
 * rule matches (kind of detection, weekday, time window, camera); without rules the switches above decide.
 */
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, type PopupPreview } from '../../lib/api';
import { useStore } from '../../lib/store';
import type { AppConfig, PopupRule } from '../../lib/types';
import { Toggle } from '../../components/ui';
import { Card, DeleteButton, patchById, toggleItem, uid } from './shared';
import { ALL_DAYS, Chip, DayChips, TimeRange } from './TimeWindows';

/** Card with the rule list, a live preview of the saved rules and buttons to add rules. */
export function PopupRulesCard({ draft, setDraft }: { draft: AppConfig; setDraft: (c: AppConfig) => void }) {
  const cameras = useStore((s) => s.cameras);
  const rules = draft.app.popupRules ?? [];
  const [preview, setPreview] = useState<PopupPreview | null>(null);

  // live preview of the saved rules; refreshed every 30 s
  useEffect(() => {
    const load = () => api.popupPreview().then(setPreview).catch(() => setPreview(null));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const setRules = (popupRules: PopupRule[]) => setDraft({ ...draft, app: { ...draft.app, popupRules } });
  const update = (id: string, p: Partial<PopupRule>) => setRules(patchById(rules, id, p));
  const newRule = (p: Partial<PopupRule> = {}): PopupRule => ({
    id: uid('regel', rules.map((r) => r.id)),
    name: 'Neue Regel',
    enabled: true,
    kinds: ['motion', 'people'],
    days: ALL_DAYS,
    from: '00:00',
    to: '00:00',
    cameras: [],
    ...p,
  });
  /** Adds two example rules: people only during the day, everything at night. */
  const addExample = () => {
    const day = newRule({ name: 'Tagsüber nur Person', kinds: ['people'], from: '06:00', to: '22:00' });
    // the second id must also avoid the id of the first (not yet stored) rule
    const night = newRule({ id: uid('regel', [...rules.map((r) => r.id), day.id]), name: 'Nachts alles', kinds: ['motion', 'people'], from: '22:00', to: '06:00' });
    setRules([...rules, day, night]);
  };

  return (
    <Card
      title="Zeitpläne für die Einblendung"
      right={
        <div className="flex gap-2">
          <button className="btn !py-1.5 !text-xs" onClick={addExample}>Beispiel: tagsüber Person, nachts alles</button>
          <button className="btn primary !py-1.5 !text-xs" onClick={() => setRules([...rules, newRule()])}><Plus size={14} /> Regel</button>
        </div>
      }
    >
      <p className="text-sm text-muted mb-3">
        Lege fest, <b>wann</b> welche Art der Erkennung einblendet. Sobald mindestens eine Regel aktiv ist, erscheint ein Pop-up nur, wenn eine Regel passt
        (Art, Wochentag, Uhrzeit, Kamera). Ohne Regeln gelten nur die Schalter oben. Die Uhrzeit ist die des Servers (Zeitzone des Containers).
      </p>
      {preview && (
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-muted">
          <span>Aktuell (gespeicherter Stand, Serverzeit {preview.now}):</span>
          <span className={`chip !cursor-default ${preview.motion ? 'on' : ''}`} style={{ ['--tone' as string]: '#38bdf8' }}>Bewegung {preview.motion ? 'blendet ein' : 'aus'}</span>
          <span className={`chip !cursor-default ${preview.people ? 'on' : ''}`} style={{ ['--tone' as string]: '#f43f5e' }}>Person {preview.people ? 'blendet ein' : 'aus'}</span>
        </div>
      )}
      {rules.length === 0 && <div className="rounded-2xl border border-line p-4 text-sm text-muted text-center">Keine Regeln: Einblendung immer, soweit oben aktiviert.</div>}
      <div className="flex flex-col gap-3">
        {rules.map((r) => (
          <div key={r.id} className={`rounded-2xl border border-line p-3 sm:p-4 ${r.enabled ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-3">
              <input className="field flex-1" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} aria-label="Name der Regel" />
              <Toggle checked={r.enabled} onChange={(v) => update(r.id, { enabled: v })} label="Regel aktiv" />
              <DeleteButton onClick={() => setRules(rules.filter((x) => x.id !== r.id))} label="Regel löschen" />
            </div>
            <div className="grid lg:grid-cols-2 gap-x-6 gap-y-3 mt-3">
              <div>
                <label className="lbl">Art der Erkennung</label>
                <div className="flex flex-wrap gap-2">
                  <Chip on={r.kinds.includes('motion')} onClick={() => update(r.id, { kinds: toggleItem(r.kinds, 'motion') })}>Bewegung</Chip>
                  <Chip on={r.kinds.includes('people')} onClick={() => update(r.id, { kinds: toggleItem(r.kinds, 'people') })}>Person (erweitert)</Chip>
                </div>
              </div>
              <div>
                <label className="lbl">Wochentage</label>
                <DayChips days={r.days} onChange={(days) => update(r.id, { days })} />
              </div>
              <div>
                <label className="lbl">Uhrzeit von – bis</label>
                <TimeRange value={r} onChange={(p) => update(r.id, p)} />
              </div>
              <div>
                <label className="lbl">Kameras (keine Auswahl = alle)</label>
                <div className="flex flex-wrap gap-1.5">
                  {cameras.length === 0 && <span className="text-xs text-muted">Keine Kameras geladen</span>}
                  {cameras.map((c) => <Chip key={c.id} on={r.cameras.includes(c.id)} onClick={() => update(r.id, { cameras: toggleItem(r.cameras, c.id) })}>{c.name}</Chip>)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
