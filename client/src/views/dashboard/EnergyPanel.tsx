/** Energy panel of the overview: live flow, current figures and the curve of the last 24 hours. */
import { useRef } from 'react';
import { Activity } from 'lucide-react';
import { useStore } from '../../lib/store';
import { powerText } from '../../lib/format';
import { NO_STATES } from '../../lib/selectors';
import { useElementSize } from '../../lib/hooks';
import { EnergyFlow, energyFlowHeight, type EnergyValues } from '../../components/Energy';
import { AreaChart, useHistory, type ChartSeries } from '../../components/Charts';
import { FitBox, HudPanel } from '../../components/Hud';
import { C } from './colors';
import { Kpi } from './Kpi';

/**
 * Whether the flow of the compact energy panel gets more room with the figures beside it (a column of
 * about 6.5rem + gap) than below it (a row of about 3.6rem + margin) – true for wide, flat panels.
 */
function kpisBeside(w: number, h: number, flowH: number) {
  if (!w || !h) return false;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const below = Math.min(w / 400, (h - 4.1 * rem) / flowH);
  const beside = Math.min((w - 7.25 * rem) / 400, h / flowH);
  return beside > below;
}

/**
 * Energy flow, current figures and (not in the compact kiosk layout) the curve of the last 24 hours.
 * `side` (kiosk in portrait format): the figures stand in a column beside the flow, so the flow can use
 * the full height of the panel; other compact panels pick that arrangement themselves when it gives the
 * flow more room.
 */
export function EnergyPanel({ energy, compact = false, side = false }: { energy: EnergyValues; compact?: boolean; side?: boolean }) {
  const setView = useStore((s) => s.setView);
  const ids = useStore((s) => s.config?.energy?.states) ?? NO_STATES;
  const { data } = useHistory(compact ? [] : [ids.production, ids.consumption].filter(Boolean), 24, 120000);
  const fitRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(fitRef, { w: 0, h: 0 }, compact);
  const flowH = energyFlowHeight(energy.wallbox !== null);
  const beside = compact && (side || kpisBeside(area.w, area.h, flowH));
  const series: ChartSeries[] = [];
  if (ids.production) series.push({ id: 'pv', label: 'Erzeugung', color: C.solar, data: data[ids.production] ?? [] });
  if (ids.consumption) series.push({ id: 'home', label: 'Verbrauch', color: C.violet, data: data[ids.consumption] ?? [], line: true });
  const kpis = (
    <div className={beside ? 'kiosk-kpis grid grid-rows-3 gap-2 w-[6.5rem] shrink-0 content-center' : 'grid grid-cols-3 gap-2 mt-2'}>
      <Kpi label="Erzeugung" value={powerText(energy.pv)} color={C.solar} />
      <Kpi label="Verbrauch" value={powerText(energy.home)} color={C.violet} />
      <Kpi label={energy.grid >= 0 ? 'Netzbezug' : 'Einspeisung'} value={powerText(Math.abs(energy.grid))} color={C.cyan} />
    </div>
  );
  return (
    <HudPanel
      title="Energiefluss"
      color={C.cyan}
      right={<span className="inline-flex items-center gap-1"><Activity size={12} /> live</span>}
      onClick={() => setView('energy')}
      className={compact ? 'h-full min-h-0 flex flex-col' : 'h-full'}
      bodyClassName={compact ? 'flex-1 min-h-0 flex flex-col' : ''}
    >
      {compact ? (
        <div ref={fitRef} className={`flex-1 min-h-0 min-w-0 flex ${beside ? 'flex-row gap-3' : 'flex-col'}`}>
          {/* the flow is designed for 400 px width and scaled to the space that is left */}
          <FitBox baseW={400} baseH={flowH} className="flex-1 min-h-0 min-w-0">
            <EnergyFlow e={energy} bold />
          </FitBox>
          {kpis}
        </div>
      ) : (
        <>
          <EnergyFlow e={energy} />
          {kpis}
        </>
      )}
      {!compact && series.some((s) => s.data.length > 1) && (
        <div className="mt-3">
          <div className="text-[0.65rem] text-muted uppercase tracking-[0.18em] mb-1">Letzte 24 Stunden</div>
          <AreaChart series={series} compact unit="W" />
        </div>
      )}
    </HudPanel>
  );
}
