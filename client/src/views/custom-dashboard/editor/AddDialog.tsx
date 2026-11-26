import { Plus } from 'lucide-react';
import { MAX_WIDGETS, WIDGETS, WIDGET_PARTS, WIDGET_TYPES, type WidgetOptions, type WidgetPart, type WidgetType } from '../../../lib/widgets';
import { Modal } from '../../../components/ui';
import { ICONS, useWidgetModules } from '../shared';

/**
 * Catalogue of the widgets; a click adds one at the first free place. Widgets with parts (gauges,
 * weather and energy details) also list their parts, so a single part can be added directly; the
 * entry "Externes Modul" lists the enabled external modules that bring a widget.
 */
export function AddDialog({ open, onClose, onAdd, full }: { open: boolean; onClose: () => void; onAdd: (type: WidgetType, options?: WidgetOptions, size?: [number, number]) => void; full: boolean }) {
  const modules = useWidgetModules();
  return (
    <Modal open={open} onClose={onClose} title="Widget hinzufügen" wide>
      {full && <p className="text-sm text-rose-400 mb-3">Die Startseite hat bereits {MAX_WIDGETS} Widgets.</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {WIDGET_TYPES.filter((t) => t !== 'extension' || modules.length > 0).map((t) => {
          const I = ICONS[t];
          const parts: { option: string; label: string; parts: readonly WidgetPart[] } | undefined = t === 'extension'
            ? { option: 'extension', label: 'Modul', parts: modules.map((m) => ({ id: m.id, label: m.name, size: m.widget?.size ?? WIDGETS.extension.size })) }
            : WIDGET_PARTS[t];
          return (
            <div key={t} className={`rounded-2xl border border-line hover:border-violet-400/50 transition ${parts ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
              <button className="w-full text-left p-3 flex gap-3 disabled:opacity-50" disabled={full} onClick={() => onAdd(t)}>
                <div className="icon-bubble on tone-violet !w-9 !h-9 shrink-0"><I size={17} /></div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{WIDGETS[t].label}</div>
                  <p className="text-xs text-muted mt-0.5">{WIDGETS[t].text}</p>
                </div>
              </button>
              {parts && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-3 -mt-1" role="group" aria-label={`${WIDGETS[t].label}: direkt hinzufügen`}>
                  {parts.parts.map((p) => (
                    <button key={p.id} className="chip !text-xs disabled:opacity-50" disabled={full} onClick={() => onAdd(t, { [parts.option]: p.id }, t === 'extension' ? p.size : undefined)}>
                      <Plus size={12} /> {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
