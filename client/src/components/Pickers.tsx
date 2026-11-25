/** Input helpers of the settings editor: ioBroker datapoint picker with live search and the icon picker. */
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { ICON_CHOICES, Icon } from '../lib/icons';
import type { ObjectHit } from '../lib/types';

/**
 * Text field for an ioBroker state id with live search.
 * Typing searches the object list of the connected ioBroker (id and name);
 * picking a hit fills in the id. Free input stays possible.
 */
export function StatePicker({ value, onChange, placeholder = 'Datenpunkt suchen oder ID eingeben' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [hits, setHits] = useState<ObjectHit[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>(0);
  const box = useRef<HTMLDivElement>(null);

  // follow outside changes of the value; close the hit list on clicks outside the picker
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  /** Debounced search (250 ms, from 2 characters). */
  const search = (q: string) => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) return setHits([]);
    timer.current = window.setTimeout(() => api.search(q).then(setHits).catch(() => setHits([])), 250);
  };

  return (
    <div className="relative" ref={box}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          className="field !pl-8 !pr-8 font-mono !text-xs"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
            search(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {text && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg" onClick={() => { setText(''); onChange(''); setHits([]); }} aria-label="Leeren">
            <X size={14} />
          </button>
        )}
      </div>
      {open && hits.length > 0 && (
        <div className="picker-list absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-line shadow-2xl" style={{ background: 'var(--bg2)' }}>
          {hits.map((h) => (
            <button
              key={h.id}
              className="w-full text-left px-3 py-2 hover:bg-[var(--card-hover)] border-b border-line last:border-0"
              onClick={() => {
                onChange(h.id);
                setText(h.id);
                setOpen(false);
              }}
            >
              <div className="text-xs font-mono break-all">{h.id}</div>
              <div className="text-[0.7rem] text-muted">{[h.name, h.type, h.unit, h.write === false ? 'schreibgeschützt' : ''].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Grid of selectable icons. */
export function IconPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-auto p-1">
      {ICON_CHOICES.map((n) => (
        <button
          key={n}
          type="button"
          title={n}
          className={`w-9 h-9 rounded-xl grid place-items-center border transition-colors ${value === n ? 'bg-violet-500/30 border-violet-400 text-fg' : 'border-line text-muted hover:text-fg'}`}
          onClick={() => onChange(n)}
        >
          <Icon name={n} size={18} />
        </button>
      ))}
    </div>
  );
}
