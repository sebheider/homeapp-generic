import { useEffect, useState } from 'react';
import { Droplets, Radar, Sun, Thermometer, Wind } from 'lucide-react';
import { api } from '../lib/api';
import { num, timeAgo } from '../lib/format';
import { useNow } from '../lib/hooks';
import { co2Limits, co2Status, kioskValue } from '../lib/kiosk';
import { useStore } from '../lib/store';
import type { KioskAgent } from '../lib/types';
import { HudPanel } from './Hud';

export function useKioskAgents() {
  const [agents, setAgents] = useState<KioskAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api.kioskAgents().then((r) => {
        if (!alive) return;
        setAgents(r.agents);
        setError(null);
      }).catch((e: unknown) => {
        if (alive) setError(`Kiosk-Sensoren konnten nicht aktualisiert werden: ${e instanceof Error ? e.message : String(e)}`);
      });
    };
    load();
    const timer = setInterval(load, 15_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);
  return { agents, error };
}

export function KioskSensorReadings({ agent, compact = false, unavailable = false }: { agent?: KioskAgent; compact?: boolean; unavailable?: boolean }) {
  useNow(15_000);
  const online = Boolean(agent?.online) && !unavailable;
  const co2 = kioskValue(agent, 'co2');
  const ventilation = useStore((s) => s.config?.ventilation);
  const limits = co2Limits(ventilation);
  const status = co2Status(online ? co2 : null, limits);
  const metrics = [
    { key: 'temperature', label: 'Temperatur', unit: '°C', digits: 1, Icon: Thermometer },
    { key: 'humidity', label: 'Luftfeuchte', unit: '%', digits: 1, Icon: Droplets },
    { key: 'lux', label: 'Helligkeit', unit: 'lx', digits: 0, Icon: Sun },
  ];
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-x-4 gap-y-2' : 'grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]'}>
      <div className={`rounded-xl border ${compact ? 'px-3 py-2' : 'p-4'}`} style={{ color: status.color, borderColor: status.color, background: `color-mix(in srgb, ${status.color} 8%, transparent)` }}>
        <div className="flex items-center gap-2 text-xs font-semibold"><Wind size={15} /> CO₂ <span className="ml-auto">{status.label}</span></div>
        <div className={`font-bold tabular-nums leading-tight ${compact ? 'text-2xl' : 'text-5xl sm:text-6xl'}`}>
          {co2 === null ? '–' : num(co2, 0)} <span className="text-sm font-medium">ppm</span>
        </div>
        {!compact && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
            {[
              ['#34d399', `< ${num(limits.yellow, 0)}`],
              ...(limits.red > limits.yellow ? [['#fbbf24', `${num(limits.yellow, 0)}–${num(limits.red - 1, 0)}`]] : []),
              ['#f43f5e', `≥ ${num(limits.red, 0)}`],
            ].map(([color, label]) => (
              <span key={color} className="inline-flex items-center gap-1 text-muted"><i className="w-2 h-2 rounded-full" style={{ background: color }} />{label} ppm</span>
            ))}
          </div>
        )}
      </div>
      <dl className={`grid gap-x-4 gap-y-2 ${compact ? 'flex-1 min-w-[12rem]' : 'grid-cols-2 content-center'}`} style={compact ? { gridTemplateColumns: 'repeat(auto-fit, minmax(5.5rem, 1fr))' } : undefined}>
        {metrics.map(({ key, label, unit, digits, Icon }) => {
          const value = kioskValue(agent, key);
          return (
            <div key={key}>
              <dt className="flex items-center gap-1 text-xs text-muted"><Icon size={12} />{label}</dt>
              <dd className={`font-semibold tabular-nums ${!online ? 'text-muted' : ''}`}>{value === null ? '–' : `${num(value, digits)} ${unit}`}</dd>
            </div>
          );
        })}
        <div>
          <dt className="flex items-center gap-1 text-xs text-muted"><Radar size={12} />Anwesenheit</dt>
          <dd className={`font-semibold ${!online ? 'text-muted' : ''}`}>{typeof agent?.values.presence !== 'boolean' ? '–' : agent.values.presence ? 'Jemand da' : 'Niemand'}</dd>
        </div>
      </dl>
      {!online && <p className="text-xs text-muted col-span-full">{unavailable ? 'Aktualisierung fehlgeschlagen.' : agent ? `Offline · zuletzt ${timeAgo(agent.lastSeen)}. Letzte gemeldete Werte.` : 'Noch keine Sensormeldung.'}</p>}
      {agent && agent.errors.length > 0 && <p className="text-xs text-amber-400 col-span-full">{agent.errors.join(' · ')}</p>}
    </div>
  );
}

/** Embedded in the standard hero, otherwise a standalone dashboard panel / widget. */
export function KioskSensorsPanel({ compact = false, embedded = false, showEmpty = false, className = '' }: { compact?: boolean; embedded?: boolean; showEmpty?: boolean; className?: string }) {
  const { agents, error } = useKioskAgents();
  if (!agents.length && !error && !showEmpty) return null;
  const body = (
    <>
      {error && <p role="status" className="text-xs text-amber-400 mb-2">{error}</p>}
      {!agents.length && !error && <p className="text-sm text-muted">Noch kein Kiosk-Agent gemeldet.</p>}
      <div className={compact ? 'flex gap-4 overflow-x-auto' : 'grid gap-4'}>
        {agents.map((agent) => (
          <section key={agent.id} className={compact ? 'min-w-[16rem] flex-1' : ''} aria-label={`Sensoren ${agent.name}`}>
            <h3 className="text-xs text-muted font-semibold mb-2">{agent.name}</h3>
            <KioskSensorReadings agent={agent} compact={compact} unavailable={Boolean(error)} />
          </section>
        ))}
      </div>
    </>
  );
  return embedded ? <section className="relative mt-3 pt-3 border-t border-line" aria-label="Kiosk-Sensoren">{body}</section> : <HudPanel title="Kiosk-Sensoren" color="#34d399" className={className}>{body}</HudPanel>;
}
