/** Live gauges of the overview (solar, battery, autarky, room climate, lights, heat pump). */
import type { ReactElement, ReactNode } from 'react';
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Fan, Leaf, Lightbulb, Sun, Thermometer, Zap } from 'lucide-react';
import { useStateValues, useStore } from '../../lib/store';
import { HEATPUMP_IDLE_W, heatPumpRunning, heatPumpState, heatPumpWatts } from '../../lib/heatpump';
import { clamp, num, powerText, toNum } from '../../lib/format';
import { NO_STATES } from '../../lib/selectors';
import type { Overview } from '../../lib/overview';
import { IDLE_W, type EnergyValues } from '../../components/Energy';
import { ArcGauge, HudPanel, LiquidGauge, SegmentRing } from '../../components/Hud';
import type { Device } from '../../lib/types';
import { C } from './colors';

/** Panel of one gauge with an icon before its title; in the compact (kiosk) layout it fills its grid cell and centres the gauge. */
function GaugeTile({ title, icon, color, onClick, compact, children }: { title: ReactNode; icon?: ReactNode; color: string; onClick: () => void; compact?: boolean; children: ReactNode }) {
  return (
    <HudPanel
      title={icon ? <span className="inline-flex items-center gap-1.5">{icon}{title}</span> : title}
      color={color}
      onClick={onClick}
      className={compact ? 'h-full min-h-0 flex flex-col' : ''}
      bodyClassName={compact ? 'flex-1 min-h-0 flex items-center justify-center' : ''}
    >
      {children}
    </HudPanel>
  );
}

/** Battery symbol for the charge state (while charging: with a flash). */
function BatteryIcon({ soc, charging }: { soc: number | null; charging: boolean }) {
  const Shape = charging ? BatteryCharging : soc == null || soc >= 75 ? BatteryFull : soc >= 35 ? BatteryMedium : soc >= 10 ? BatteryLow : BatteryWarning;
  return <Shape size={13} />;
}

/**
 * Heat pump: COP as arc (or the flow temperature if there is no COP datapoint). While the compressor runs
 * the fan turns (in the title and large inside the ring) and the caption shows the electrical draw.
 */
function HeatPumpGauge({ d, compact }: { d: Device; compact?: boolean }) {
  const v = useStateValues(d.states ?? NO_STATES);
  const setView = useStore((s) => s.setView);
  const cop = v.cop != null ? toNum(v.cop) : null;
  const flow = v.flowTemp != null ? toNum(v.flowTemp) : null;
  const running = heatPumpRunning(d, v);
  const watts = d.states?.electricPower ? heatPumpWatts(d, v.electricPower) : null;
  const draw = watts != null && (running || watts > HEATPUMP_IDLE_W) ? (
    <span className="gauge-em"><Zap size={12} className="shrink-0" style={{ color: C.solar }} />{powerText(watts)}</span>
  ) : null;
  const state = running ? 'läuft' : heatPumpState(d, v, running);
  const parts: (string | null)[] = cop != null ? [state, flow != null ? `VL ${num(flow, 0)} °C` : null] : ['Vorlauf', state];
  const text = parts.filter(Boolean).join(' · ');
  const fan = <Fan size={13} className={running ? 'anim-spin-fast' : ''} />;
  const backdrop = running ? <Fan strokeWidth={1.25} className="anim-spin" style={{ color: C.warm, opacity: 0.28, animationDuration: '1.6s' }} /> : undefined;
  // the draw comes first: a one-line caption (narrow panels) cuts off the end
  const label = <>{draw && <>{draw}<span className="gauge-sep"> · </span></>}{text}</>;
  return (
    <GaugeTile title="Wärmepumpe" icon={fan} color={C.warm} onClick={() => setView('climate')} compact={compact}>
      {cop != null ? (
        <ArcGauge value={cop} max={6} digits={1} unit="COP" colors={['#f97316', C.solar]} label={label} backdrop={backdrop} />
      ) : (
        <ArcGauge value={flow} min={20} max={60} digits={1} unit="°C" colors={['#f97316', C.heat]} label={label} backdrop={backdrop} />
      )}
    </GaugeTile>
  );
}

/**
 * Panels of the live gauges; only what the installation has. Their keys name the gauge ("solar",
 * "battery", "autarky", "climate", "lights", "heatpump"). `compact`: the panel fills its area.
 */
export function useGaugeTiles(o: Overview, energy: EnergyValues, compact = false): ReactElement[] {
  const setView = useStore((s) => s.setView);
  const tiles: ReactElement[] = [];
  if (energy.enabled) {
    const kw = energy.pv / 1000;
    // scale in steps of 5 kW that leaves some head room
    const max = Math.max(5, Math.ceil((kw * 1.15) / 5) * 5);
    tiles.push(
      <GaugeTile
        key="solar"
        title="Solar"
        icon={<Sun size={13} className={energy.pv > IDLE_W ? 'anim-spin' : ''} style={energy.pv > IDLE_W ? { animationDuration: '14s' } : undefined} />}
        color={C.solar}
        onClick={() => setView('energy')}
        compact={compact}
      >
        <ArcGauge value={kw} max={max} digits={2} unit="kW" colors={['#fb923c', C.solar]} label={energy.dailyYield != null ? `Heute ${num(energy.dailyYield, 1)} kWh` : `Skala bis ${max} kW`} />
      </GaugeTile>,
    );
    if (energy.soc != null) {
      const charging = energy.battery < -IDLE_W;
      const discharging = energy.battery > IDLE_W;
      tiles.push(
        <GaugeTile key="battery" title="Batterie" icon={<BatteryIcon soc={energy.soc} charging={charging} />} color={C.green} onClick={() => setView('energy')} compact={compact}>
          <LiquidGauge percent={energy.soc} color={C.green} charging={charging} label={charging ? `lädt ${powerText(-energy.battery)}` : discharging ? `liefert ${powerText(energy.battery)}` : 'Ruhezustand'} />
        </GaugeTile>,
      );
    }
    // own supply share of the house load, if the installation does not report it itself
    const autarky = energy.autarky ?? (energy.home > 0 ? clamp((1 - Math.max(0, energy.grid) / energy.home) * 100, 0, 100) : 100);
    tiles.push(
      <GaugeTile key="autarky" title="Autarkie" icon={<Leaf size={13} />} color={C.cyan} onClick={() => setView('energy')} compact={compact}>
        <ArcGauge
          value={autarky}
          max={100}
          unit="%"
          colors={['#6366f1', C.cyan]}
          label={energy.grid > IDLE_W ? `Netzbezug ${powerText(energy.grid)}` : energy.grid < -IDLE_W ? `Einspeisung ${powerText(-energy.grid)}` : 'Netz ausgeglichen'}
        />
      </GaugeTile>,
    );
  }
  if (o.avgTemp != null) {
    tiles.push(
      <GaugeTile key="climate" title="Raumklima" icon={<Thermometer size={13} />} color={C.heat} onClick={() => setView('climate')} compact={compact}>
        <ArcGauge value={o.avgTemp} min={14} max={28} digits={1} unit="°C" colors={['#38bdf8', C.heat]} label={o.avgHumidity != null ? `Ø Luftfeuchte ${num(o.avgHumidity, 0)} %` : `Ø aus ${o.tempCount} Räumen`} />
      </GaugeTile>,
    );
  }
  if (o.lights.length) {
    tiles.push(
      <GaugeTile key="lights" title="Licht" icon={<Lightbulb size={13} />} color={C.amber} onClick={() => setView('lights')} compact={compact}>
        <SegmentRing on={o.lightsOn.length} total={o.lights.length} color={C.amber} label={o.lightsOn.length ? 'eingeschaltet' : 'alles aus'} />
      </GaugeTile>,
    );
  }
  if (o.heatpump) tiles.push(<HeatPumpGauge key="heatpump" d={o.heatpump} compact={compact} />);
  return tiles;
}

/** Gauges of the standard overview (the own start page can still place every gauge as a widget). */
const OVERVIEW_GAUGES = ['battery', 'lights', 'heatpump'];

/** The gauges of the standard overview; only what the installation has. */
export function useOverviewGauges(o: Overview, energy: EnergyValues, compact = false) {
  return useGaugeTiles(o, energy, compact).filter((t) => OVERVIEW_GAUGES.includes(String(t.key)));
}

/** Live gauges; only what the installation has is shown. `compact`: kiosk grid that fills its area. */
export function GaugeGrid({ o, energy, compact = false }: { o: Overview; energy: EnergyValues; compact?: boolean }) {
  const tiles = useOverviewGauges(o, energy, compact);
  if (!tiles.length) return null;
  if (compact) {
    // kiosk: up to three gauges side by side in one row, more in rows of two or three that share the height
    const cols = tiles.length <= 3 ? tiles.length : tiles.length === 4 ? 2 : 3;
    return (
      <div className="kiosk-gauges grid gap-3 h-full min-h-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(0, 1fr)' }}>
        {tiles}
      </div>
    );
  }
  return <div className={`grid gap-3 sm:gap-4 ${GAUGE_COLUMNS[Math.min(tiles.length, 6)]}`}>{tiles}</div>;
}

/** Grid columns per number of gauges, so the rows are always filled evenly. */
const GAUGE_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1 max-w-xs',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6',
};
