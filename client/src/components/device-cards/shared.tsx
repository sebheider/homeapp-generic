/** Building blocks shared by the device cards: value hooks, card header, chip group and dial colours. */
import type { CSSProperties, ReactNode } from 'react';
import { useStore, useStateValues } from '../../lib/store';
import type { ChoiceOption, Device } from '../../lib/types';
import { Icon } from '../../lib/icons';
import { num, toNum } from '../../lib/format';

/** Reads the values of all datapoints of a device as `{ key: value }` (shallow compared, so cards re-render only on real changes). */
export const useVals = (d: Device) => useStateValues(d.states);

const useRoomName = (id: string) => useStore((s) => s.config?.rooms.find((r) => r.id === id)?.name);
export const useSet = () => useStore((s) => s.set);

/** Dial colours while heating / cooling. */
export const HEAT_TONE = '#fb7185';
export const COOL_TONE = '#38bdf8';

/** Temperature with one decimal ("21,5"). */
export const temp = (v: unknown) => num(toNum(v), 1);

/**
 * Card header: icon bubble, device name, sub line (defaults to the room name) and an optional control on the right.
 * `iconNode` replaces the default icon of the type (a custom icon of the device still wins).
 * `glow` (0…1) lights a halo behind the icon (lights by brightness, running devices); `bubbleClass`
 * animates the bubble itself (e.g. the alarm ring).
 */
export function Head({ d, icon, iconNode, on, right, sub, iconClass, glow, bubbleClass = '' }: { d: Device; icon: string; iconNode?: ReactNode; on?: boolean; right?: ReactNode; sub?: ReactNode; iconClass?: string; glow?: number; bubbleClass?: string }) {
  const room = useRoomName(d.room);
  return (
    <div className="flex items-center gap-3">
      <div className={`icon-bubble ${on ? 'on' : ''} ${glow != null ? 'halo' : ''} ${bubbleClass}`} style={glow != null ? ({ ['--glow' as string]: glow } as CSSProperties) : undefined}>
        {iconNode && !d.icon ? iconNode : <Icon name={d.icon || icon} size={22} className={iconClass} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate leading-tight">{d.name}</div>
        <div className="text-xs text-muted truncate mt-0.5">{sub ?? room}</div>
      </div>
      {right}
    </div>
  );
}

/** Row of selectable chips (operating modes, fan levels); `current` is compared as string. */
export function ChipGroup({ options, current, onSelect, className = 'flex gap-2 flex-wrap', children }: {
  options: (ChoiceOption & { icon?: string })[];
  current: string;
  onSelect: (value: string) => void;
  className?: string;
  /** Content placed in front of the chips (e.g. an icon). */
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      {children}
      {options.map((m) => (
        <button key={m.value} className={`chip ${current === String(m.value) ? 'on' : ''}`} onClick={() => onSelect(m.value)}>
          {m.icon && <Icon name={m.icon} size={14} />}
          {m.label}
        </button>
      ))}
    </div>
  );
}
