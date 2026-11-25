/**
 * Waste collection: bin symbol and the panel with the next pickups (dashboard widget).
 * The dates come from the server (ICS calendar, see server waste.js).
 */
import { Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { useNow } from '../lib/hooks';
import { daysUntil, nextPickup, pickupDay } from '../lib/waste';
import type { WasteItem } from '../lib/types';
import { HudPanel, toneStyle } from './Hud';

/** Bin in the colour of its kind of waste. */
export function WasteBin({ item, size = 14 }: { item: Pick<WasteItem, 'color' | 'label'>; size?: number }) {
  return (
    <span className="inline-grid place-items-center rounded-md shrink-0" style={{ background: `${item.color}33`, color: item.color, width: size + 8, height: size + 8 }} title={item.label}>
      <Trash2 size={size} />
    </span>
  );
}

/** List of the next pickups; today / tomorrow are highlighted. */
export function WastePanel({ count = 4 }: { count?: number }) {
  const waste = useStore((s) => s.waste);
  const now = new Date(useNow(60_000));
  if (!waste?.enabled) {
    return (
      <HudPanel title="Müllabfuhr" color="#94a3b8">
        <p className="text-sm text-muted">Kein Abfuhrkalender eingerichtet (Einstellungen → Müllabfuhr).</p>
      </HudPanel>
    );
  }
  const next = nextPickup(waste.upcoming, now);
  const days = next ? waste.upcoming.slice(waste.upcoming.indexOf(next), waste.upcoming.indexOf(next) + Math.max(1, count)) : [];
  return (
    <HudPanel title="Müllabfuhr" color="#a3e635" right={waste.demo ? 'Beispiel' : undefined}>
      {waste.error && <p className="text-xs text-amber-400 mb-2">{waste.error}</p>}
      {days.length === 0 && <p className="text-sm text-muted">Keine weiteren Termine im Kalender.</p>}
      <ul className="grid gap-2">
        {days.map((d) => {
          const soon = daysUntil(d.date, now) <= 1;
          return (
            <li key={d.date} className={`flex items-center gap-3 rounded-xl px-2.5 py-1.5 ${soon ? 'bg-[color-mix(in_srgb,var(--tone)_14%,transparent)]' : ''}`} style={toneStyle(soon ? '#fbbf24' : '#94a3b8')}>
              <span className={`w-24 shrink-0 text-sm ${soon ? 'font-bold text-[var(--tone)]' : 'text-muted'}`}>{pickupDay(d.date, now)}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                {d.items.map((i) => (
                  <span key={i.key} className="inline-flex items-center gap-1.5 text-sm min-w-0">
                    <WasteBin item={i} size={13} />
                    <span className="truncate">{i.label}</span>
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </HudPanel>
  );
}
