/**
 * Weather block of the weather page.
 *
 * Combines the internet forecast (Open-Meteo, via the server) with the local weather station
 * (ioBroker datapoints): for current values the local sensor wins, the internet fills the gaps.
 * A small dot next to each value shows where it comes from.
 *
 * Cards: current conditions + hourly strip + temperature curve, sun path (sunrise / sunset),
 * UV index with the next hours, 3-day forecast, rain (nowcast + animated radar). `WeatherPart` shows
 * one of these parts as a widget of the own start page.
 */
import { CloudSun, MapPin, RefreshCw, Thermometer } from 'lucide-react';
import { useStore } from '../lib/store';
import { useLocalWeather, useWeatherData } from '../lib/weather';
import { WeatherIcon } from './WeatherIcon';
import { RadarMap } from './RadarMap';
import { HudPanel } from './Hud';
import { pick, useNowSec } from './weather/shared';
import { HeroMetrics, HourlyStrip, TemperatureChart, Hero } from './weather/Hero';
import { SunCard, SunContent } from './weather/SunCard';
import { UvCard, UvContent } from './weather/UvCard';
import { ForecastCard, ForecastContent } from './weather/ForecastCard';
import { RainCard, RainContent } from './weather/RainCard';

/* ------------------------------------------------------------------ block */

/** "Retry" (only after an error) and "set location" buttons; `compact` is the small variant of the hint bar. */
function SetupActions({ error, reload, compact = false }: { error: string | null; reload: () => void; compact?: boolean }) {
  const setView = useStore((s) => s.setView);
  const size = compact ? 13 : 14;
  const small = compact ? ' !py-1.5 !text-xs' : '';
  return (
    <>
      {error && <button className={`btn${small}`} onClick={reload}><RefreshCw size={size} /> Erneut versuchen</button>}
      <button className={`btn primary${small}`} onClick={() => setView('settings')}><MapPin size={size} /> Standort festlegen</button>
    </>
  );
}

/** The complete weather block; renders a setup hint while neither a location nor a local station is configured. */
export function WeatherSection() {
  const cfg = useStore((s) => s.config?.weather);
  const { data, error, loading, reload } = useWeatherData();
  const local = useLocalWeather();
  const nowSec = useNowSec();
  if (!cfg || !cfg.enabled) return null;

  const web = data?.configured ? data : null;
  const hasLocal = Object.keys(local).length > 0;

  if (loading && !data && !hasLocal) return <div className="glass tone-cool skeleton h-72 mb-6" />;

  if (!web && !hasLocal) {
    return (
      <div className="glass tone-cool p-6 mb-6 flex flex-wrap items-center gap-4">
        <WeatherIcon kind="partly" size={72} />
        <div className="flex-1 min-w-56">
          <h2 className="font-semibold">Wetter einrichten</h2>
          <p className="text-sm text-muted">{error ?? 'Wähle deinen Standort, dann erscheinen hier Wetter, Sonne, UV-Index, Prognose und Regenradar.'}</p>
        </div>
        <div className="flex gap-2">
          <SetupActions error={error} reload={reload} />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 min-w-0"><Hero web={web} local={local} nowSec={nowSec} name={cfg.name} /></div>
        {web && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 min-w-0">
            <SunCard web={web} nowSec={nowSec} />
            <UvCard web={web} nowSec={nowSec} />
          </div>
        )}
      </div>
      {web && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="min-w-0"><ForecastCard web={web} /></div>
          <div className="xl:col-span-2 min-w-0"><RainCard web={web} radar={cfg.radar} lat={cfg.latitude} lon={cfg.longitude ?? null} /></div>
        </div>
      )}
      {/* only the local station is available: hint that the location is missing */}
      {!web && !loading && (
        <div className="glass tone-warm p-4 flex flex-wrap items-center gap-3 text-sm">
          <Thermometer size={16} className="text-muted" />
          <span className="text-muted flex-1">{error ?? 'Für Prognose, Sonne, UV-Index und Regenradar fehlt noch der Standort.'}</span>
          <SetupActions error={error} reload={reload} compact />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- widgets */

const PART_TONE: Record<string, string> = { sun: '#fbbf24', uv: '#a78bfa', radar: '#38bdf8' };

/**
 * One part of the weather page as a widget of the own start page (`part`: see WEATHER_PARTS in
 * lib/widgets.ts). `label` is the title of the panel.
 */
export function WeatherPart({ part, label }: { part: string; label: string }) {
  const cfg = useStore((s) => s.config?.weather);
  const { data, error, loading } = useWeatherData();
  const local = useLocalWeather();
  const nowSec = useNowSec();
  const web = data?.configured ? data : null;
  const tone = PART_TONE[part] ?? '#22d3ee';
  const note = (text: string) => (
    <HudPanel title={label} color={tone} bodyClassName="flex items-center gap-2 text-sm text-muted">
      <CloudSun size={16} className="shrink-0" /> {text}
    </HudPanel>
  );
  if (!cfg?.enabled) return note('Wetter ist ausgeschaltet (Einstellungen → Wetter).');
  if (part === 'now') {
    const temp = pick(local.temperature, web?.current.temp);
    if (!web && !Object.keys(local).length) return note(loading ? 'Wetter wird geladen …' : error ?? 'Noch kein Standort und keine Wetterstation eingerichtet.');
    return (
      <HudPanel title={label} color={tone}>
        <HeroMetrics web={web} local={local} temp={temp} />
      </HudPanel>
    );
  }
  if (part === 'temperature') {
    return (
      <HudPanel title={label} color={tone}>
        <TemperatureChart web={web} nowSec={nowSec} />
      </HudPanel>
    );
  }
  if (!web) return note(loading ? 'Wetter wird geladen …' : error ?? 'Für diese Anzeige fehlt noch der Standort (Einstellungen → Wetter).');
  if (part === 'radar') {
    if (cfg.latitude == null || cfg.longitude == null) return note('Für das Regenradar fehlt noch der Standort.');
    return (
      <HudPanel title={label} color={tone} className="h-full min-h-0 flex flex-col" bodyClassName="flex-1 min-h-0 flex flex-col">
        <RadarMap lat={cfg.latitude} lon={cfg.longitude} tz={web.timezone} fill />
      </HudPanel>
    );
  }
  const content =
    part === 'hourly' ? <HourlyStrip web={web} nowSec={nowSec} />
    : part === 'sun' ? <SunContent web={web} nowSec={nowSec} />
    : part === 'uv' ? <UvContent web={web} nowSec={nowSec} />
    : part === 'forecast' ? <ForecastContent web={web} />
    : part === 'rain' ? <RainContent web={web} />
    : null;
  if (!content) return note('Unbekannte Anzeige – bitte über ⚙ neu wählen.');
  return (
    <HudPanel title={label} color={tone}>
      {content}
    </HudPanel>
  );
}
