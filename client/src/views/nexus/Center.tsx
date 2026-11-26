import { isOn, useStateValues, useStore } from '../../lib/store';
import { num, powerText, toNum } from '../../lib/format';
import { NO_STATES } from '../../lib/selectors';
import { OUTSIDE, floorOf, type Overview } from '../../lib/overview';
import { heatPumpRunning, heatPumpWatts } from '../../lib/heatpump';
import { IDLE_W, type EnergyValues } from '../../components/Energy';
import { useNotifications } from '../../components/Notifications';
import { HomeTwin, NX } from '../../components/HomeTwin';
import { toneStyle } from '../../components/Hud';
import { Panel } from './Panel';

/** Digital twin with its header and the state line of the house; `framed` (kiosk in portrait format): as a panel, callouts as cards on the right. */
export function Center({ o, energy, framed = false }: { o: Overview; energy: EnergyValues; framed?: boolean }) {
  const setView = useStore((s) => s.setView);
  const show = useStore((s) => s.showNotifications);
  const ws = useStore((s) => s.wsConnected);
  const { visible, open, top } = useNotifications();
  const hp = useStateValues(o.heatpump?.states ?? NO_STATES);
  const indoor = o.rooms.filter((r) => !OUTSIDE.test(r.room.name));
  const floors = new Set(indoor.map((r) => floorOf(r.room))).size;

  // most severe notification per room colours that room
  const alertColors: Record<string, string> = {};
  for (const a of visible) if (a.room && a.severity !== 'info' && !alertColors[a.room]) alertColors[a.room] = a.severity === 'alarm' ? NX.red : NX.amber;

  const charging = energy.battery < -IDLE_W;
  const discharging = energy.battery > IDLE_W;
  const cop = hp.cop != null ? toNum(hp.cop) : null;
  const flow = hp.flowTemp != null ? toNum(hp.flowTemp) : null;
  const running = o.heatpump ? heatPumpRunning(o.heatpump, hp) : false;
  const hpState = running ? 'läuft' : isOn(hp.power) ? 'bereit' : 'aus';
  const hpWatts = o.heatpump?.states.electricPower ? heatPumpWatts(o.heatpump, hp.electricPower) : null;
  const hpSub = [hpState, running && hpWatts != null ? powerText(hpWatts) : null, cop != null && flow != null ? `VL ${num(flow, 0)} °C` : null].filter(Boolean).join(' · ');

  const state = open.length || top === 'alarm' ? 'alarm' : top === 'warning' ? 'warning' : 'ok';
  const color = state === 'alarm' ? NX.red : state === 'warning' ? NX.amber : NX.cyan;
  const parts: { label: string; value: string; color?: string }[] = [];
  if (energy.enabled) parts.push({ label: 'Energie', value: energy.grid > IDLE_W ? `Netz ${powerText(energy.grid)}` : energy.grid < -IDLE_W ? `Einspeisung ${powerText(-energy.grid)}` : 'autark' });
  if (o.contacts.length) parts.push({ label: 'Sicherheit', value: o.openContacts.length ? `${o.openContacts.length} offen` : 'alles zu', color: o.openContacts.length ? NX.amber : undefined });
  if (o.avgTemp != null) parts.push({ label: 'Klima', value: `Ø ${num(o.avgTemp, 1)} °C` });
  if (visible.length) parts.push({ label: 'Meldungen', value: String(visible.length), color });

  const live = <span className="nx-live" style={{ ['--dot' as string]: ws ? NX.red : NX.muted }}>{ws ? 'Live' : 'Offline'}</span>;
  const twin = (
        <HomeTwin
          rail={framed}
          rooms={indoor}
          alertColors={alertColors}
          onRoom={(id) => setView('rooms', id)}
          solar={energy.enabled ? { name: 'Solar', value: powerText(energy.pv), sub: energy.dailyYield != null ? `heute ${num(energy.dailyYield, 1)} kWh` : 'Photovoltaik', color: NX.amber, onClick: () => setView('energy') } : null}
          battery={
            energy.enabled && energy.soc != null
              ? { name: 'Batterie', value: `${num(energy.soc, 0)} %`, sub: charging ? `lädt ${powerText(-energy.battery)}` : discharging ? `liefert ${powerText(energy.battery)}` : 'Ruhezustand', color: NX.green, soc: energy.soc, onClick: () => setView('energy') }
              : null
          }
          heatpump={
            o.heatpump
              ? { name: 'Wärmepumpe', value: cop != null ? `COP ${num(cop, 1)}` : flow != null ? `${num(flow, 0)} °C` : hpState, sub: hpSub, color: NX.orange, onClick: () => setView('climate') }
              : null
          }
        />
  );
  const status = (
    <button className="nx-status" style={toneStyle(color)} onClick={() => show(true)} aria-label="Benachrichtigungen öffnen">
      <div className="st">{state === 'alarm' ? 'Alarm' : state === 'warning' ? 'Warnung' : 'System optimal'}</div>
      {parts.length > 0 && (
        <div className="ss">
          {parts.map((p) => <span key={p.label}>{p.label}<b style={p.color ? { color: p.color } : undefined}>{p.value}</b></span>)}
        </div>
      )}
    </button>
  );
  if (framed) {
    return (
      <Panel title="Digital Twin" right={<span className="nx-twin-r">{floors} {floors === 1 ? 'Etage' : 'Etagen'} · {indoor.length} Räume{live}</span>} color={color} className="nx-twin">
        <div className="nx-stage">{twin}</div>
        {status}
      </Panel>
    );
  }
  return (
    <section className="nx-center">
      <div className="nx-chead">
        <b>Digital Twin</b>
        <span className="mid">{floors} {floors === 1 ? 'Etage' : 'Etagen'} · {indoor.length} Räume · {o.devices.length} Geräte</span>
        {live}
      </div>
      <div className="nx-stage">{twin}</div>
      {status}
    </section>
  );
}
