import { DoorOpen, Flame } from 'lucide-react';
import { useStore } from '../../lib/store';
import { clamp, num } from '../../lib/format';
import { OUTSIDE, type Overview } from '../../lib/overview';
import { NX, tempColor } from '../../components/HomeTwin';
import { Panel } from './Panel';

/** Temperatures of all rooms on a cold … hot bar with the setpoint as tick. */
export function Climate({ o }: { o: Overview }) {
  const setView = useStore((s) => s.setView);
  const rows = o.rooms.filter((r) => r.temp != null && !OUTSIDE.test(r.room.name));
  if (!rows.length) return null;
  const x = (v: number) => `${(clamp((v - 16) / 10, 0, 1) * 100).toFixed(1)}%`;
  return (
    <Panel title="Raumklima" right={o.avgTemp != null ? `Ø ${num(o.avgTemp, 1)} °C` : undefined} to="climate" className="nx-grow">
      <div className="nx-list">
        {rows.map((r) => {
          const c = tempColor(r.temp);
          const humid = r.humidity != null && r.humidity > 65;
          return (
            <button key={r.room.id} className="nx-row" style={{ color: c }} onClick={() => setView('rooms', r.room.id)}>
              <span className="rn">
                <span>{r.room.name}</span>
                {r.heating && <Flame size={13} color={NX.orange} className="shrink-0" />}
                {r.open.length > 0 && <DoorOpen size={13} color={NX.amber} className="shrink-0" />}
              </span>
              <span className="nx-bar">{r.target != null && <u style={{ left: x(r.target) }} />}<i style={{ left: x(r.temp!) }} /></span>
              <span className="rt">{num(r.temp!, 1)}°</span>
              <span className="rh" style={humid ? { color: NX.amber } : undefined}>{r.humidity != null ? `${num(r.humidity, 0)} %` : r.co2 != null ? `${num(r.co2, 0)} ppm` : ''}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
