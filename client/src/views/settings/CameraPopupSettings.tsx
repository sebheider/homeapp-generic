/** Global camera refresh and detection pop-ups, alongside the per-camera settings. */
import { Eye } from 'lucide-react';
import { useStore } from '../../lib/store';
import type { PopupPosition, PopupSize } from '../../lib/types';
import { Card, Field, NumInput, POPUP_SIZES, Switch, sectionSetter, type TabProps } from './shared';
import { PopupRulesCard } from './PopupRulesCard';

const POSITIONS: { value: PopupPosition; label: string }[] = [
  { value: 'center', label: 'Mittig (über der App)' },
  { value: 'corner', label: 'Klein in der Ecke' },
];

export function CameraPopupSettings({ draft, setDraft }: Pick<TabProps, 'draft' | 'setDraft'>) {
  const a = draft.app;
  const set = sectionSetter(draft, setDraft, 'app');
  const preview = useStore((s) => s.previewPopup);
  return (
    <>
      <Card title="Kamera-Einblendung bei Erkennung">
        <p className="text-sm text-muted mb-3">Normale Bewegung und erweiterte Erkennung (Person) lassen sich getrennt steuern. Eine Personen-Einblendung ersetzt eine laufende Bewegungs-Einblendung, aber nicht umgekehrt. Die Schalter der einzelnen Kameras findest du weiter unten.</p>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <Switch label="Bei normaler Bewegung einblenden" checked={a.motionPopup} onChange={(v) => set({ motionPopup: v })} />
            <Field label="Anzeigedauer (Sekunden)"><NumInput value={a.motionPopupSeconds} onChange={(v) => set({ motionPopupSeconds: v ?? 30 })} /></Field>
          </div>
          <div>
            <Switch label="Bei Person (erweiterte Erkennung) einblenden" checked={a.peoplePopup} onChange={(v) => set({ peoplePopup: v })} />
            <Field label="Anzeigedauer (Sekunden)"><NumInput value={a.peoplePopupSeconds} onChange={(v) => set({ peoplePopupSeconds: v ?? 60 })} /></Field>
          </div>
          <Field label="Position">
            <select className="field" value={a.popupPosition ?? 'center'} onChange={(e) => set({ popupPosition: e.target.value as PopupPosition })}>
              {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Größe">
            <select className="field" value={a.popupSize ?? 'large'} onChange={(e) => set({ popupSize: e.target.value as PopupSize })}>
              {POPUP_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Kamerabild in der Einblendung aktualisieren (Sekunden)" hint={a.popupLiveVideo !== false ? 'Gilt nur, solange das Live-Video nicht verfügbar ist.' : undefined}><NumInput value={a.popupSnapshotRefreshSeconds ?? 1} onChange={(v) => set({ popupSnapshotRefreshSeconds: v ?? 1 })} /></Field>
        </div>
        <div className="mt-2">
          <Switch label="Live-Video statt Einzelbildern (flüssig, MJPEG der Surveillance Station)" checked={a.popupLiveVideo !== false} onChange={(v) => set({ popupLiveVideo: v })} />
        </div>
        <button className="btn mt-4" onClick={() => preview(a.popupPosition ?? 'center', a.popupSize ?? 'large')}>
          <Eye size={15} /> Vorschau anzeigen
        </button>
      </Card>
      <PopupRulesCard draft={draft} setDraft={setDraft} />
      <Card title="Kamerabilder">
        <Field label="Kamerabild in der App aktualisieren (Sekunden)" className="max-w-md">
          <NumInput value={a.snapshotRefreshSeconds} onChange={(v) => set({ snapshotRefreshSeconds: v ?? 3 })} />
        </Field>
      </Card>
    </>
  );
}
