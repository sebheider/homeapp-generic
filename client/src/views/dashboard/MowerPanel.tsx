import { useMemo, useRef } from 'react';
import { useStateValues, useStore } from '../../lib/store';
import { LawnMower } from '../../lib/icons';
import { num } from '../../lib/format';
import { areaText, mowerStatus, parseTrack } from '../../lib/mower';
import { useElementSize } from '../../lib/hooks';
import { MowerMap, hasMapData, numOrNull } from '../../components/Mower';
import { HudPanel } from '../../components/Hud';
import type { Device } from '../../lib/types';
import { C } from './colors';
import { Kpi } from './Kpi';

/**
 * The robotic mower while it mows – in place of the energy flow: live map of the session, progress, battery
 * and the mowed area; a tap opens the mower page. `compact` (kiosk): fills its area, the figures beside the
 * map on wide panels and below it on narrow ones.
 */
export function MowerPanel({ d, compact = false }: { d: Device; compact?: boolean }) {
  const setView = useStore((s) => s.setView);
  const v = useStateValues(d.states);
  const status = mowerStatus(v.state);
  const track = useMemo(() => parseTrack(v.track), [v.track]);
  const progress = numOrNull(v.progress) ?? track?.percentage ?? null;
  const area = numOrNull(v.area) ?? track?.area ?? null;
  const battery = numOrNull(v.battery);
  const fitRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(fitRef, { w: 0, h: 0 }, compact);
  const beside = compact && size.w > size.h * 1.3;
  const kpis = (
    <div className={beside ? 'kiosk-kpis grid grid-rows-3 gap-2 w-[6.5rem] shrink-0 content-center' : 'grid grid-cols-3 gap-2 mt-2'}>
      <Kpi label="Fortschritt" value={progress == null ? '–' : `${num(progress, 0)} %`} color={status.color} />
      <Kpi label="Akku" value={battery == null ? '–' : `${num(battery, 0)} %`} color={battery != null && battery <= 20 ? C.alert : C.cyan} />
      <Kpi label="Gemäht" value={areaText(area)} color={C.amber} />
    </div>
  );
  const map = hasMapData(v) ? (
    <MowerMap d={d} values={v} className={compact ? 'mower-map-fill' : 'mower-map-overview'} />
  ) : (
    <span className="text-sm text-muted p-6">Noch keine Kartendaten</span>
  );
  return (
    <HudPanel
      title={<span className="inline-flex items-center gap-1.5"><LawnMower size={13} />{d.name}</span>}
      color={C.green}
      right={<span className="inline-flex items-center gap-1.5"><i className="w-1.5 h-1.5 rounded-full anim-breathe" style={{ background: status.color }} /> {status.label}</span>}
      onClick={() => setView('mower')}
      className={compact ? 'h-full min-h-0 flex flex-col' : 'h-full'}
      bodyClassName={compact ? 'flex-1 min-h-0 flex flex-col' : ''}
    >
      {compact ? (
        <div ref={fitRef} className={`flex-1 min-h-0 min-w-0 flex ${beside ? 'flex-row gap-3' : 'flex-col'}`}>
          <div className="mower-ground relative flex-1 min-h-0 min-w-0">{map}</div>
          {kpis}
        </div>
      ) : (
        <>
          <div className="mower-ground">{map}</div>
          {kpis}
        </>
      )}
    </HudPanel>
  );
}
