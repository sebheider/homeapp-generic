/** Outside conditions of the "Nexus" design: weather with its 12 h curve, CO₂ traffic light and UV index. */
import type { ReactNode } from 'react';
import { Droplets, Wind } from 'lucide-react';
import { useStore } from '../../lib/store';
import { co2Limits, co2Status, kioskValue } from '../../lib/kiosk';
import { clamp, num } from '../../lib/format';
import { describeCode, fmtTime, useLocalWeather, uvLevel } from '../../lib/weather';
import type { WeatherData } from '../../lib/api';
import type { Overview } from '../../lib/overview';
import { WeatherIcon } from '../../components/WeatherIcon';
import { NX } from '../../components/HomeTwin';
import { useKioskAgents } from '../../components/KioskSensors';
import { tc, Panel } from './Panel';

/** Outside conditions (local station first) and – unless `compact` (kiosk) – the temperature of the next 12 hours; `children` below. */
export function Atmosphere({ weather, fallback, compact, children }: { weather: WeatherData | null; fallback: number | null; compact: boolean; children?: ReactNode }) {
  const enabled = useStore((s) => s.config?.weather?.enabled !== false);
  const setView = useStore((s) => s.setView);
  const local = useLocalWeather();
  const web = weather?.configured ? weather : null;
  const cur = web?.current;
  const temp = local.temperature ?? cur?.temp ?? fallback;
  if (!enabled || (temp == null && !cur)) return children ? <Panel title="Raumluft">{children}</Panel> : null;
  const cond = describeCode(cur?.code);
  const today = web?.daily[0];
  const humidity = local.humidity ?? cur?.humidity ?? null;
  const wind = local.windSpeed ?? cur?.wind ?? null;
  const now = Date.now() / 1000;
  const hourly = compact ? [] : (web?.hourly ?? []).filter((h) => h.t >= now - 3600 && h.temp != null).slice(0, 13);
  let curve: ReactNode = null;
  if (hourly.length >= 4) {
    const vals = hourly.map((h) => h.temp!);
    const mn = Math.min(...vals) - 0.5;
    const mx = Math.max(...vals) + 0.5;
    const W = 360;
    const p = vals.map((v, k) => [4 + (k / (vals.length - 1)) * (W - 8), 16 + (1 - (v - mn) / (mx - mn)) * 26] as const);
    const line = p.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ');
    const marks = [0, 3, 6, 9, 12].filter((k) => k < p.length);
    curve = (
      <svg className="nx-curve" viewBox={`0 0 ${W} 62`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="nxWa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={NX.cyan} stopOpacity=".35" /><stop offset="1" stopColor={NX.cyan} stopOpacity="0" /></linearGradient>
        </defs>
        <polygon points={`4,46 ${line} ${W - 4},46`} fill="url(#nxWa)" />
        <polyline points={line} fill="none" stroke="#7cefff" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 4px #22e4ff)' }} />
        <circle cx={p[0][0]} cy={p[0][1]} r="3.5" fill="#fff" />
        {marks.map((k) => {
          const anchor = k === 0 ? 'start' : k === p.length - 1 || k === 12 ? 'end' : 'middle';
          return (
            <g key={k}>
              <text className="v" x={p[k][0]} y={p[k][1] - 6} textAnchor={anchor}>{num(vals[k], 0)}°</text>
              <text x={p[k][0]} y={60} textAnchor={anchor}>{k === 0 ? 'JETZT' : fmtTime(hourly[k].t, web!.timezone)}</text>
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <Panel title="Atmosphäre" right={hourly.length >= 4 ? 'NÄCHSTE 12 H' : undefined} to="weather">
      <button className="nx-wx" onClick={() => setView('weather')}>
        {cur ? <WeatherIcon kind={cond.kind} isDay={cur.isDay} size={74} code={cur.code} wind={local.windSpeed ?? cur.wind} temp={temp} /> : <span />}
        <span className="min-w-0">
          <span className="t block">{temp == null ? '–' : num(temp, 1)}<small>°C</small></span>
          {cur && <span className="d block">{cond.label}{cur.feelsLike != null ? ` · gefühlt ${num(cur.feelsLike, 0)}°` : ''}</span>}
          <span className="m">
            {today?.tMax != null && today.tMin != null && <span>↑{num(today.tMax, 0)}° ↓{num(today.tMin, 0)}°</span>}
            {wind != null && <span><Wind size={12} /> {num(wind, 0)} km/h</span>}
            {humidity != null && <span><Droplets size={12} /> {num(humidity, 0)} %</span>}
          </span>
        </span>
      </button>
      {curve}
      {children}
    </Panel>
  );
}

/**
 * CO₂ as a traffic light – thresholds of the ventilation notification – and the UV index. CO₂ comes from the
 * wall display (the kiosk agent chosen for this device, otherwise the first one measuring CO₂), without
 * one from the room with the highest value.
 */
export function AirChips({ o, uv, uvMax }: { o: Overview; uv: number | null; uvMax: number | null }) {
  const { agents } = useKioskAgents();
  const own = useStore((s) => s.display.presenceAgent);
  const limits = co2Limits(useStore((s) => s.config?.ventilation));
  const setView = useStore((s) => s.setView);
  const agent = agents.find((a) => a.id === own && a.online && kioskValue(a, 'co2') != null) ?? agents.find((a) => a.online && kioskValue(a, 'co2') != null);
  let co2 = agent ? kioskValue(agent, 'co2') : null;
  // the own wall display measures the air of the room it hangs in; other sources are named
  let where = agent && agent.id !== own ? agent.name : null;
  let room: string | null = null;
  if (co2 == null) {
    const worst = o.rooms.filter((r) => r.co2 != null && r.co2 > 0).sort((a, b) => b.co2! - a.co2!)[0];
    if (worst) {
      co2 = worst.co2;
      where = worst.room.name;
      room = worst.room.id;
    }
  }
  if (co2 == null && uv == null) return null;
  const st = co2Status(co2, limits);
  const uvl = uvLevel(uv);
  const lamp = (level: string, c: string) => <i className={st.level === level ? 'on' : ''} style={tc(c)} />;
  return (
    <div className="nx-air">
      {co2 != null && (
        <button className="nx-chip" style={tc(st.color)} onClick={() => setView(room ? 'rooms' : 'climate', room ?? undefined)} aria-label={`CO₂ ${num(co2, 0)} ppm, ${st.label}`}>
          <span className="nx-ampel" aria-hidden>{lamp('red', '#f43f5e')}{lamp('yellow', '#fbbf24')}{lamp('green', '#34d399')}</span>
          <span className="min-w-0">
            <span className="k">CO₂{where ? ` · ${where}` : ''}</span>
            <span className="v">{num(co2, 0)}<small>ppm</small></span>
            <span className="s">{st.label}</span>
          </span>
        </button>
      )}
      {uv != null && (
        <button className="nx-chip" style={tc(uvl.color)} onClick={() => setView('weather')} aria-label={`UV-Index ${num(uv, 0)}, ${uvl.label}`}>
          <span className="nx-uv" aria-hidden><i style={{ height: `${clamp(uv / 11, 0.06, 1) * 100}%` }} /></span>
          <span className="min-w-0">
            <span className="k">UV-Index</span>
            <span className="v">{num(uv, 0)}<small>{uvl.label}</small></span>
            <span className="s">{uvMax != null ? `heute max. ${num(uvMax, 0)}` : uvl.advice}</span>
          </span>
        </button>
      )}
    </div>
  );
}
