/**
 * Animated weather symbol (SVG): rotating sun rays, drifting clouds, falling rain / snow, flashing lightning.
 * With the WMO code and the wind speed it also shows showers (sun or moon behind the cloud), heavy rain,
 * icy drops, hail and gusts. The animations are plain CSS (see `wx-*` in index.css) so they cost almost nothing.
 */
import { useEffect, useId, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react';
import type { Condition } from '../lib/weather';
import { weatherExtras } from '../lib/iconFx';
import { moonAppearance } from '../lib/moon';
import { useStore } from '../lib/store';

/** Cloud outline in the 64×64 view box. */
const CLOUD = 'M20 47h25a9.5 9.5 0 0 0 1.7-18.85A14 14 0 0 0 19.6 31.4 8 8 0 0 0 20 47z';

/** Sun disc with eight rotating rays. */
function Sun_({ cx, cy, r, scale = 1 }: { cx: number; cy: number; r: number; scale?: number }) {
  return (
    <g>
      <g className="wx-rays" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={cx} y1={cy - r - 4 * scale} x2={cx} y2={cy - r - 9 * scale} stroke="#fbbf24" strokeWidth={3 * scale} strokeLinecap="round" transform={`rotate(${i * 45} ${cx} ${cy})`} />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={r} fill="url(#wx-sun)" />
    </g>
  );
}

/** Approximate illuminated disc, oriented to the configured location's horizon. */
function Moon_({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const clipId = `moon-lit-${useId().replaceAll(':', '')}`;
  const latitude = useStore((s) => s.config?.weather?.latitude);
  const longitude = useStore((s) => s.config?.weather?.longitude);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const starOffset = Math.min(r, 13);
  const { illuminated: lit, brightLimbAngle, parallacticAngle } = moonAppearance(now, latitude, longitude);
  const terminator = 1 - 2 * lit;
  const rx = Math.max(0.01, Math.abs(terminator) * r);
  const innerSweep = terminator >= 0 ? 1 : 0;
  const litPath = `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx} ${r} 0 0 ${innerSweep} ${cx} ${cy - r}Z`;
  const fullMoon = lit > 0.998;
  const rotation = (parallacticAngle - brightLimbAngle) * 180 / Math.PI - 90;
  return (
    <g className="wx-bob">
      <circle cx={cx} cy={cy} r={r} fill="url(#wx-moon-dark)" stroke="#cbd5e1" strokeOpacity=".35" strokeWidth=".7" />
      {lit > 0.002 && (
        <>
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              {fullMoon ? <circle cx={cx} cy={cy} r={r} /> : <path d={litPath} transform={`rotate(${rotation} ${cx} ${cy})`} />}
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <circle cx={cx} cy={cy} r={r} fill="url(#wx-moon)" />
            <g fill="#a47756" opacity=".22" transform={`rotate(${parallacticAngle * 180 / Math.PI} ${cx} ${cy})`}>
              <circle cx={cx - r * 0.3} cy={cy - r * 0.27} r={r * 0.16} />
              <circle cx={cx + r * 0.25} cy={cy + r * 0.28} r={r * 0.22} />
              <circle cx={cx - r * 0.1} cy={cy + r * 0.62} r={r * 0.1} />
            </g>
          </g>
        </>
      )}
      <circle cx={cx + starOffset * 1.25} cy={cy - starOffset * 0.9} r="1.4" fill="#e2e8f0" className="wx-twinkle" />
      <circle cx={cx + starOffset * 0.55} cy={cy - starOffset * 1.35} r="1" fill="#e2e8f0" className="wx-twinkle" style={{ animationDelay: '-1.1s' }} />
    </g>
  );
}

/** Drifting cloud, optionally darker (rain / thunder) and offset. */
function CloudShape({ dark = false, dx = 0, dy = 0 }: { dark?: boolean; dx?: number; dy?: number }) {
  return (
    <g className="wx-drift" transform={`translate(${dx} ${dy})`}>
      <path d={CLOUD} fill={dark ? 'url(#wx-cloud-dark)' : 'url(#wx-cloud)'} />
    </g>
  );
}

/** Gust lines blowing past on the left (wind from `WINDY_KMH`). */
function Gusts() {
  return (
    <g stroke="#e2e8f0" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".85">
      {[[2, 30, 16], [5, 37, 13], [1, 44, 11]].map(([x, y, w], i) => (
        <path key={y} d={`M${x} ${y}h${w}`} className="wx-gust" style={{ animationDelay: `${-i * 0.55}s` }} />
      ))}
    </g>
  );
}

/**
 * Large animated symbol for a weather condition (day / night variants for clear, partly cloudy and
 * showers); `code` (WMO) and `wind` (km/h) add details like hail, icy drops and gusts.
 */
export function WeatherIcon({ kind, isDay = true, size = 96, code, wind }: { kind: Condition; isDay?: boolean; size?: number; code?: number | null; wind?: number | null }) {
  const x = weatherExtras(code, wind);
  // sun or moon behind the cloud of showers
  const peek = x.showers && (isDay ? <Sun_ cx={44} cy={17} r={7} scale={0.6} /> : <Moon_ cx={44} cy={18} r={7.5} />);
  const drops = kind === 'rain' ? (x.heavy ? [20, 27, 34, 41, 48] : [24, 33, 42]) : [26, 36, 46];
  const dropColor = x.freezing ? '#a5f3fc' : '#38bdf8';
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-hidden className="wx-icon shrink-0 overflow-visible" style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.25))' }}>
      <defs>
        <radialGradient id="wx-sun" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </radialGradient>
        <linearGradient id="wx-moon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1d8" />
          <stop offset="1" stopColor="#d9aa7a" />
        </linearGradient>
        <radialGradient id="wx-moon-dark" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#334155" />
          <stop offset="1" stopColor="#0f172a" />
        </radialGradient>
        <linearGradient id="wx-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#b6c2d3" />
        </linearGradient>
        <linearGradient id="wx-cloud-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
      </defs>

      {kind === 'clear' && (isDay ? <Sun_ cx={32} cy={32} r={12} /> : <Moon_ cx={30} cy={32} r={13} />)}

      {kind === 'partly' && (
        <>
          {isDay ? <Sun_ cx={23} cy={24} r={8.5} scale={0.75} /> : <Moon_ cx={26} cy={22} r={11} />}
          <CloudShape dx={5} dy={4} />
        </>
      )}

      {kind === 'cloudy' && (
        <>
          <g opacity=".75"><CloudShape dark dx={-8} dy={-6} /></g>
          <CloudShape dx={2} dy={2} />
        </>
      )}

      {kind === 'fog' && (
        <>
          <CloudShape dy={-6} />
          {[48, 54, 60].map((y, i) => (
            <line key={y} x1={14 + i * 3} y1={y} x2={50 - i * 3} y2={y} stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" className="wx-slide" style={{ animationDelay: `${-i * 0.9}s` }} />
          ))}
        </>
      )}

      {(kind === 'drizzle' || kind === 'rain') && (
        <>
          {peek}
          <CloudShape dark={kind === 'rain'} dy={-6} />
          {drops.map((dx, i) => (
            <line key={dx} x1={dx} y1="44" x2={dx - 3} y2={kind === 'rain' ? 53 : 50} stroke={dropColor} strokeWidth={kind === 'rain' ? 3 : 2.2} strokeLinecap="round" className="wx-fall" style={{ animationDelay: `${-i * (x.heavy ? 0.26 : 0.4)}s` }} />
          ))}
        </>
      )}

      {kind === 'snow' && (
        <>
          {peek}
          <CloudShape dy={-6} />
          {(x.heavy ? [19, 27, 35, 43, 50] : [23, 33, 43]).map((dx, i) => (
            <circle key={dx} cx={dx} cy="47" r="2.6" fill="#e0f2fe" className="wx-snow" style={{ animationDelay: `${-i * (x.heavy ? 0.45 : 0.7)}s` }} />
          ))}
        </>
      )}

      {kind === 'thunder' && (
        <>
          <CloudShape dark dy={-7} />
          {x.hail && [21, 46].map((dx, i) => (
            <circle key={dx} cx={dx} cy="46" r="2.3" fill="#f1f5f9" stroke="#94a3b8" strokeWidth=".6" className="wx-hail" style={{ animationDelay: `${-i * 0.5}s` }} />
          ))}
          <polygon points="33,36 25,50 32,50 29,60 41,44 34,44 38,36" fill="#fde047" stroke="#f59e0b" strokeWidth="1" strokeLinejoin="round" className="wx-flash" />
        </>
      )}

      {x.windy && <Gusts />}
    </svg>
  );
}

/** Small icon (lucide) for lists such as the hourly strip. */
export function MiniWeatherIcon({ kind, isDay = true, size = 22, color }: { kind: Condition; isDay?: boolean; size?: number; color?: string }) {
  const p = { size, color, strokeWidth: 1.8 };
  switch (kind) {
    case 'clear':
      return isDay ? <Sun {...p} /> : <Moon {...p} />;
    case 'partly':
      return isDay ? <CloudSun {...p} /> : <CloudMoon {...p} />;
    case 'cloudy':
      return <Cloud {...p} />;
    case 'fog':
      return <CloudFog {...p} />;
    case 'drizzle':
      return <CloudDrizzle {...p} />;
    case 'rain':
      return <CloudRain {...p} />;
    case 'snow':
      return <CloudSnow {...p} />;
    case 'thunder':
      return <CloudLightning {...p} />;
  }
}
