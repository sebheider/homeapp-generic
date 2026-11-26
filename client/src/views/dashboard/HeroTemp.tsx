/** Outside temperature of the hero with its temperature effects (ice crystals, hot air, heat shimmer). */
import { useStore } from '../../lib/store';
import { useSvgId } from '../../lib/hooks';
import { temperatureLook } from '../../lib/ambience';
import { AnimatedNumber } from '../../components/Hud';

/**
 * Positions (% of the value), sizes (em of the value) and delays of the ice crystals around a frosty temperature.
 * `tight` stays close to the digits, for the kiosk hero and the widget: above them is little room (12 px padding).
 */
const CRYSTALS = {
  spread: [
    { x: -9, y: -16, size: 0.26, delay: 0 },
    { x: 34, y: -24, size: 0.15, delay: -1.1 },
    { x: 74, y: -12, size: 0.21, delay: -2.3 },
    { x: -5, y: 70, size: 0.17, delay: -0.6 },
    { x: 56, y: 84, size: 0.18, delay: -1.7 },
  ],
  tight: [
    { x: -8, y: -6, size: 0.22, delay: 0 },
    { x: 40, y: -8, size: 0.14, delay: -1.1 },
    { x: 80, y: -4, size: 0.18, delay: -2.3 },
    { x: -6, y: 68, size: 0.16, delay: -0.6 },
    { x: 58, y: 80, size: 0.17, delay: -1.7 },
  ],
};

/** Six-armed ice crystal. */
function IceCrystal({ x, y, size, delay }: (typeof CRYSTALS.spread)[number]) {
  return (
    <svg className="temp-crystal" viewBox="-10 -10 20 20" style={{ left: `${x}%`, top: `${y}%`, width: `${size}em`, height: `${size}em`, animationDelay: `${delay}s` }} aria-hidden>
      <g stroke="#e0f2fe" strokeWidth="1.4" strokeLinecap="round" fill="none">
        {[0, 60, 120].map((a) => <path key={a} transform={`rotate(${a})`} d="M0-9V9M0-5.5l-2.6-2.6M0-5.5l2.6-2.6M0 5.5l-2.6 2.6M0 5.5l2.6 2.6" />)}
      </g>
    </svg>
  );
}

/** Wavy lines of hot air rising through and above a hot temperature. */
function HeatHaze() {
  return (
    <svg className="temp-haze" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
      {[16, 44, 72, 96].map((x, i) => <path key={x} d={`M${x} 60q-5-7.5 0-15t0-15t0-15t0-15`} style={{ animationDelay: `${-i * 0.65}s` }} />)}
    </svg>
  );
}

/**
 * Outside temperature of the hero: white fading into a colour along the scale (ice blue at 0 °C, cyan,
 * green, yellow, orange towards 30 °C); below 0 °C ice blue with twinkling ice crystals, from 30 °C red with
 * rising hot air and – on the highest effects level – a real heat shimmer (SVG displacement).
 */
export function HeroTemp({ temp, unitClass, tight = false }: { temp: number | null; unitClass: string; tight?: boolean }) {
  const look = temperatureLook(temp ?? 15);
  const shimmer = useStore((s) => s.display.effects === 'high') && look.kind === 'heat';
  const fid = useSvgId('heat');
  return (
    <span className={`hero-temp temp-${look.kind}`} style={{ ['--temp' as string]: look.color }}>
      {look.kind === 'frost' && CRYSTALS[tight ? 'tight' : 'spread'].map((c) => <IceCrystal key={`${c.x}:${c.y}`} {...c} />)}
      {look.kind === 'heat' && <HeatHaze />}
      {shimmer && (
        <svg width="0" height="0" className="absolute" aria-hidden>
          <filter id={fid} x="-5%" y="-10%" width="110%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves="1" seed="4">
              <animate attributeName="baseFrequency" dur="2.6s" values="0.012 0.08;0.016 0.12;0.012 0.08" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <span className="hero-temp-value" style={shimmer ? { filter: `url(#${fid}) drop-shadow(0 0 14px color-mix(in srgb, var(--temp) 65%, transparent))` } : undefined}>
        {temp == null ? '–' : <AnimatedNumber value={temp} digits={1} />}
      </span>
      <span className={`temp-unit ${unitClass} font-semibold ml-1 align-top`}>°C</span>
    </span>
  );
}
