/** Top panel of the overview: clock and status chips | Home Core | weather, with falling rain or snow. */
import { useStore } from '../../lib/store';
import { greeting } from '../../lib/format';
import { describeCode, useWeatherData } from '../../lib/weather';
import type { Overview } from '../../lib/overview';
import type { EnergyValues } from '../../components/Energy';
import { KioskSensorsPanel } from '../../components/KioskSensors';
import { particles, precipitation } from '../../lib/ambience';
import { HudPanel } from '../../components/Hud';
import { HeroClock } from './HeroClock';
import { StatusChips } from './StatusChips';
import { HeroWeather } from './HeroWeather';
import { useHouseState, HouseCore } from './HouseCore';

/** Rain or snow falling through the hero panel while it rains or snows outside (effects level 'high' only). */
function HeroPrecip() {
  const high = useStore((s) => s.display.effects === 'high');
  const w = useWeatherData().data;
  const code = w?.configured ? w.current.code : undefined;
  const kind = precipitation(describeCode(code).kind);
  if (!high || !kind) return null;
  return (
    <div className={`hero-precip ${kind}`} aria-hidden>
      {particles(kind === 'rain' ? 26 : 18, kind).map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }} />
      ))}
    </div>
  );
}

/**
 * Top panel: clock and status | Home Core (state of the house, opens the notifications) | weather.
 * `portrait` (kiosk in portrait format): narrower columns, the status chips below the clock.
 */
export function HeroPanel({ o, energy, compact = false, portrait = false }: { o: Overview; energy: EnergyValues; compact?: boolean; portrait?: boolean }) {
  const { state, color } = useHouseState();
  const alert = state === 'ok' ? null : state;
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  if (portrait) {
    return (
      <HudPanel color={color} alert={alert} edge>
        <HeroPrecip />
        <div className="relative grid items-start gap-3 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="min-w-0">
            <HeroClock large />
            <p className="text-base mt-2 leading-snug">
              <b>{greeting()}</b> <span className="text-muted capitalize">· {today}</span>
            </p>
            <StatusChips o={o} energy={energy} max={3} strips />
          </div>
          <HouseCore size="min(8.5rem, 11vh)" />
          <HeroWeather fallback={o.outside} compact large uv />
        </div>
        <KioskSensorsPanel compact embedded />
      </HudPanel>
    );
  }
  return (
    <HudPanel color={color} alert={alert} className={compact ? '' : 'sm:!p-6'} edge>
      <HeroPrecip />
      {/* clock and weather start at the same height; the Home Core stays in the middle */}
      <div className={`relative grid items-start ${compact ? 'gap-4 grid-cols-[1fr_auto_1fr]' : 'gap-6 lg:grid-cols-[1fr_auto_1fr]'}`}>
        <div className="min-w-0">
          <HeroClock compact={compact} large={compact} />
          {compact ? (
            <p className="text-base mt-2 truncate">
              <b>{greeting()}</b> <span className="text-muted capitalize">· {today}</span>
            </p>
          ) : (
            <>
              <p className="text-muted text-sm mt-4 capitalize">{today}</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting()}</h1>
            </>
          )}
          <StatusChips o={o} energy={energy} max={compact ? 3 : undefined} strips={compact} />
        </div>
        <HouseCore size={compact ? 'min(9.5rem, 20vh)' : undefined} />
        <HeroWeather fallback={o.outside} compact={compact} large={compact} uv />
      </div>
      <KioskSensorsPanel compact={compact} embedded />
    </HudPanel>
  );
}
