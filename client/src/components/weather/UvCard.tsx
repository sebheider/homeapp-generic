import { Sun } from 'lucide-react';
import { num, numOrDash, clamp } from '../../lib/format';
import { fmtTime, uvChartHours, uvLevel, type HourlyEntry } from '../../lib/weather';
import type { WeatherData } from '../../lib/api';
import { hourLabel, SrcDot, CardTitle, BarColumn } from './shared';

const UV_SCALE = 'linear-gradient(90deg,#34d399 0%,#34d399 25%,#facc15 25%,#facc15 50%,#fb923c 50%,#fb923c 67%,#f43f5e 67%,#f43f5e 92%,#a855f7 92%)';

/** UV index: always the online forecast for the configured location (not the local sensor). */
export function UvCard({ web, nowSec }: { web: WeatherData; nowSec: number }) {
  return (
    <div className="glass tone-violet p-4 sm:p-5 h-full">
      <CardTitle icon={<Sun size={15} />} right={<SrcDot src={web.current.uv == null ? null : 'web'} />}>UV-Index</CardTitle>
      <UvContent web={web} nowSec={nowSec} />
    </div>
  );
}

/** Content of the UV card: current value with scale, the next hours and the sun protection advice. */
export function UvContent({ web, nowSec }: { web: WeatherData; nowSec: number }) {
  const tz = web.timezone;
  const cur = web.current.uv;
  const level = uvLevel(cur);
  const [d0, d1] = web.daily;
  const hourly = web.hourly.filter((h) => h.uv != null);
  const today = d0 ? hourly.filter((h) => h.t >= d0.t && h.t < d0.t + 86400) : [];
  // hours that need sun protection (UV 3 and more) and the daily peak
  const strong = today.filter((h) => (h.uv ?? 0) >= 3);
  const peak = today.reduce<HourlyEntry | null>((m, h) => (!m || (h.uv ?? 0) > (m.uv ?? 0) ? h : m), null);

  const { shown, tomorrow } = uvChartHours(hourly, d1, nowSec);
  // bars use the strongest shown value (at least 3, the sun protection threshold) so that low values stay visible
  const barMax = Math.max(3, ...shown.map((h) => h.uv ?? 0));
  const currentHour = hourly.filter((h) => h.t <= nowSec).pop()?.t;
  const advice = strong.length
    ? `Sonnenschutz heute von ${fmtTime(strong[0].t, tz)} bis ${fmtTime(strong[strong.length - 1].t + 3600, tz)} Uhr`
    : 'Heute ist kein Sonnenschutz nötig.';

  return (
    <div>
      <div className="flex items-end gap-3">
        <span className="text-5xl font-bold tabular-nums leading-none" style={{ color: level.color }}>{numOrDash(cur, 1)}</span>
        <div className="pb-1">
          <div className="font-semibold" style={{ color: level.color }}>{level.label}</div>
          {peak && <div className="text-xs text-muted">Maximum heute {num(peak.uv ?? 0, 1)} um {fmtTime(peak.t, tz)} Uhr</div>}
        </div>
      </div>
      {/* colour scale with a marker at the current value (scale ends at UV 12) */}
      <div className="relative h-2 rounded-full mt-4" style={{ background: UV_SCALE }}>
        <span className="absolute -top-1 w-4 h-4 rounded-full bg-white border-2 shadow" style={{ borderColor: level.color, left: `calc(${clamp((cur ?? 0) / 12, 0, 1) * 100}% - 8px)` }} />
      </div>

      {shown.length > 0 && (
        <>
          <div className="text-[0.7rem] text-muted mt-4">{tomorrow ? 'Prognose für morgen' : 'Prognose der nächsten Stunden'}</div>
          <div className="flex items-stretch gap-1 h-28 mt-1">
            {shown.map((h, i) => (
              <BarColumn
                key={h.t}
                value={(h.uv ?? 0) >= 0.5 ? num(h.uv ?? 0, 0) : ''}
                fraction={(h.uv ?? 0) / barMax}
                color={uvLevel(h.uv).color}
                opacity={h.t === currentHour ? 1 : 0.7}
                label={i % 2 === 0 ? hourLabel(h.t, tz) : ''}
                title={`${fmtTime(h.t, tz)} Uhr: UV ${num(h.uv ?? 0, 1)}`}
              />
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-muted mt-3">{advice}</p>
    </div>
  );
}
