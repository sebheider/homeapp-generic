/**
 * Weekly time windows (weekdays + from / to) used by the pop-up rules and the kiosk schedules.
 * Windows may run over midnight; `from` equal to `to` means the whole day.
 */
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { TimeWindow } from '../../lib/types';
import { DeleteButton, toggleItem } from './shared';

/** Weekdays in German order (Monday first) with their JavaScript day numbers. */
export const WEEKDAYS: { day: number; label: string }[] = [
  { day: 1, label: 'Mo' },
  { day: 2, label: 'Di' },
  { day: 3, label: 'Mi' },
  { day: 4, label: 'Do' },
  { day: 5, label: 'Fr' },
  { day: 6, label: 'Sa' },
  { day: 0, label: 'So' },
];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Toggle chip used for kinds, weekdays and cameras. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`chip ${on ? 'on' : ''}`} onClick={onClick}>{children}</button>;
}

/** Explanation below the time inputs. */
export const timeWindowHint = (w: { from: string; to: string }) =>
  w.from === w.to ? 'Ganztägig (von = bis)' : w.from > w.to ? 'Über Mitternacht: der Zeitraum nach 0 Uhr gehört zum Wochentag, an dem er begann' : 'Bis-Zeit gilt nicht mehr';

/** Weekday chips of one window. */
export function DayChips({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((w) => <Chip key={w.day} on={days.includes(w.day)} onClick={() => onChange(toggleItem(days, w.day))}>{w.label}</Chip>)}
    </div>
  );
}

/** From / to inputs of one window with the explanation below. */
export function TimeRange({ value, onChange }: { value: { from: string; to: string }; onChange: (p: { from?: string; to?: string }) => void }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <input className="field !w-32 tabular-nums" type="time" value={value.from} onChange={(e) => onChange({ from: e.target.value || '00:00' })} aria-label="Von" />
        <span className="text-muted">–</span>
        <input className="field !w-32 tabular-nums" type="time" value={value.to} onChange={(e) => onChange({ to: e.target.value || '00:00' })} aria-label="Bis" />
      </div>
      <p className="text-[0.7rem] text-muted mt-1">{timeWindowHint(value)}</p>
    </>
  );
}

/** Editable list of windows with an add button (`template` is the new window). */
export function TimeWindowList({ windows, onChange, template, addLabel, empty }: {
  windows: TimeWindow[];
  onChange: (windows: TimeWindow[]) => void;
  template: TimeWindow;
  addLabel: string;
  empty: string;
}) {
  const update = (i: number, p: Partial<TimeWindow>) => onChange(windows.map((w, j) => (j === i ? { ...w, ...p } : w)));
  return (
    <div className="flex flex-col gap-2">
      {windows.length === 0 && <p className="text-xs text-muted">{empty}</p>}
      {windows.map((w, i) => (
        <div key={i} className="rounded-2xl border border-line p-3 flex flex-wrap items-start gap-x-6 gap-y-2">
          <div>
            <label className="lbl">Wochentage</label>
            <DayChips days={w.days} onChange={(days) => update(i, { days })} />
          </div>
          <div>
            <label className="lbl">Uhrzeit von – bis</label>
            <TimeRange value={w} onChange={(p) => update(i, p)} />
          </div>
          <div className="ml-auto self-center"><DeleteButton onClick={() => onChange(windows.filter((_, j) => j !== i))} label="Zeitraum löschen" /></div>
        </div>
      ))}
      <button type="button" className="btn !py-1.5 !text-xs self-start" onClick={() => onChange([...windows, { ...template, days: [...template.days] }])}><Plus size={14} /> {addLabel}</button>
    </div>
  );
}
