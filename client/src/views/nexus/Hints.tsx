/** Hints of the "Nexus" design: notifications first, then tips derived from the live values. */
import type { ReactNode } from 'react';
import { ChevronRight, CircleAlert, CircleCheck, Droplets, Flame, Info, Sun, TriangleAlert, Wind, BatteryLow } from 'lucide-react';
import { useStore } from '../../lib/store';
import { co2Limits } from '../../lib/kiosk';
import { num, powerText } from '../../lib/format';
import { SEVERITY } from '../../lib/alerts';
import { OUTSIDE, type Overview } from '../../lib/overview';
import type { ActiveAlert } from '../../lib/types';
import { IDLE_W, type EnergyValues } from '../../components/Energy';
import { useNotifications } from '../../components/Notifications';
import { NX } from '../../components/HomeTwin';
import { tc, Panel } from './Panel';

interface Hint {
  key: string;
  color: string;
  icon: ReactNode;
  title: string;
  text: string;
  onClick?: () => void;
}

/** Notifications first, then tips derived from the live values; "all fine" if there is nothing. */
function useHints(o: Overview, energy: EnergyValues, max: number): Hint[] {
  const { visible } = useNotifications();
  const openTarget = useStore((s) => s.openTarget);
  const show = useStore((s) => s.showNotifications);
  const setView = useStore((s) => s.setView);
  const co2Max = co2Limits(useStore((s) => s.config?.ventilation)).yellow;
  const hints: Hint[] = visible.slice(0, max).map((a: ActiveAlert) => {
    const Ico = a.severity === 'alarm' ? CircleAlert : a.severity === 'warning' ? TriangleAlert : Info;
    return {
      key: a.id,
      color: SEVERITY[a.severity].color,
      icon: <Ico size={17} />,
      title: a.name,
      text: a.message.startsWith(a.name) ? a.message.slice(a.name.length).replace(/^[\s:–-]+/, '') || a.message : a.message,
      onClick: a.view ? () => openTarget(a.view, a.room) : () => show(true),
    };
  });
  const noted = new Set(visible.map((a) => a.room).filter(Boolean));
  const tip = (h: Hint) => hints.length < max && hints.push(h);
  if (energy.enabled && energy.grid < -800) {
    tip({ key: 'pv', color: NX.amber, icon: <Sun size={17} />, title: `Solarüberschuss ${powerText(-energy.grid)}`, text: 'Guter Zeitpunkt für Waschmaschine, Spülmaschine oder Wallbox.', onClick: () => setView('energy') });
  }
  for (const r of o.rooms) {
    if (noted.has(r.room.id)) continue;
    if (r.open.length && r.heating) tip({ key: `heat-${r.room.id}`, color: NX.orange, icon: <Flame size={17} />, title: `${r.room.name}: ${r.open[0].name} offen`, text: 'Die Heizung läuft – herunterregeln spart Energie.', onClick: () => setView('rooms', r.room.id) });
    else if (r.co2 != null && r.co2 >= co2Max) tip({ key: `co2-${r.room.id}`, color: NX.cyan, icon: <Wind size={17} />, title: `${r.room.name}: CO₂ ${num(r.co2, 0)} ppm`, text: 'Lüften empfohlen – frische Luft hilft der Konzentration.', onClick: () => setView('rooms', r.room.id) });
    else if (r.humidity != null && r.humidity > 65 && !OUTSIDE.test(r.room.name)) tip({ key: `hum-${r.room.id}`, color: NX.cyan, icon: <Droplets size={17} />, title: `${r.room.name}: Luftfeuchte ${num(r.humidity, 0)} %`, text: 'Lüften beugt Schimmel vor.', onClick: () => setView('rooms', r.room.id) });
  }
  if (energy.enabled && energy.soc != null && energy.soc < 15 && energy.battery > IDLE_W) {
    tip({ key: 'soc', color: NX.amber, icon: <BatteryLow size={17} />, title: `Batterie bei ${num(energy.soc, 0)} %`, text: 'Der Speicher ist fast leer – gleich kommt der Strom aus dem Netz.', onClick: () => setView('energy') });
  }
  if (!hints.length) hints.push({ key: 'ok', color: NX.green, icon: <CircleCheck size={17} />, title: 'Alles im grünen Bereich', text: 'Keine Meldungen – alle Systeme laufen.' });
  return hints;
}

export function Hints({ o, energy, max }: { o: Overview; energy: EnergyValues; max: number }) {
  const hints = useHints(o, energy, max);
  const count = useNotifications().visible.length;
  return (
    <Panel title="Hinweise" right={count ? `${count} AKTIV` : 'KEINE'} color={count ? NX.amber : NX.cyan}>
      {hints.map((h) => {
        const body = (
          <>
            <span className="ic">{h.icon}</span>
            <span className="min-w-0"><h4>{h.title}</h4><p>{h.text}</p></span>
            {h.onClick && <ChevronRight size={14} className="text-[var(--nx-muted)]" />}
          </>
        );
        return h.onClick ? <button key={h.key} className="nx-tip" style={tc(h.color)} onClick={h.onClick}>{body}</button> : <div key={h.key} className="nx-tip" style={tc(h.color)}>{body}</div>;
      })}
    </Panel>
  );
}
