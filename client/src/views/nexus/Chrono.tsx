import { greeting, pad2 } from '../../lib/format';
import { fmtTime } from '../../lib/weather';
import type { WeatherData } from '../../lib/api';
import { useNow } from '../../lib/hooks';
import { NX } from '../../components/HomeTwin';
import { Panel } from './Panel';

/** "HH:MM" -> hours as a fraction (null if not a time). */
const hours = (t: string) => {
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

/** Big clock, date, greeting and the day line (daylight from sunrise to sunset, current time). */
export function Chrono({ weather }: { weather: WeatherData | null }) {
  const d = new Date(useNow(1000));
  const today = weather?.configured ? weather.daily[0] : undefined;
  const rise = today?.sunrise != null ? fmtTime(today.sunrise, weather!.timezone) : null;
  const set = today?.sunset != null ? fmtTime(today.sunset, weather!.timezone) : null;
  const pos = (h: number) => `${((h / 24) * 100).toFixed(2)}%`;
  const now = d.getHours() + d.getMinutes() / 60;
  const riseH = rise ? hours(rise) : null;
  const setH = set ? hours(set) : null;
  return (
    <Panel title="Lokalzeit" right={d.toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase()}>
      <div className="nx-clock">
        <div className="nx-hm">{pad2(d.getHours())}:{pad2(d.getMinutes())}</div>
        <div className="nx-sec"><b>{pad2(d.getSeconds())}</b><i>SEK</i></div>
      </div>
      <div className="nx-date">{d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', ' ·')}</div>
      <div className="nx-greet"><span>{greeting(d)}</span>.</div>
      <div className="nx-day">
        <div className="track" />
        {riseH != null && setH != null && <div className="sun" style={{ left: pos(riseH), width: pos(setH - riseH) }} />}
        <div className="now" style={{ left: pos(now) }} />
        {riseH != null && <span className="lb" style={{ left: pos(riseH), transform: 'translateX(-50%)' }}>☀ {rise}</span>}
        {setH != null && Math.abs(now - setH) > 1.2 && <span className="lb" style={{ left: pos(setH), transform: 'translateX(-50%)' }}>☾ {set}</span>}
        <span className="lb" style={{ left: pos(now), transform: now > 20 ? 'translateX(calc(-100% - 6px))' : 'translateX(6px)', color: NX.cyan }}>JETZT</span>
      </div>
    </Panel>
  );
}
