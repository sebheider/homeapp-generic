/** Energy page (loaded on demand, it pulls in the chart code). */
import { useState, type ReactNode } from 'react';
import { Battery, Gauge, Leaf, PlugZap, Sun, Zap } from 'lucide-react';
import { num, power } from '../lib/format';
import { AreaChart, Legend, type ChartSeries } from '../components/Charts';
import { BatteryBar, EnergyFlow, IDLE_W, useEnergy, useEnergySeries } from '../components/Energy';
import { Empty, OpenSettingsButton, PageHeader, Panel, Rise, StatTile, Stagger } from '../components/ui';

/** Selectable history ranges in hours. */
const RANGES = [6, 24, 48];

/** Key figure tile of the energy page (larger value than on the dashboard). */
function Kpi(props: { icon: ReactNode; label: string; value: string; unit: string; tone: string; sub?: string }) {
  return <StatTile {...props} valueClassName="text-2xl" />;
}

/** History chart card with title and legend; nothing without series. */
function ChartCard({ title, series, unit, format, height }: { title: string; series: ChartSeries[]; unit: string; format: (v: number) => string; height?: number }) {
  if (!series.length) return null;
  return (
    <Rise>
      <Panel title={title} right={series.length > 1 ? <Legend items={series} /> : undefined}>
        <AreaChart series={series} unit={unit} height={height} format={format} />
      </Panel>
    </Rise>
  );
}

/** Power values (W) are shown as kW. */
const kw = (v: number) => num(v / 1000, 1);
const percent = (v: number) => `${Math.round(v)}`;

/** Energy page: animated flow diagram, key figures and history charts. */
export function EnergyView() {
  const e = useEnergy();
  const [hours, setHours] = useState(24);
  const { power: powerSeries, flow: flowSeries, soc: socSeries } = useEnergySeries(hours);

  if (!e.enabled) {
    return (
      <div>
        <PageHeader title="Energie" />
        <Empty icon={<Zap size={28} />} title="Energiesystem nicht eingerichtet" text="Hinterlege in den Einstellungen die Datenpunkte deiner PV-Anlage, des Speichers und des Netzanschlusses.">
          <OpenSettingsButton />
        </Empty>
      </div>
    );
  }

  const pvP = power(e.pv);
  const homeP = power(e.home);
  const gridP = power(Math.abs(e.grid));
  const batP = power(Math.abs(e.battery));

  return (
    <div>
      <PageHeader title="Energie" subtitle={e.autarky !== null ? `${num(e.autarky, 0)} % Autarkie` : 'Live-Übersicht'}>
        {RANGES.map((h) => (
          <button key={h} className={`chip ${hours === h ? 'on' : ''}`} onClick={() => setHours(h)}>{h} h</button>
        ))}
      </PageHeader>

      <Stagger className="flex flex-col gap-4">
        <div className="grid xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] gap-4">
          <Rise>
            <div className="glass p-4 sm:p-5 h-full flex flex-col justify-center">
              <EnergyFlow e={e} />
              {e.soc !== null && (
                <div className="mt-5 flex items-center gap-3 text-sm">
                  <Battery size={18} className="text-emerald-400" />
                  <div className="flex-1"><BatteryBar soc={e.soc} charging={e.battery < -IDLE_W} /></div>
                  <b className="tabular-nums">{Math.round(e.soc)} %</b>
                </div>
              )}
            </div>
          </Rise>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
            <Rise><Kpi tone="energy" icon={<Sun size={22} />} label="Erzeugung" value={pvP.value} unit={pvP.unit} sub={e.dailyYield !== null ? `heute ${num(e.dailyYield, 1)} kWh` : undefined} /></Rise>
            <Rise><Kpi tone="violet" icon={<Zap size={22} />} label="Verbrauch" value={homeP.value} unit={homeP.unit} /></Rise>
            {e.hasGrid && <Rise><Kpi tone={e.grid < 0 ? 'cool' : 'heat'} icon={<PlugZap size={22} />} label={e.grid < 0 ? 'Einspeisung' : 'Netzbezug'} value={gridP.value} unit={gridP.unit} /></Rise>}
            {e.hasBattery && <Rise><Kpi tone="green" icon={<Battery size={22} />} label={e.battery < -IDLE_W ? 'Batterie lädt' : e.battery > IDLE_W ? 'Batterie entlädt' : 'Batterie'} value={batP.value} unit={batP.unit} sub={e.soc !== null ? `${Math.round(e.soc)} % geladen` : undefined} /></Rise>}
            {e.autarky !== null && <Rise><Kpi tone="green" icon={<Leaf size={22} />} label="Autarkie" value={num(e.autarky, 0)} unit="%" /></Rise>}
            {e.selfConsumption !== null && <Rise><Kpi tone="cool" icon={<Gauge size={22} />} label="Eigenverbrauch" value={num(e.selfConsumption, 0)} unit="%" /></Rise>}
          </div>
        </div>

        <ChartCard title="Erzeugung & Verbrauch" series={powerSeries} unit="kW" format={kw} />
        <ChartCard title="Netz & Batterie" series={flowSeries} unit="kW" format={kw} />
        <ChartCard title="Batterie-Ladestand" series={socSeries} unit="%" height={160} format={percent} />
      </Stagger>
    </div>
  );
}
