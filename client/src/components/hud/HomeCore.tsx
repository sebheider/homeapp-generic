import { House, Siren, TriangleAlert } from 'lucide-react';
import { useSvgId } from '../../lib/hooks';
import { toneStyle, polar, arcPath } from './shared';

/**
 * "Home Core": the eye-catcher in the middle of the overview. Rotating rings with ticks and arcs,
 * a radar sweep, orbiting satellites and a pulsing core with the house symbol. Its colour shows the
 * state of the house (OK / warning / alarm); on a warning or alarm a warning symbol replaces the house,
 * shock waves run outwards and the core pulses faster.
 */
export function HomeCore({ color, label, sub, size = 'clamp(210px, 64vw, 290px)', state = 'ok' }: { color: string; label: string; sub?: string; size?: string; state?: 'ok' | 'warning' | 'alarm' }) {
  const gid = useSvgId('core');
  const ticks = Array.from({ length: 72 }, (_, i) => i);
  const alert = state !== 'ok';
  const StateIcon = state === 'alarm' ? Siren : state === 'warning' ? TriangleAlert : House;
  return (
    <div className={`hud-core relative shrink-0 mx-auto ${alert ? `is-${state}` : ''}`} style={{ ...toneStyle(color), width: size, height: size }}>
      <div className="hud-core-sweep" aria-hidden />
      {alert && (
        <>
          <span className="hud-core-shock" aria-hidden />
          <span className="hud-core-shock" aria-hidden />
        </>
      )}
      <svg viewBox="0 0 260 260" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id={gid}>
            <stop offset="0" stopColor={color} stopOpacity="0.95" />
            <stop offset="0.55" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* outer ring with four brackets */}
        <g className="hud-spin hud-spin-60" style={{ transformOrigin: '130px 130px' }}>
          <circle cx="130" cy="130" r="126" fill="none" stroke="var(--tone)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="2 10" />
          {[0, 90, 180, 270].map((a) => <path key={a} d={arcPath(130, 130, 126, a - 12, a + 12)} fill="none" stroke="var(--tone)" strokeWidth="2.5" strokeLinecap="round" />)}
        </g>
        {/* tick ring, turning the other way */}
        <g className="hud-spin hud-spin-90 hud-spin-rev" style={{ transformOrigin: '130px 130px' }}>
          {ticks.map((i) => {
            const [x1, y1] = polar(130, 130, i % 6 ? 108 : 103, i * 5);
            const [x2, y2] = polar(130, 130, 112, i * 5);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--tone)" strokeOpacity={i % 6 ? 0.35 : 0.8} strokeWidth="1.2" />;
          })}
        </g>
        {/* three fast arcs */}
        <g className="hud-spin hud-spin-14" style={{ transformOrigin: '130px 130px' }}>
          {[0, 120, 240].map((a) => <path key={a} d={arcPath(130, 130, 94, a, a + 70)} fill="none" stroke="var(--tone)" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />)}
        </g>
        {/* orbit with satellites */}
        <g className="hud-spin hud-spin-9" style={{ transformOrigin: '130px 130px' }}>
          <circle cx="130" cy="130" r="78" fill="none" stroke="var(--tone)" strokeOpacity="0.2" strokeWidth="1" />
          <circle cx="208" cy="130" r="4" fill="var(--tone)" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          <circle cx="52" cy="130" r="2.5" fill="var(--tone)" />
          <circle cx="130" cy="52" r="2" fill="#fff" opacity="0.8" />
        </g>
        {/* pulsing core */}
        <circle cx="130" cy="130" r="64" fill={`url(#${gid})`} className="hud-core-pulse" style={{ transformOrigin: '130px 130px' }} />
        <circle cx="130" cy="130" r="46" fill="var(--bg2)" fillOpacity="0.55" stroke="var(--tone)" strokeOpacity="0.7" strokeWidth="1.5" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
        <div className="flex flex-col items-center leading-tight">
          <StateIcon size={alert ? 32 : 30} className={state === 'alarm' ? 'anim-alarm' : ''} style={{ color, filter: `drop-shadow(0 0 ${alert ? 12 : 8}px ${color})` }} />
          <div className={`mt-1 font-bold uppercase tracking-[0.18em] ${alert ? 'text-[0.85rem] hud-glow-text' : 'text-[0.72rem]'}`} style={{ color }}>{label}</div>
          {sub && <div className="text-[0.65rem] text-muted mt-0.5 max-w-[6.5rem]">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
