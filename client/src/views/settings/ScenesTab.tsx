/** Settings tab "Szenen": scenes and the datapoint values they write. */
import { Plus, Trash2 } from 'lucide-react';
import type { Scene, SceneAction } from '../../lib/types';
import { IconPicker, StatePicker } from '../../components/Pickers';
import { Card, DeleteButton, EmptyHint, Field, patchById, uid, type TabProps } from './shared';

/** Interprets the text of a value field: "true" / "false", numbers, otherwise the text itself. */
const parseActionValue = (t: string): SceneAction['value'] =>
  t === 'true' ? true : t === 'false' ? false : t !== '' && !Number.isNaN(Number(t)) ? Number(t) : t;

/** Scene cards with name, icon and the list of actions (datapoint + value). */
export function ScenesTab({ draft, setDraft }: TabProps) {
  const update = (id: string, p: Partial<Scene>) => setDraft({ ...draft, scenes: patchById(draft.scenes, id, p) });
  /** Changes one action of a scene. */
  const updateAction = (s: Scene, i: number, p: Partial<SceneAction>) => update(s.id, { actions: s.actions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const addScene = () => setDraft({ ...draft, scenes: [...draft.scenes, { id: uid('szene', draft.scenes.map((s) => s.id)), name: 'Neue Szene', icon: 'sparkles', actions: [] }] });
  return (
    <>
      <div className="flex justify-end mb-4">
        <button className="btn primary" onClick={addScene}><Plus size={16} /> Szene</button>
      </div>
      {draft.scenes.length === 0 && <EmptyHint>Szenen setzen mehrere Datenpunkte mit einem Tipp, z. B. „Filmabend“ oder „Alles aus“.</EmptyHint>}
      {draft.scenes.map((s) => (
        <Card key={s.id} title={s.name || 'Szene'} right={<DeleteButton onClick={() => setDraft({ ...draft, scenes: draft.scenes.filter((x) => x.id !== s.id) })} />}>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <Field label="Name"><input className="field" value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} /></Field>
            <Field label="Symbol"><IconPicker value={s.icon} onChange={(icon) => update(s.id, { icon })} /></Field>
          </div>
          <h3 className="section-title mb-2">Aktionen</h3>
          <div className="flex flex-col gap-2">
            {s.actions.map((a, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1"><StatePicker value={a.state} onChange={(state) => updateAction(s, i, { state })} /></div>
                <input
                  className="field !w-28 font-mono !text-xs"
                  value={String(a.value)}
                  title="Wert: true, false, Zahl oder Text"
                  onChange={(e) => updateAction(s, i, { value: parseActionValue(e.target.value) })}
                />
                <button className="btn btn-icon danger" onClick={() => update(s.id, { actions: s.actions.filter((_, j) => j !== i) })} aria-label="Aktion entfernen"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button className="btn mt-3" onClick={() => update(s.id, { actions: [...s.actions, { state: '', value: true }] })}><Plus size={15} /> Aktion</button>
        </Card>
      ))}
    </>
  );
}
