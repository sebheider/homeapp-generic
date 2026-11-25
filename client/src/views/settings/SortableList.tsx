/** Handle-only sorting with mouse, touch and a keyboard alternative. */
import { useId, useState, type ReactNode } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { GripVertical } from 'lucide-react';
import { moveItem } from '../../lib/reorder';

interface SortableListProps<T> {
  items: T[];
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  onReorder: (items: T[]) => void;
  children: (item: T, handle: ReactNode) => ReactNode;
  label: string;
  className?: string;
  itemClassName?: string;
}

export function SortableList<T>({ items, itemKey, itemLabel, onReorder, children, label, className, itemClassName }: SortableListProps<T>) {
  const hintId = useId();
  const [announcement, announce] = useState('');
  const reorder = (next: T[]) => {
    if (next.some((item, index) => itemKey(item) !== itemKey(items[index]))) onReorder(next);
  };
  return (
    <>
      <span id={hintId} className="sr-only">Am Griff ziehen oder mit Pfeil nach oben und unten sortieren. Pos1 und Ende verschieben an den Anfang oder Schluss.</span>
      <Reorder.Group as="div" axis="y" values={items.map(itemKey)} onReorder={(keys) => {
        const byKey = new Map(items.map((item) => [itemKey(item), item]));
        reorder(keys.map((key) => byKey.get(key)!));
      }} aria-label={label} className={className}>
        {items.map((item, index) => (
          <SortableRow key={itemKey(item)} id={itemKey(item)} label={itemLabel(item)} index={index} count={items.length} hintId={hintId} className={itemClassName}
            onMove={(to) => {
              const next = moveItem(items, index, to);
              reorder(next);
              if (next !== items) announce(`${itemLabel(item)}: Position ${to + 1} von ${items.length}`);
            }}
            onDrop={() => announce(`${itemLabel(item)}: Position ${index + 1} von ${items.length}`)}
          >{(handle) => children(item, handle)}</SortableRow>
        ))}
      </Reorder.Group>
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    </>
  );
}

function SortableRow({ id, label, index, count, hintId, className, onMove, onDrop, children }: {
  id: string; label: string; index: number; count: number; hintId: string; className?: string;
  onMove: (to: number) => void; onDrop: () => void; children: (handle: ReactNode) => ReactNode;
}) {
  const controls = useDragControls();
  const reduced = useReducedMotion();
  const handle = (
    <button type="button" className="btn !p-2 min-h-11 min-w-11 shrink-0 cursor-grab active:cursor-grabbing touch-none"
      aria-label={`${label} sortieren, Position ${index + 1} von ${count}`} aria-describedby={hintId}
      title="Ziehen zum Sortieren · Tastatur: ↑ / ↓" disabled={count < 2}
      onPointerDown={(event) => {
        if (event.button !== 0 || count < 2) return;
        event.currentTarget.focus({ preventScroll: true });
        controls.start(event);
      }}
      onKeyDown={(event) => {
        const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
        if (to === null) return;
        event.preventDefault();
        event.stopPropagation();
        onMove(to);
      }}
    ><GripVertical size={18} aria-hidden="true" /></button>
  );
  return (
    <Reorder.Item as="div" value={id} dragListener={false} dragControls={controls} onDragEnd={onDrop}
      className={`relative ${className ?? ''}`} style={{ position: 'relative' }}
      whileDrag={{ zIndex: 30, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}
      transition={reduced ? { duration: 0 } : undefined}
    >{children(handle)}</Reorder.Item>
  );
}
