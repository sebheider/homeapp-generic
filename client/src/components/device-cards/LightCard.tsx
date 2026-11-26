import type { CSSProperties } from 'react';
import { isOn } from '../../lib/store';
import type { Device } from '../../lib/types';
import { glowLevel } from '../../lib/iconFx';
import { clamp, toNum } from '../../lib/format';
import { Slider, Toggle } from '../ui';
import { useVals, useSet, Head } from './shared';

const SWATCHES = ['#ffd9a0', '#fff4e0', '#ffffff', '#ff8a3d', '#ff5d73', '#a78bfa', '#38bdf8', '#34d399'];

/** Light card. Supports on/off, brightness (dimmer), optional colour swatches and dimmer-only devices. */
export function LightCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const max = toNum(d.options.brightnessMax, 100);
  const hasDim = Boolean(d.states.brightness);
  // Dimmer-only devices (e.g. Homematic dimmers) have no on/off datapoint: "on" means brightness > 0
  const hasPower = Boolean(d.states.power);
  const on = hasPower ? isOn(v.power) : toNum(v.brightness) > 0;
  const bri = Math.round((toNum(v.brightness) / max) * 100);
  const toggle = (x: boolean) => {
    if (hasPower) set(d.states.power, x);
    else set(d.states.brightness, x ? max : 0);
  };
  // Scales a 0-100 % slider value to the device range; ranges of 0..1 must stay fractional
  const scale = (p: number) => (max <= 1 ? Math.round(p) / 100 * max : Math.round((p / 100) * max));
  const color = typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : null;
  // the light cone of the tile follows the brightness (full for lights without dimmer)
  const tone = { ['--tone' as string]: on && color ? color : undefined, ['--level' as string]: hasDim ? clamp(bri, 0, 100) / 100 : 1 } as CSSProperties;
  return (
    <div className={`glass tile tone-light p-4 flex flex-col gap-3 ${on ? 'active' : ''}`} style={tone}>
      <div className="cursor-pointer" onClick={() => toggle(!on)}>
        <Head
          d={d}
          icon="light"
          on={on}
          glow={on ? glowLevel(hasDim ? bri : null) : undefined}
          sub={on && hasDim ? `${bri} %` : on ? 'An' : 'Aus'}
          right={<Toggle checked={on} onChange={toggle} label={d.name} />}
        />
      </div>
      {hasDim && (
        <div className={`transition-all duration-300 ${on ? 'opacity-100' : 'opacity-40'}`}>
          <Slider
            value={bri}
            label="Helligkeit"
            onCommit={(p) => {
              set(d.states.brightness, scale(p));
              // dimming up a light that is off also switches it on
              if (hasPower && !on && p > 0) set(d.states.power, true);
            }}
          />
        </div>
      )}
      {d.states.color && on && (
        <div className="flex gap-2 flex-wrap">
          {SWATCHES.map((c) => (
            <button
              key={c}
              aria-label={`Farbe ${c}`}
              onClick={() => set(d.states.color, c)}
              className="color-swatch w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{ background: c, borderColor: color?.toLowerCase() === c ? '#fff' : 'transparent' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
