import { Sunrise, Sunset } from 'lucide-react';
import { clamp } from '../../lib/format';
import { fmtDuration, fmtTime } from '../../lib/weather';
import type { WeatherData } from '../../lib/api';
import { CardTitle } from './shared';

/** Sun path between sunrise and sunset with the current sun position, day length and time to the next sunrise / sunset. */
export function SunCard({ web, nowSec }: { web: WeatherData; nowSec: number }) {
  if (!web.daily[0]?.sunrise || !web.daily[0].sunset) return null;
  return (
    <div className="glass tone-energy p-4 sm:p-5 h-full">
      <CardTitle icon={<Sunrise size={15} />}>Sonne</CardTitle>
      <SunContent web={web} nowSec={nowSec} />
    </div>
  );
}

/** Content of the sun card (also a widget of the own start page). */
export function SunContent({ web, nowSec }: { web: WeatherData; nowSec: number }) {
  const d0 = web.daily[0];
  const d1 = web.daily[1];
  const tz = web.timezone;
  if (!d0?.sunrise || !d0.sunset) return null;
  const { sunrise, sunset } = d0;
  const prog = clamp((nowSec - sunrise) / (sunset - sunrise), 0, 1);
  const up = nowSec >= sunrise && nowSec <= sunset;
  // point on the half ellipse (centre 150/125, radii 120/95) for a day progress of 0..1
  const point = (p: number) => ({ x: 150 - 120 * Math.cos(Math.PI * p), y: 125 - 95 * Math.sin(Math.PI * p) });
  const sun = point(prog);
  const ARC = 'M30 125A120 95 0 0 1 270 125';
  const status = up
    ? `Noch ${fmtDuration(sunset - nowSec)} Tageslicht`
    : `Sonnenaufgang in ${fmtDuration((nowSec < sunrise ? sunrise : d1?.sunrise ?? sunrise + 86400) - nowSec)}`;

  return (
    <div>
      <svg viewBox="0 0 300 140" className="w-full max-w-sm mx-auto" aria-hidden>
        <defs>
          <linearGradient id="sun-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbbf24" stopOpacity=".28" />
            <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sun-dot" cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor="#fef3c7" />
            <stop offset="1" stopColor="#f59e0b" />
          </radialGradient>
        </defs>
        <path d={`${ARC}Z`} fill="url(#sun-fill)" opacity={up ? 1 : 0.35} />
        <path d={ARC} fill="none" stroke="var(--line)" strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
        <path d={ARC} fill="none" stroke="#fbbf24" strokeWidth="3.5" strokeLinecap="round" pathLength={1} strokeDasharray={`${prog} 1`} />
        <line x1="10" y1="125" x2="290" y2="125" stroke="var(--line)" strokeWidth="1.5" />
        <g opacity={up ? 1 : 0.45}>
          <circle cx={sun.x} cy={sun.y} r="16" fill="#fbbf24" opacity=".25" className="anim-breathe" />
          <circle cx={sun.x} cy={sun.y} r="9" fill="url(#sun-dot)" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" />
        </g>
      </svg>
      <div className="grid grid-cols-3 text-center gap-2 -mt-1">
        <div>
          <Sunrise size={18} className="mx-auto text-amber-300" />
          <div className="font-bold tabular-nums">{fmtTime(sunrise, tz)}</div>
          <div className="text-[0.7rem] text-muted">Aufgang</div>
        </div>
        <div>
          <div className="text-xs text-muted mt-1">Tageslänge</div>
          <div className="font-semibold tabular-nums text-sm">{fmtDuration(d0.daylight ?? sunset - sunrise)}</div>
        </div>
        <div>
          <Sunset size={18} className="mx-auto text-orange-400" />
          <div className="font-bold tabular-nums">{fmtTime(sunset, tz)}</div>
          <div className="text-[0.7rem] text-muted">Untergang</div>
        </div>
      </div>
      <p className="text-xs text-muted text-center mt-3">{status}</p>
    </div>
  );
}
