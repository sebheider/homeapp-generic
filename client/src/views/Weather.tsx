/** Weather page; the content itself lives in components/Weather.tsx (loaded on demand). */
import { CloudSun } from 'lucide-react';
import { useStore } from '../lib/store';
import { WeatherSection } from '../components/Weather';
import { Empty, OpenSettingsButton, PageHeader } from '../components/ui';

/** Weather page: current conditions, sun, UV index, 3-day forecast and rain radar. */
export function WeatherView() {
  const cfg = useStore((s) => s.config?.weather);

  if (cfg && !cfg.enabled) {
    return (
      <div>
        <PageHeader title="Wetter" />
        <Empty icon={<CloudSun size={28} />} title="Wetter ist ausgeschaltet" text="Aktiviere die Wetteranzeige in den Einstellungen.">
          <OpenSettingsButton />
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Wetter" subtitle={cfg?.name || undefined} />
      <WeatherSection />
    </div>
  );
}
