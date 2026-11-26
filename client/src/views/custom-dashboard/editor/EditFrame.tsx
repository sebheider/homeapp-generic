/** Edit controls of one widget: move, resize, settings and delete. */
import type { KeyboardEvent, PointerEvent } from 'react';
import { GripVertical, MoveDiagonal2, Settings2, Trash2 } from 'lucide-react';
import type { GridRect, Widget } from '../../../lib/widgets';
import { widgetLabel } from '../shared';

/** Active pointer gesture of the editor. */
export interface Drag {
  id: string;
  kind: 'move' | 'resize';
  x: number;
  y: number;
  rect: GridRect;
  list: Widget[];
  pitchX: number;
  pitchY: number;
  /** Last applied rectangle ("x,y,w,h"), so the layout is only recomputed when the cell changes. */
  last: string;
}

/** Edit controls laid over a widget: grip (move), settings, delete and the resize corner. */
export function EditFrame({ w, active, canDrag, onPointerDown, onPointerMove, onPointerUp, onKey, onSettings, onDelete }: {
  w: Widget; active: boolean; canDrag: boolean;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>, kind: Drag['kind']) => void;
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const label = widgetLabel(w);
  const gesture = { onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp };
  return (
    <div className={`cdash-edit ${active ? 'is-active' : ''}`}>
      <div className="cdash-bar flex items-center gap-1 p-1">
        {canDrag && (
          <button type="button" className="btn !p-2 min-h-9 min-w-9 cursor-grab active:cursor-grabbing touch-none"
            aria-label={`${label} verschieben (Spalte ${w.x + 1}, Zeile ${w.y + 1}, ${w.w} × ${w.h})`}
            title="Ziehen zum Verschieben · Tastatur: Pfeiltasten verschieben, Umschalt + Pfeiltasten ändern die Größe"
            onPointerDown={(e) => onPointerDown(e, 'move')} onKeyDown={onKey} {...gesture}
          ><GripVertical size={16} aria-hidden /></button>
        )}
        <span className="text-xs font-semibold truncate flex-1 min-w-0">{label} <span className="text-muted font-normal">· {w.w} × {w.h}</span></span>
        <button type="button" className="btn !p-2 min-h-9 min-w-9" onClick={onSettings} aria-label={`${label}: Einstellungen`} title="Einstellungen"><Settings2 size={16} /></button>
        <button type="button" className="btn !p-2 min-h-9 min-w-9 danger" onClick={onDelete} aria-label={`${label} entfernen`} title="Entfernen"><Trash2 size={16} /></button>
      </div>
      {canDrag && (
        <button type="button" className="cdash-resize btn !p-1.5 touch-none" aria-label={`${label}: Größe ändern`} title="Ziehen ändert die Größe"
          tabIndex={-1} onPointerDown={(e) => onPointerDown(e, 'resize')} {...gesture}
        ><MoveDiagonal2 size={15} aria-hidden /></button>
      )}
    </div>
  );
}
