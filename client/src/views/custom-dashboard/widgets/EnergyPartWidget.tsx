import type { ReactNode } from 'react';
import { num, power } from '../../../lib/format';
import { WIDGETS, widgetPart, type Widget } from '../../../lib/widgets';
import { BatteryBar, IDLE_W, useEnergySeries, type EnergyValues } from '../../../components/Energy';
import { AreaChart, Legend } from '../../../components/Charts';
import { HudPanel } from '../../../components/Hud';
import { C } from '../../dashboard/colors';
import { str } from '../shared';
import { WidgetNote } from './WidgetNote';

/** Large value of an energy detail with unit and an optional line below. */
function EnergyValue({ value, unit, sub, children }: { value: string; unit: string; sub?: string; children?: ReactNode }) {
  return (
    <div>
      <div className="text-4xl font-bold tracking-tight tabular-nums leading-none hud-glow-text whitespace-nowrap">
        {value}<span className="text-base text-muted font-semibold ml-1">{unit}</span>
      </div>
      {sub && <div className="text-xs text-muted mt-1.5 truncate">{sub}</div>}
      {children}
    </div>
  );
}

/** One figure or history curve of the energy page (`part`: see ENERGY_PARTS in lib/widgets.ts). */
export function EnergyPartWidget({ energy: e, w }: { energy: EnergyValues; w: Widget }) {
  const part = str(w.options.part);
  const chart = part.startsWith('chart');
  const series = useEnergySeries(chart ? 24 : 0);
  const label = widgetPart(w)?.label ?? WIDGETS.energyPart.label;
  if (!e.enabled) return <WidgetNote type="energyPart" title={label} text="Kein Energiesystem eingerichtet." />;
  const missing = <WidgetNote type="energyPart" title={label} text="Für diese Anzeige fehlt der Datenpunkt (Einstellungen → Energie)." />;
  const kw = (v: number) => num(v / 1000, 1);
  if (chart) {
    const list = part === 'chartPower' ? series.power : part === 'chartFlow' ? series.flow : series.soc;
    if (!list.length) return missing;
    return (
      <HudPanel title={label} color={C.cyan} right={list.length > 1 ? <Legend items={list} /> : '24 h'}>
        {list.some((s) => s.data.length > 1) ? (
          part === 'chartSoc' ? <AreaChart series={list} unit="%" height={160} format={(v) => `${Math.round(v)}`} /> : <AreaChart series={list} unit="kW" format={kw} />
        ) : (
          <p className="text-sm text-muted">Noch kein Verlauf vorhanden.</p>
        )}
      </HudPanel>
    );
  }
  const pct = (v: number | null, color: string, sub?: string) =>
    v == null ? missing : <HudPanel title={label} color={color}><EnergyValue value={num(v, 0)} unit="%" sub={sub} /></HudPanel>;
  switch (part) {
    case 'production': {
      const p = power(e.pv);
      return <HudPanel title={label} color={C.solar}><EnergyValue {...p} sub={e.dailyYield != null ? `Heute ${num(e.dailyYield, 1)} kWh` : undefined} /></HudPanel>;
    }
    case 'consumption': {
      const p = power(e.home);
      return <HudPanel title={label} color={C.violet}><EnergyValue {...p} sub="Hausverbrauch" /></HudPanel>;
    }
    case 'grid': {
      if (!e.hasGrid) return missing;
      const p = power(Math.abs(e.grid));
      return <HudPanel title={label} color={C.cyan}><EnergyValue {...p} sub={e.grid > IDLE_W ? 'Netzbezug' : e.grid < -IDLE_W ? 'Einspeisung' : 'Ausgeglichen'} /></HudPanel>;
    }
    case 'battery': {
      if (!e.hasBattery && e.soc == null) return missing;
      const charging = e.battery < -IDLE_W;
      const p = power(Math.abs(e.battery));
      const state = charging ? 'lädt' : e.battery > IDLE_W ? 'entlädt' : 'Ruhezustand';
      return (
        <HudPanel title={label} color={C.green}>
          {e.soc != null ? (
            <EnergyValue value={num(e.soc, 0)} unit="%" sub={e.hasBattery ? `${state}${state === 'Ruhezustand' ? '' : ` · ${p.value} ${p.unit}`}` : undefined}>
              <div className="mt-2"><BatteryBar soc={e.soc} charging={charging} /></div>
            </EnergyValue>
          ) : (
            <EnergyValue {...p} sub={state} />
          )}
        </HudPanel>
      );
    }
    case 'autarky':
      return pct(e.autarky, C.green, 'Anteil aus eigener Erzeugung');
    case 'selfConsumption':
      return pct(e.selfConsumption, C.cyan, 'Selbst genutzter Solarstrom');
    default:
      return <WidgetNote type="energyPart" title={label} text="Unbekannte Anzeige – bitte über ⚙ neu wählen." />;
  }
}
