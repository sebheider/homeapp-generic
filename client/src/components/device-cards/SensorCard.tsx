import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning } from 'lucide-react';
import { isOn } from '../../lib/store';
import type { Device } from '../../lib/types';
import { SENSOR_KINDS } from '../../lib/deviceTypes';
import { num, NO_VALUE } from '../../lib/format';
import { LevelBar, Ticker } from '../ui';
import { useVals, Head } from './shared';

/** State texts `[active, inactive]` of boolean sensor kinds. */
const BOOLEAN_SENSOR_LABELS: Record<string, [string, string]> = {
  motion: ['Bewegung erkannt', 'Keine Bewegung'],
  presence: ['Anwesend', 'Abwesend'],
  door: ['Offen', 'Geschlossen'],
  window: ['Offen', 'Geschlossen'],
  smoke: ['ALARM', 'OK'],
  water: ['Wasser erkannt', 'Trocken'],
};

/** Units whose values are shown without decimals. */
const INTEGER_UNITS = ['%', 'ppm', 'W'];

/** Sensor card: numeric sensors show value + unit, boolean sensors (door, window, motion, ...) show a state text. */
export function SensorCard({ d }: { d: Device }) {
  const v = useVals(d);
  const kind = SENSOR_KINDS[d.options.kind || 'generic'] || SENSOR_KINDS.generic;
  if (kind.boolean) {
    const active = isOn(v.value);
    const key = d.options.kind as string;
    const icon = key === 'door' ? (active ? 'dooropen' : 'doorclosed') : kind.icon;
    const alarm = active && (key === 'smoke' || key === 'water');
    // opening doors and windows swing open once, alarms shake and send out rings
    const iconClass = !active ? '' : key === 'motion' ? 'anim-bob' : key === 'door' || key === 'window' ? 'anim-swing-open' : alarm ? 'anim-alarm' : key === 'presence' ? 'anim-breathe' : '';
    return (
      <div className={`glass tile tone-${kind.tone} p-4 ${active ? 'active' : ''}`}>
        <Head d={d} icon={icon} on={active} iconClass={iconClass} bubbleClass={alarm ? 'anim-ring' : ''} sub={(BOOLEAN_SENSOR_LABELS[key] || ['An', 'Aus'])[active ? 0 : 1]} />
      </div>
    );
  }
  const unit = d.options.unit || kind.unit;
  const value = v.value == null ? NO_VALUE : typeof v.value === 'number' ? num(v.value, INTEGER_UNITS.includes(kind.unit) ? 0 : 1) : String(v.value);
  // percentages (humidity, battery level) also get a level bar
  const level = unit === '%' && v.value != null && Number.isFinite(Number(v.value)) ? Number(v.value) : null;
  const low = d.options.kind === 'battery' && level !== null && level <= 15;
  return (
    <div className={`glass tile ${low ? 'tone-alert' : `tone-${kind.tone}`} p-4 flex flex-col gap-3`}>
      <Head
        d={d}
        icon={kind.icon}
        iconNode={d.options.kind === 'battery' && level !== null ? <BatteryIcon level={level} /> : undefined}
        on={low}
        right={
          <div className="text-right leading-none">
            <span className="text-2xl font-bold tabular-nums"><Ticker value={value} /></span>
            <span className="text-sm text-muted ml-1">{unit}</span>
          </div>
        }
      />
      {level !== null && <LevelBar value={level} label={d.name} />}
    </div>
  );
}

/** Battery symbol matching the charge level (warning symbol at 15 % and below). */
function BatteryIcon({ level }: { level: number }) {
  const C = level <= 15 ? BatteryWarning : level <= 40 ? BatteryLow : level <= 75 ? BatteryMedium : BatteryFull;
  return <C size={22} />;
}
