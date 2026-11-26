/**
 * Freely designable start page ("Eigene", chosen per device under Einstellungen → Anzeige): widgets
 * placed in a grid of 12 columns with rows of fixed height. The layout is stored on the server (see
 * lib/widgets.ts and server dashboard.js), so every device with this design shows the same page.
 *
 * - Large screens: the grid as designed. Phones: the widgets one below the other in reading order.
 * - Kiosk mode: the rows share the height of the screen, so the page fits without scrolling.
 * - Widgets that are larger than their content enlarge it (ScaleUp in components/hud/scale.tsx; can be
 *   switched off per widget). Gauges, Home Core, camera pictures and the radar fill their area anyway.
 * - Single parts of the weather and energy pages are widgets of their own ("Wetter-Detail",
 *   "Energie-Detail"); lights and switches can be shown as small tiles.
 * - Editing: "Bearbeiten" (or Einstellungen → Anzeige) shows the grid. Widgets are moved at their grip
 *   and resized at the corner (mouse, touch, or keyboard: arrow keys move, Shift + arrow keys resize);
 *   widgets in the way move down. ⚙ opens the widget's settings incl. exact position and size. The
 *   draft is kept while switching pages and only saved with "Speichern".
 */
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { LayoutDashboard, LayoutTemplate, Pencil, Plus, Save, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { useKioskLayout, useKioskScale } from '../lib/displayHooks';
import { useElementSize, useMedia } from '../lib/hooks';
import { useOverview } from '../lib/overview';
import { GRID_COLS, MAX_WIDGETS, WIDGET_PARTS, addWidget, gridRows, normalizeDashboard, placeWidget, readingOrder, scalesContent, templateWidgets, type Widget, type WidgetOptions, type WidgetType } from '../lib/widgets';
import { useEnergy } from '../components/Energy';
import { HudScale } from '../components/Hud';
import { Empty } from '../components/ui';
import { widgetLabel } from './custom-dashboard/shared';
import { WidgetView } from './custom-dashboard/widgets/WidgetView';
import { AddDialog } from './custom-dashboard/editor/AddDialog';
import { WidgetSettings } from './custom-dashboard/editor/WidgetSettings';
import { EditFrame, type Drag } from './custom-dashboard/editor/EditFrame';

/** Height of a grid row and gap between the cells (px). */
const BASE_ROW = 64;
const BASE_GAP = 16;
/** Empty rows below the last widget while editing, so widgets can be dragged further down. */
const EDIT_SPARE_ROWS = 4;

/** Smallest row height (px) at which the kiosk layout still squeezes all rows onto the screen; otherwise it scrolls. */
const BASE_MIN_FIT_ROW = 40;
/** Gap between the cells in the kiosk layout (px). */
const BASE_FIT_GAP = 12;

/** The freely designable start page; `fill`: kiosk layout that fits exactly one screen. */
export function CustomDashboard({ fill = false }: { fill?: boolean }) {
  const stored = useStore((s) => s.config?.customDashboard);
  const saved = useMemo(() => normalizeDashboard(stored), [stored]);
  const draft = useStore((s) => s.dashboardDraft);
  const edit = useStore((s) => s.editDashboard);
  const save = useStore((s) => s.saveDashboard);
  const reduceEffects = useStore((s) => s.display.kioskReduceEffects);
  // large kiosk screens enlarge the content (rem), so the grid metrics grow along
  const ui = useKioskScale(useKioskLayout(useStore((s) => s.display.kiosk)), useStore((s) => s.display.kioskZoom));
  const [ROW, GAP, MIN_FIT_ROW, FIT_GAP] = [BASE_ROW * ui, BASE_GAP * ui, BASE_MIN_FIT_ROW * ui, BASE_FIT_GAP * ui];
  const o = useOverview();
  const energy = useEnergy();
  const wide = useMedia('(min-width: 640px)');
  const editing = draft !== null;
  const widgets = draft ?? saved;
  const [adding, setAdding] = useState(false);
  const [settingsOf, setSettingsOf] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [announcement, announce] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(areaRef, { w: 0, h: 0 }, editing || widgets.length > 0);
  const drag = useRef<Drag | null>(null);

  const update = (next: Widget[]) => edit(next);
  const describe = (w: Widget) => `${widgetLabel(w)}: Spalte ${w.x + 1}, Zeile ${w.y + 1}, ${w.w} × ${w.h}`;

  const startDrag = (e: PointerEvent<HTMLButtonElement>, w: Widget, kind: Drag['kind']) => {
    const grid = gridRef.current;
    if (e.button !== 0 || !grid) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = (grid.clientWidth - GAP * (GRID_COLS - 1)) / GRID_COLS;
    drag.current = { id: w.id, kind, x: e.clientX, y: e.clientY, rect: { x: w.x, y: w.y, w: w.w, h: w.h }, list: widgets, pitchX: cell + GAP, pitchY: ROW + GAP, last: '' };
    setActive(w.id);
  };
  const moveDrag = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.x) / d.pitchX);
    const dy = Math.round((e.clientY - d.y) / d.pitchY);
    const r = d.rect;
    const next = d.kind === 'move' ? { ...r, x: r.x + dx, y: r.y + dy } : { ...r, w: Math.min(r.w + dx, GRID_COLS - r.x), h: r.h + dy };
    const key = `${next.x},${next.y},${next.w},${next.h}`;
    if (key === d.last) return;
    d.last = key;
    update(placeWidget(d.list, d.id, next));
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setActive(null);
    const w = useStore.getState().dashboardDraft?.find((x) => x.id === d.id);
    if (w) announce(describe(w));
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, w: Widget) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const [dx, dy] = step;
    const next = placeWidget(widgets, w.id, e.shiftKey ? { ...w, w: Math.min(w.w + dx, GRID_COLS - w.x), h: w.h + dy } : { ...w, x: w.x + dx, y: w.y + dy });
    update(next);
    const moved = next.find((x) => x.id === w.id);
    if (moved) announce(describe(moved));
  };

  const add = (type: WidgetType, options?: WidgetOptions, size?: [number, number]) => {
    const next = addWidget(widgets, type, options, size);
    update(next);
    setAdding(false);
    // widgets that need a choice open their settings right away (unless a part was already chosen)
    if (!options && (type === 'devices' || type === 'camera' || type === 'room' || type === 'text' || type === 'extension' || WIDGET_PARTS[type])) setSettingsOf(next[next.length - 1].id);
  };
  const finish = async () => {
    setSaving(true);
    const ok = await save({ widgets });
    setSaving(false);
    if (ok) edit(null);
  };
  const configured = settingsOf ? widgets.find((w) => w.id === settingsOf) : undefined;

  if (!editing && !widgets.length) {
    return (
      <Empty icon={<LayoutDashboard size={28} />} title="Deine eigene Startseite" text="Stelle dir die Übersicht aus Widgets zusammen – Uhr, Wetter, Messinstrumente, Energie, Kameras, Räume, Szenen, Geräte und Notizen – und ordne sie frei im Raster an.">
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn primary" onClick={() => edit([])}><Plus size={15} /> Leer beginnen</button>
          <button className="btn" onClick={() => edit(templateWidgets())}><LayoutTemplate size={15} /> Mit Vorlage beginnen</button>
        </div>
      </Empty>
    );
  }

  const rows = editing ? Math.max(gridRows(widgets) + EDIT_SPARE_ROWS, 8) : Math.max(gridRows(widgets), 1);
  // kiosk: the rows share the screen height, unless they would get too small to be readable
  const fitScreen = fill && !editing && wide && (area.h - FIT_GAP * (rows - 1)) / rows >= MIN_FIT_ROW;
  const list = wide ? widgets : readingOrder(widgets);
  const cellStyle = (w: Widget) =>
    wide ? { gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` } : { minHeight: w.h * ROW + (w.h - 1) * GAP };

  return (
    <div className={`${fill ? 'h-full min-h-0 flex flex-col' : ''} ${fitScreen ? `kiosk-dash ${reduceEffects ? 'kiosk-reduce-effects' : ''}` : ''}`}>
      {editing ? (
        <div className="glass cdash-toolbar sticky top-0 z-20 mb-4 p-3 flex flex-wrap items-center gap-2" data-no-swipe>
          <div className="flex-1 min-w-[12rem]">
            <div className="font-semibold text-sm">Startseite bearbeiten</div>
            <p className="text-[0.7rem] text-muted">
              {wide ? 'Am Griff verschieben, an der Ecke unten rechts die Größe ändern. ⚙ für Einstellungen.' : 'Position und Größe über ⚙ – oder auf einem größeren Bildschirm per Ziehen.'}
              {fill && wide && ' Im Kioskmodus teilen sich die Zeilen die Bildschirmhöhe.'}
            </p>
          </div>
          <button className="btn" onClick={() => setAdding(true)}><Plus size={15} /> Widget</button>
          {!widgets.length && <button className="btn" onClick={() => update(templateWidgets())}><LayoutTemplate size={15} /> Vorlage</button>}
          <button className="btn" onClick={() => edit(null)}><X size={15} /> Abbrechen</button>
          <button className="btn primary" onClick={finish} disabled={saving}><Save size={15} /> Speichern</button>
        </div>
      ) : (
        !fill && (
          <div className="flex justify-end mb-3">
            <button className="btn !py-1.5 !text-xs" onClick={() => edit(saved)}><Pencil size={13} /> Bearbeiten</button>
          </div>
        )
      )}

      <div ref={areaRef} className={fill ? `flex-1 min-h-0 ${fitScreen ? '' : 'overflow-y-auto no-scrollbar'}` : ''}>
        <div
          ref={gridRef}
          className={`cdash-grid ${editing ? 'is-editing' : ''} ${fitScreen ? 'h-full' : ''}`}
          data-no-swipe={editing || undefined}
          style={
            wide
              ? { gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${fitScreen ? 'minmax(0, 1fr)' : `${ROW}px`})`, gap: fitScreen ? FIT_GAP : GAP }
              : { gridTemplateColumns: 'minmax(0, 1fr)', gap: GAP }
          }
        >
          {editing && wide && Array.from({ length: GRID_COLS }, (_, i) => (
            <i key={`col-${i}`} className="cdash-col" style={{ gridColumn: i + 1, gridRow: `1 / span ${rows}`, ['--pitch' as string]: `${ROW + GAP}px`, ['--row' as string]: `${ROW}px` }} aria-hidden />
          ))}
          {list.map((w) => (
            <div key={w.id} className={`cdash-cell ${w.type === 'gauge' ? 'cdash-gauge' : ''}`} style={cellStyle(w)}>
              {/* larger widgets enlarge their content (not on phones, where the cells grow with their content) */}
              <HudScale.Provider value={wide && scalesContent(w)}>
                <WidgetView w={w} o={o} energy={energy} />
              </HudScale.Provider>
              {editing && (
                <EditFrame
                  w={w}
                  active={active === w.id}
                  canDrag={wide}
                  onPointerDown={(e, kind) => startDrag(e, w, kind)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onKey={(e) => onKey(e, w)}
                  onSettings={() => setSettingsOf(w.id)}
                  onDelete={() => update(widgets.filter((x) => x.id !== w.id))}
                />
              )}
            </div>
          ))}
        </div>
        {editing && !widgets.length && (
          <p className="text-sm text-muted text-center mt-4">Noch leer – füge über „Widget“ das erste Widget hinzu oder beginne mit der Vorlage.</p>
        )}
      </div>

      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
      <AddDialog open={adding} onClose={() => setAdding(false)} onAdd={add} full={widgets.length >= MAX_WIDGETS} />
      {configured && (
        <WidgetSettings
          w={configured}
          o={o}
          onChange={(options) => update(widgets.map((x) => (x.id === configured.id ? { ...x, options } : x)))}
          onPlace={(r) => update(placeWidget(widgets, configured.id, r))}
          onClose={() => setSettingsOf(null)}
        />
      )}
    </div>
  );
}
