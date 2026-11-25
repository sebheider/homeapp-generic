/** Settings tab "Wetter": location (search by name / postcode or coordinates), radar, and the local weather station. */
import { useState } from 'react';
import { MapPin, ScanSearch, Search } from 'lucide-react';
import { api, type GeoHit } from '../../lib/api';
import { useStore } from '../../lib/store';
import { WEATHER_FIELDS } from '../../lib/weatherFields';
import { StatePicker } from '../../components/Pickers';
import { Toggle } from '../../components/ui';
import { Card, Field, NumInput, Switch, dimUnless, sectionSetter, type TabProps } from './shared';

/** Location search, coordinates, radar switch and the datapoint mapping of a local weather station. */
export function WeatherTab({ draft, setDraft }: TabProps) {
  const w = draft.weather;
  const toast = useStore((s) => s.toast);
  const set = sectionSetter(draft, setDraft, 'weather');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GeoHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setHits(await api.geocode(query));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  };

  /** Runs the discovery and takes over only the weather station datapoints. */
  const detect = async () => {
    setDetecting(true);
    try {
      const found = await api.discover();
      if (!found.weather) toast('Keine Wetterstation in ioBroker erkannt', 'error');
      else {
        set({ states: { ...w.states, ...found.weather.states } });
        toast(`${Object.keys(found.weather.states).length} Datenpunkte der Wetterstation zugeordnet – jetzt speichern`, 'success');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDetecting(false);
    }
  };

  const pickLocation = (h: GeoHit) => {
    set({ name: h.name, latitude: h.latitude, longitude: h.longitude });
    setHits(null);
    setQuery('');
  };

  const located = w.latitude != null && w.longitude != null;
  return (
    <>
      <Card title="Wetter auf der Übersicht" right={<Toggle checked={w.enabled} onChange={(v) => set({ enabled: v })} label="Wetter anzeigen" />}>
        <div className={dimUnless(w.enabled)}>
          <Field label="Ort suchen" hint="Ortsname oder Postleitzahl. Die Prognose kommt von Open-Meteo (Internetzugriff des Containers nötig).">
            <div className="flex gap-2">
              <input className="field flex-1" value={query} placeholder="z. B. Hamburg oder 20095" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
              <button className="btn" disabled={searching || query.trim().length < 2} onClick={search}><Search size={15} /> Suchen</button>
            </div>
          </Field>
          {hits && (
            <div className="mt-2 flex flex-col gap-1.5">
              {hits.length === 0 && <p className="text-sm text-muted">Nichts gefunden.</p>}
              {hits.map((h) => (
                <button
                  key={`${h.latitude},${h.longitude}`}
                  className="text-left rounded-xl border border-line bg-white/5 hover:bg-white/10 px-3 py-2 flex items-center gap-3 transition-colors"
                  onClick={() => pickLocation(h)}
                >
                  <MapPin size={15} className="text-violet-300 shrink-0" />
                  <span className="font-medium">{h.name}</span>
                  <span className="text-xs text-muted truncate">{h.region}</span>
                  <span className="ml-auto text-xs text-muted tabular-nums">{h.latitude.toFixed(2)}, {h.longitude.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Field label="Anzeigename des Standorts"><input className="field" value={w.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Breitengrad" hint="z. B. 53.5507"><NumInput value={w.latitude ?? undefined} onChange={(v) => set({ latitude: v ?? null })} /></Field>
            <Field label="Längengrad" hint="z. B. 9.9930"><NumInput value={w.longitude ?? undefined} onChange={(v) => set({ longitude: v ?? null })} /></Field>
          </div>
          {!located && <p className="text-xs text-amber-300 mt-2">Ohne Standort werden nur die Werte der lokalen Wetterstation angezeigt (kein Internet-Wetter, keine Prognose).</p>}
          <div className="mt-3">
            <Switch label="Regenradar anzeigen (Kartenkacheln lädt der Browser von RainViewer und Esri)" checked={w.radar} onChange={(v) => set({ radar: v })} />
          </div>
        </div>
      </Card>

      <Card
        title="Lokale Wetterstation"
        right={<button className="btn !py-1.5 !text-xs" disabled={detecting} onClick={detect}><ScanSearch size={14} /> {detecting ? 'Suche …' : 'Aus ioBroker erkennen'}</button>}
      >
        <p className="text-xs text-muted mb-4">Gemessene Werte haben Vorrang vor dem Internet-Wetter. Nicht belegte Felder werden aus dem Internet ergänzt. Die automatische Erkennung findet z. B. die MQTT-Station „WeatherMan“.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {WEATHER_FIELDS.map((f) => (
            <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`}>
              <StatePicker value={w.states[f.key] ?? ''} onChange={(id) => set({ states: { ...w.states, [f.key]: id } })} />
            </Field>
          ))}
          <Field label="Einheit der Windsensoren">
            <select className="field" value={w.windUnit} onChange={(e) => set({ windUnit: e.target.value as 'kmh' | 'ms' })}>
              <option value="kmh">km/h</option>
              <option value="ms">m/s (wird in km/h umgerechnet)</option>
            </select>
          </Field>
        </div>
      </Card>
    </>
  );
}
