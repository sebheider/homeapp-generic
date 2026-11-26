/** Outside conditions of the overview hero: temperature, condition, details, sun times and the UV forecast. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Droplets, Sun, Sunrise, Sunset, Wind } from 'lucide-react';
import { useStore } from '../../lib/store';
import { clamp, num } from '../../lib/format';
import { describeCode, fmtTime, useLocalWeather, useWeatherData, uvLevel, uvOutlook } from '../../lib/weather';
import type { WeatherData } from '../../lib/api';
import { WeatherIcon } from '../../components/WeatherIcon';
import { toneStyle } from '../../components/Hud';
import { HeroTemp } from './HeroTemp';

/**
 * UV index and its forecast in one line: current value in its level colour, a bar per coming hour (after
 * sunset the hours of tomorrow) and the peak. Fits next to the sun times, so the weather block keeps its height.
 * `detail` drops parts where the line has no room: 0 everything, 1 without the peak, 2 without the bars.
 */
function HeroUv({ web, large, detail = 0 }: { web: WeatherData; large: boolean; detail?: number }) {
  const outlook = uvOutlook(web, Date.now() / 1000, 12);
  if (!outlook) return null;
  const { now, shown, tomorrow, peak } = outlook;
  const level = uvLevel(now);
  const max = Math.max(3, peak?.uv ?? 0);
  const peakText = peak && (peak.uv ?? 0) >= 0.5 ? `${tomorrow ? 'morgen ' : ''}max. ${num(peak.uv ?? 0, 0)}` : null;
  const title = [
    `UV-Index ${num(now, 1)} (${level.label})`,
    peak && (peak.uv ?? 0) >= 0.5 ? `${tomorrow ? 'morgen' : 'heute'} max. ${num(peak.uv ?? 0, 1)} um ${fmtTime(peak.t, web.timezone)} Uhr` : null,
  ].filter(Boolean).join(' · ');
  return (
    <span className="hero-uv inline-flex items-center gap-1.5 whitespace-nowrap" title={title} aria-label={title}>
      <Sun size={large ? 16 : 12} style={{ color: level.color }} />
      <span>UV <b className="tabular-nums" style={{ color: level.color }}>{num(now, 0)}</b></span>
      {shown.length > 1 && detail < 2 && (
        <span className={`hero-uv-bars ${large ? 'large' : ''}`} aria-hidden>
          {shown.map((h) => (
            <i key={h.t} style={{ height: `${Math.max(8, clamp((h.uv ?? 0) / max, 0, 1) * 100)}%`, background: uvLevel(h.uv).color, opacity: (h.uv ?? 0) >= 0.5 ? 0.9 : 0.35 }} />
          ))}
        </span>
      )}
      {peakText && detail < 1 && <span className="tabular-nums">{peakText}</span>}
    </span>
  );
}

/**
 * Outside conditions: local station first, internet forecast for everything else. `large`: kiosk hero;
 * `uv`: UV index with its forecast beside the sun times (standard overview).
 */
export function HeroWeather({ fallback, compact = false, large = false, uv = false }: { fallback: number | null; compact?: boolean; large?: boolean; uv?: boolean }) {
  const enabled = useStore((s) => s.config?.weather?.enabled !== false);
  const setView = useStore((s) => s.setView);
  const { data } = useWeatherData();
  const local = useLocalWeather();
  // the UV line must neither widen the weather block (it would slide under the Home Core on narrow kiosk heroes)
  // nor make the hero taller. Steps, measured before painting and again after resizing / new data: 0–2 beside the
  // sun times (all, without the peak, without the bars), 3–5 the same beside the small "Außen" heading (narrow
  // portrait heroes), 6 hidden.
  const sunRow = useRef<HTMLDivElement>(null);
  const labelRow = useRef<HTMLDivElement>(null);
  const [uvStep, setUvStep] = useState(0);
  useLayoutEffect(() => {
    if (!uv || uvStep >= 6) return;
    const row = uvStep < 3 ? sunRow.current : labelRow.current;
    if (row && row.scrollWidth > row.clientWidth + 1) setUvStep(uvStep + 1);
  });
  useEffect(() => {
    if (!uv) return;
    const reset = () => setUvStep(0);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, [uv]);
  const fetchedAt = data?.fetchedAt;
  useEffect(() => setUvStep(0), [fetchedAt]);
  const web = data?.configured ? data : null;
  const cur = web?.current;
  const temp = local.temperature ?? cur?.temp ?? fallback;
  const iconSize = large ? 128 : compact ? 80 : 112;
  if (temp == null && !cur) return <div className="hidden lg:block" />;
  const cond = describeCode(cur?.code);
  const today = web?.daily[0];
  const humidity = local.humidity ?? cur?.humidity ?? null;
  const wind = local.windSpeed ?? cur?.wind ?? null;
  const detail = large ? 'text-base gap-x-4' : 'text-xs gap-x-3';
  const icon = large ? 16 : 12;
  const tempSize = large ? 'text-[4.75rem]' : compact ? 'text-[2.6rem]' : 'text-6xl sm:text-7xl';
  return (
    <button className={`block text-left lg:justify-self-end ${large ? 'mr-3' : compact ? '' : 'lg:mr-6'} ${uv ? 'min-w-0 max-w-full' : ''}`} style={toneStyle(cond.tone)} onClick={() => enabled && setView('weather')}>
      {/* built like the clock beside it: big value first, then a quiet label line and the details */}
      <div className={`flex items-start ${large ? 'gap-4' : 'gap-3'} ${tempSize} font-bold leading-none tracking-tight`}>
        <HeroTemp temp={temp} unitClass={large ? 'text-3xl' : compact ? 'text-xl' : 'text-xl sm:text-2xl'} tight={large || compact} />
        {/* the symbol sits right of the value, halfway between level with the value and centred on the "Außen" line
            (1em = height of the value); it takes no room from the lines below.
            Explicit width in rem: the zoom of the scaled kiosk does not count when the grid measures the content */}
        {cur && (
          <span className="relative shrink-0 self-stretch" style={{ width: `${iconSize / 16}rem` }}>
            <span className="absolute left-0" style={{ top: `calc(0.5em + ${compact && !large ? 0.325 : 0.5125}rem - ${iconSize / 64}rem)` }}>
              <WeatherIcon kind={cond.kind} isDay={cur.isDay} size={iconSize} code={cur.code} wind={wind} temp={temp} />
            </span>
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div ref={labelRow} className={`${large ? 'text-sm mt-3' : compact ? 'text-[0.68rem] mt-2' : 'text-sm mt-3'} text-muted flex items-center gap-3`}>
          <span className="uppercase tracking-[0.22em]">Außen</span>
          {web && uv && uvStep >= 3 && uvStep < 6 && <HeroUv web={web} large={false} detail={uvStep - 3} />}
        </div>
        {cur && <div className={`${large ? 'text-xl mt-1' : compact ? 'text-sm mt-0.5' : 'text-lg sm:text-xl mt-0.5'} font-semibold`}>{cond.label}</div>}
        <div className={`${detail} text-muted mt-1 flex flex-wrap gap-y-1`}>
          {today?.tMax != null && today.tMin != null && <span>↑ {num(today.tMax, 0)}° ↓ {num(today.tMin, 0)}°</span>}
          {humidity != null && <span className="inline-flex items-center gap-1"><Droplets size={icon} /> {num(humidity, 0)} %</span>}
          {wind != null && <span className="inline-flex items-center gap-1"><Wind size={icon} /> {num(wind, 0)} km/h</span>}
        </div>
        {web && ((today?.sunrise != null && today.sunset != null) || uv) && (
          <div ref={sunRow} className={`${detail} text-muted mt-1 flex items-center`}>
            {today?.sunrise != null && today.sunset != null && (
              <>
                <span className="inline-flex items-center gap-1"><Sunrise size={icon} /> {fmtTime(today.sunrise, web.timezone)}</span>
                <span className="inline-flex items-center gap-1"><Sunset size={icon} /> {fmtTime(today.sunset, web.timezone)}</span>
              </>
            )}
            {uv && uvStep < 3 && <HeroUv web={web} large={large} detail={uvStep} />}
          </div>
        )}
      </div>
    </button>
  );
}
