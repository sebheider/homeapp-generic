import { useStore } from '../../lib/store';
import { switchAllOff } from '../../lib/selectors';
import type { Overview } from '../../lib/overview';
import { NX } from '../../components/HomeTwin';
import { Panel } from './Panel';

/** One segment per lamp, the lamps that are on (not when `compact`) and "Alle aus". */
export function Lights({ o, compact }: { o: Overview; compact: boolean }) {
  const set = useStore((s) => s.set);
  if (!o.lights.length) return null;
  const on = new Set(o.lightsOn.map((d) => d.id));
  const names = o.lightsOn.map((d) => d.name);
  const lamps = <div className={`nx-lamps ${compact ? '!mt-0 flex-1 min-w-0' : ''}`}>{o.lights.slice(0, 16).map((d) => <i key={d.id} className={on.has(d.id) ? 'on' : ''} title={d.name} />)}</div>;
  const off = <button className="nx-btn" disabled={!names.length} onClick={() => switchAllOff(o.lightsOn, set)}>Alle aus</button>;
  return (
    <Panel title="Licht" right={`${o.lightsOn.length} / ${o.lights.length} AN`} to="lights" color={o.lightsOn.length ? NX.amber : NX.cyan}>
      {compact ? (
        <div className="nx-lrow !mt-[11px]">{lamps}{off}</div>
      ) : (
        <>
          {lamps}
          <div className="nx-lrow">
            <span>{names.length ? `${names.slice(0, 3).join(' · ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : 'Alle Lichter sind aus'}</span>
            {off}
          </div>
        </>
      )}
    </Panel>
  );
}
