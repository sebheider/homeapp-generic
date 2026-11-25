/**
 * Device cards.
 *
 * Every device type of the configuration (light, switch, thermostat, blind, sensor,
 * climate, heat pump, robotic mower) has its own card. A card receives the device definition,
 * subscribes to exactly the datapoints it needs and writes through `store.set()`.
 * `DeviceCard` picks the right card for a device; `DeviceTiles` / `DeviceSection`
 * render lists of cards for the pages.
 */
import { memo, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, ChevronRight, Fan, Flame, Minus, Plus, Square, ChevronUp, ChevronDown, Waves, Droplets, Zap } from 'lucide-react';
import { useStore, useStateValues, isOn } from '../lib/store';
import type { ChoiceOption, Device, ModeOption } from '../lib/types';
import { Icon } from '../lib/icons';
import { SENSOR_KINDS } from '../lib/deviceTypes';
import { heatPumpRunning, heatPumpWatts } from '../lib/heatpump';
import { glowLevel, runningIconClass } from '../lib/iconFx';
import { clamp, num, NO_VALUE, powerText, toNum } from '../lib/format';
import { isDriving, mowerStatus, suggestedCommands, type MowerCommand } from '../lib/mower';
import { Dial, LevelBar, Rise, Slider, Stagger, Ticker, Toggle, useStaticVisuals } from './ui';
import { toneStyle } from './Hud';
import { MowerCommandButtons, numOrNull } from './Mower';

/** Reads the values of all datapoints of a device as `{ key: value }` (shallow compared, so cards re-render only on real changes). */
const useVals = (d: Device) => useStateValues(d.states);

const useRoomName = (id: string) => useStore((s) => s.config?.rooms.find((r) => r.id === id)?.name);
const useSet = () => useStore((s) => s.set);

/** Dial colours while heating / cooling. */
const HEAT_TONE = '#fb7185';
const COOL_TONE = '#38bdf8';

/** Temperature with one decimal ("21,5"). */
const temp = (v: unknown) => num(toNum(v), 1);

/**
 * Card header: icon bubble, device name, sub line (defaults to the room name) and an optional control on the right.
 * `iconNode` replaces the default icon of the type (a custom icon of the device still wins).
 * `glow` (0…1) lights a halo behind the icon (lights by brightness, running devices); `bubbleClass`
 * animates the bubble itself (e.g. the alarm ring).
 */
function Head({ d, icon, iconNode, on, right, sub, iconClass, glow, bubbleClass = '' }: { d: Device; icon: string; iconNode?: ReactNode; on?: boolean; right?: ReactNode; sub?: ReactNode; iconClass?: string; glow?: number; bubbleClass?: string }) {
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
function ChipGroup({ options, current, onSelect, className = 'flex gap-2 flex-wrap', children }: {
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

const SWATCHES = ['#ffd9a0', '#fff4e0', '#ffffff', '#ff8a3d', '#ff5d73', '#a78bfa', '#38bdf8', '#34d399'];

/** Light card. Supports on/off, brightness (dimmer), optional colour swatches and dimmer-only devices. */
function LightCard({ d }: { d: Device }) {
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

/** Plug / switch: the whole tile toggles; shows the consumption while on (if mapped). */
function SwitchCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const on = isOn(v.power);
  const w = d.states.consumption ? toNum(v.consumption) : null;
  return (
    <div className={`glass tile interactive tone-green p-4 ${on ? 'active' : ''}`} onClick={() => set(d.states.power, !on)}>
      <Head
        d={d}
        icon="plug"
        on={on}
        // a plug that draws power (or has no meter) counts as running: its icon moves and glows brighter
        glow={on ? (w === null || w > 0 ? 0.8 : 0.35) : undefined}
        iconClass={on && (w === null || w > 0) ? runningIconClass(d.icon || 'plug') : ''}
        sub={w !== null && on ? `${powerText(w)}${w > 0 ? ' · läuft' : ''}` : on ? 'An' : 'Aus'}
        right={<Toggle checked={on} onChange={(x) => set(d.states.power, x)} label={d.name} />}
      />
    </div>
  );
}

/** Radiator thermostat: setpoint dial; the tile glows and the flame flickers while the valve is open. */
function ThermostatCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const min = toNum(d.options.min, 5);
  const max = toNum(d.options.max, 30);
  const step = toNum(d.options.step, 0.5);
  const target = toNum(v.target, min);
  const valve = toNum(v.valve);
  const heating = valve > 5;
  return (
    <div className={`glass tile ${heating ? 'tone-heat active' : 'tone-warm'} p-4 flex flex-col gap-2`}>
      <Head d={d} icon="flame" on={heating} iconClass={heating ? 'anim-flicker' : ''} glow={heating ? glowLevel(valve) : undefined} sub={heating ? `Heizt · Ventil ${Math.round(valve)} %` : undefined} />
      <Dial
        value={target}
        min={min}
        max={max}
        step={step}
        onChange={(x) => set(d.states.target, x)}
        sub={d.states.current ? `Ist ${temp(v.current)} °C` : 'Soll'}
        tone={heating ? HEAT_TONE : '#fb923c'}
      />
    </div>
  );
}

/** Blind card. Convention: 100 % = open, 0 % = closed (option `invert` flips this for other hardware). */
function BlindCard({ d }: { d: Device }) {
  const still = useStaticVisuals();
  const v = useVals(d);
  const set = useSet();
  const invert = Boolean(d.options.invert);
  const raw = clamp(toNum(v.position), 0, 100);
  const open = invert ? 100 - raw : raw;
  const write = (openPct: number) => set(d.states.position, invert ? 100 - openPct : openPct);
  const closedH = 100 - open;
  return (
    <div className="glass tile tone-cool p-4 flex flex-col gap-3">
      <Head d={d} icon="blinds" on={open < 100} sub={open === 100 ? 'Offen' : open === 0 ? 'Geschlossen' : `${Math.round(open)} % offen`} />
      <div className="flex gap-4 items-center">
        {/* small window with an animated slat curtain */}
        <div className="relative w-16 h-20 rounded-lg overflow-hidden border border-line flex-none" style={{ background: 'linear-gradient(180deg,#7dd3fc55,#38bdf822)' }}>
          <motion.div
            className="absolute inset-x-0 top-0"
            animate={{ height: `${closedH}%` }}
            initial={false}
            transition={still ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
            style={{ background: 'repeating-linear-gradient(180deg,#8b97b8 0 5px,#6b7798 5px 7px)' }}
          />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <Slider value={Math.round(open)} label="Öffnung" onCommit={write} throttleMs={400} />
          <div className="flex gap-2">
            <button className="btn flex-1 !p-2" onClick={() => write(100)} aria-label="Öffnen"><ChevronUp size={18} /></button>
            {/* "stop" re-sends the current position, which halts most actuators */}
            <button className="btn flex-1 !p-2" onClick={() => write(Math.round(open))} aria-label="Stopp"><Square size={14} /></button>
            <button className="btn flex-1 !p-2" onClick={() => write(0)} aria-label="Schließen"><ChevronDown size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
function SensorCard({ d }: { d: Device }) {
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

/** Air conditioner card: power, operating mode, setpoint dial (one setpoint per mode if configured) and fan level. */
function ClimateCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const on = isOn(v.power);
  const min = toNum(d.options.min, 16);
  const max = toNum(d.options.max, 30);
  const step = toNum(d.options.step, 1);
  const modes: ModeOption[] = d.options.modes || [];
  const fans: ChoiceOption[] = d.options.fanModes || [];
  const mode = String(v.mode ?? '');
  const activeMode = modes.find((m) => String(m.value) === mode);
  // Units like Daikin keep one setpoint per operating mode (targetHeat / targetCool / targetAuto).
  // If modes define their own setpoint, the shared one is not used (no dial for modes without one).
  const targetKey = activeMode?.target && d.states[activeMode.target] ? activeMode.target : modes.some((m) => m.target) ? null : d.states.target ? 'target' : null;
  const isHeat = activeMode?.icon === 'flame' || mode === 'heat';
  const tone = isHeat ? 'tone-heat' : activeMode?.icon === 'droplets' || mode === 'dry' ? 'tone-violet' : 'tone-cool';
  const current = d.states.current ? temp(v.current) : null;
  return (
    <div className={`glass tile ${tone} p-4 flex flex-col gap-3 ${on ? 'active' : ''}`}>
      <Head
        d={d}
        // while running the icon shows the operating mode (flame flickers, snowflake turns, fan spins)
        icon={on && activeMode?.icon ? activeMode.icon : 'snowflake'}
        on={on}
        glow={on ? 0.7 : undefined}
        iconClass={on ? runningIconClass(activeMode?.icon || 'snowflake') : ''}
        sub={on ? `${activeMode?.label ?? 'An'}${current !== null ? ` · Ist ${current} °C` : ''}` : current !== null ? `Aus · Raum ${current} °C` : 'Aus'}
        right={<Toggle checked={on} onChange={(x) => set(d.states.power, x)} label={d.name} />}
      />
      {targetKey && (
        <div className={`transition-opacity ${on ? '' : 'opacity-40 pointer-events-none'}`}>
          <Dial value={toNum(v[targetKey], min)} min={min} max={max} step={step} onChange={(x) => set(d.states[targetKey], x)} sub="Soll" size={150} tone={isHeat ? HEAT_TONE : COOL_TONE} />
        </div>
      )}
      {modes.length > 0 && d.states.mode && <ChipGroup options={modes} current={mode} onSelect={(x) => set(d.states.mode, x)} />}
      {fans.length > 0 && d.states.fan && (
        <ChipGroup options={fans} current={String(v.fan)} onSelect={(x) => set(d.states.fan, x)} className="flex gap-2 flex-wrap items-center">
          <Fan size={15} className={`text-muted ${on ? 'anim-spin-fast' : ''}`} />
        </ChipGroup>
      )}
    </div>
  );
}

/** Small key-figure box of the heat pump card. */
function Metric({ label, value, unit, icon }: { label: string; value: ReactNode; unit?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl p-3 bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] border border-line">
      <div className="text-[0.7rem] uppercase tracking-wider text-muted flex items-center gap-1.5">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">
        {value}
        {unit && <span className="text-sm font-medium text-muted ml-1">{unit}</span>}
      </div>
    </div>
  );
}

/** Heat pump: operating state, key figures (only those that are mapped), operating mode chips and hot water setpoint. */
function HeatPumpCard({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const has = (k: string) => Boolean(d.states[k]);
  const running = heatPumpRunning(d, v);
  const on = has('power') ? isOn(v.power) : true;
  const t = (k: string) => (v[k] == null ? NO_VALUE : temp(v[k]));
  const dhwMin = toNum(d.options.dhwMin, 35);
  const dhwMax = toNum(d.options.dhwMax, 65);
  const modes: ModeOption[] = Array.isArray(d.options.modes) ? d.options.modes : [];
  const bumpDhw = (delta: number) => set(d.states.dhwTarget, clamp(toNum(v.dhwTarget) + delta, dhwMin, dhwMax));
  return (
    <div className={`glass tile tone-warm p-4 flex flex-col gap-4 ${running ? 'active' : ''}`}>
      <Head
        d={d}
        icon="heater"
        on={running}
        glow={running ? 0.85 : undefined}
        sub={!on ? 'Aus' : running ? 'Verdichter läuft' : 'Bereit'}
        right={has('power') ? <Toggle checked={on} onChange={(x) => set(d.states.power, x)} label={d.name} /> : undefined}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {has('flowTemp') && <Metric label="Vorlauf" value={t('flowTemp')} unit="°C" icon={<Waves size={12} />} />}
        {has('returnTemp') && <Metric label="Rücklauf" value={t('returnTemp')} unit="°C" icon={<Waves size={12} />} />}
        {has('outsideTemp') && <Metric label="Außen" value={t('outsideTemp')} unit="°C" />}
        {has('electricPower') && <Metric label="Strom" value={powerText(heatPumpWatts(d, v.electricPower))} icon={<Zap size={12} />} />}
        {has('heatPower') && <Metric label="Wärme" value={powerText(heatPumpWatts(d, v.heatPower))} icon={<Flame size={12} />} />}
        {has('cop') && <Metric label="COP" value={t('cop')} />}
      </div>
      {has('mode') && modes.length > 0 && <ChipGroup options={modes} current={String(v.mode)} onSelect={(x) => set(d.states.mode, x)} />}
      {has('dhwTemp') && (
        <div className="rounded-2xl p-3 border border-line flex items-center gap-3 bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
          <div className="icon-bubble on !w-10 !h-10"><Droplets size={18} /></div>
          <div className="flex-1">
            <div className="text-xs text-muted">Warmwasser</div>
            <div className="font-bold tabular-nums text-lg">
              {t('dhwTemp')} °C
              {has('dhwTarget') && <span className="text-sm text-muted font-medium"> / Soll {t('dhwTarget')} °C</span>}
            </div>
          </div>
          {has('dhwTarget') && (
            <div className="flex items-center gap-1.5">
              <button className="btn btn-icon" onClick={() => bumpDhw(-1)} aria-label="Weniger"><Minus size={16} /></button>
              <button className="btn btn-icon" onClick={() => bumpDhw(1)} aria-label="Mehr"><Plus size={16} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Robotic mower: state and battery, the mowing progress while a session runs and the one or two commands
 * that fit the state; a tap on the head opens the mower page with map and all controls.
 */
function MowerCard({ d }: { d: Device }) {
  const v = useVals(d);
  const setView = useStore((s) => s.setView);
  const status = mowerStatus(v.state);
  const driving = isDriving(status.activity);
  const battery = d.states.battery ? numOrNull(v.battery) : null;
  const progress = d.states.progress ? numOrNull(v.progress) : null;
  const suggested = suggestedCommands(status.activity);
  const only: MowerCommand[] = suggested.length ? suggested : ['start', 'home'];
  return (
    <div className={`glass tile p-4 flex flex-col gap-3 ${driving || status.problem ? 'active' : ''}`} style={toneStyle(status.color)}>
      <div className="cursor-pointer" onClick={() => setView('mower')}>
        <Head
          d={d}
          icon="mower"
          on={driving || status.problem}
          glow={driving ? 0.7 : undefined}
          iconClass={driving ? 'anim-bob' : status.problem ? 'anim-alarm' : ''}
          sub={battery !== null ? `${status.label} · Akku ${Math.round(battery)} %` : status.label}
          right={<ChevronRight size={18} className="text-muted" aria-label="Mähroboter-Seite öffnen" />}
        />
      </div>
      {progress !== null && (driving || status.activity === 'paused') && <LevelBar value={progress} label="Fortschritt" />}
      <MowerCommandButtons d={d} activity={status.activity} compact only={only} />
    </div>
  );
}

/** Renders the card matching the device type. */
export const DeviceCard = memo(function DeviceCard({ device }: { device: Device }) {
  switch (device.type) {
    case 'light': return <LightCard d={device} />;
    case 'switch': return <SwitchCard d={device} />;
    case 'thermostat': return <ThermostatCard d={device} />;
    case 'blind': return <BlindCard d={device} />;
    case 'sensor': return <SensorCard d={device} />;
    case 'climate': return <ClimateCard d={device} />;
    case 'heatpump': return <HeatPumpCard d={device} />;
    case 'mower': return <MowerCard d={device} />;
    default: return null;
  }
});

/** Small tile of a light or switch: icon, name and state; a tap switches it (no slider or colours). */
function SmallSwitch({ d }: { d: Device }) {
  const v = useVals(d);
  const set = useSet();
  const isLight = d.type === 'light';
  const max = toNum(d.options.brightnessMax, 100);
  // like the light card: dimmer-only devices count as "on" while their brightness is above 0
  const viaDimmer = isLight && !d.states.power && Boolean(d.states.brightness);
  const on = viaDimmer ? toNum(v.brightness) > 0 : isOn(v.power);
  const bri = isLight && d.states.brightness ? Math.round((toNum(v.brightness) / max) * 100) : null;
  const toggle = () => (viaDimmer ? set(d.states.brightness, on ? 0 : max) : set(d.states.power, !on));
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`glass tile interactive ${isLight ? 'tone-light' : 'tone-green'} !rounded-2xl px-2.5 py-2 flex items-center gap-2 text-left min-w-0 ${on ? 'active' : ''}`}
      style={isLight ? ({ ['--level' as string]: bri != null ? clamp(bri, 0, 100) / 100 : 1 } as CSSProperties) : undefined}
      onClick={toggle}
    >
      <span className={`icon-bubble ${on ? 'on halo' : ''} !w-8 !h-8 !rounded-xl shrink-0`} style={on ? ({ ['--glow' as string]: isLight ? glowLevel(bri) : 0.6 } as CSSProperties) : undefined}>
        <Icon name={d.icon || (isLight ? 'light' : 'plug')} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight line-clamp-2 break-words">{d.name}</span>
        <span className="block text-[0.7rem] text-muted truncate">{on ? (bri != null ? `${bri} %` : 'An') : 'Aus'}</span>
      </span>
    </button>
  );
}

/**
 * Device card in the chosen size: `small` shows lights and switches as small tiles that only
 * switch (all other devices keep their full card).
 */
export function DeviceCardSized({ device, small }: { device: Device; small: boolean }) {
  return small && (device.type === 'light' || device.type === 'switch') && (device.states.power || device.states.brightness) ? <SmallSwitch d={device} /> : <DeviceCard device={device} />;
}

/** Device cards wrapped in entrance animations; place inside a `Stagger` or grid container. */
export function DeviceTiles({ devices }: { devices: Device[] }) {
  return (
    <>
      {devices.map((d) => <Rise key={d.id}><DeviceCard device={d} /></Rise>)}
    </>
  );
}

/**
 * Page section with a small muted heading (icon + title, optionally the number of devices) and a grid of
 * device cards (`wide` for large system cards). Used by the rooms, lights and climate pages.
 */
export function DeviceSection({ icon, title, devices, wide = false, showCount = false }: { icon: ReactNode; title: string; devices: Device[]; wide?: boolean; showCount?: boolean }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3 text-muted">
        {icon}
        <h2 className="section-title">{title}</h2>
        {showCount && <span className="text-xs">· {devices.length} {devices.length === 1 ? 'Gerät' : 'Geräte'}</span>}
      </div>
      <Stagger className={wide ? 'grid-wide' : 'grid-cards'}>
        <DeviceTiles devices={devices} />
      </Stagger>
    </section>
  );
}
