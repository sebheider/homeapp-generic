/**
 * Settings tab "Kiosk-Sensoren": sensors at the Raspberry Pi of a wall display (LD2410 presence radar,
 * BH1750 light sensor, SCD41 CO₂ sensor). A small agent on the Pi (folder kiosk-agent/) reports the
 * values to the server and switches / dims the screen (presence, always-on times, waking on camera
 * pop-ups and notifications outside the quiet hours, fixed off / dim times without sensors); its values become read-only datapoints
 * `homeapp.kiosk.<agent>.<value>` for devices, notifications and the ventilation advice.
 */
import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { api } from '../../lib/api';
import { num, timeAgo } from '../../lib/format';
import type { KioskAgent, KioskConfig, Severity } from '../../lib/types';
import { Card, CopyUrl, Field, NumInput, Switch, dimUnless, type TabProps } from './shared';
import { ALL_DAYS, TimeWindowList } from './TimeWindows';

export const DEFAULT_KIOSK: KioskConfig = {
  screenOff: true, screenOffSeconds: 180,
  alwaysOn: [], wakeOnCamera: true, wakeOnAlerts: true, wakeSeverity: 'info', wakeSeconds: 120,
  quietHours: [{ days: ALL_DAYS, from: '22:00', to: '06:00' }],
  offTimes: [], dimTimes: [], dimBrightness: 15, fullBrightness: 100,
  autoBrightness: true, minBrightness: 15, maxBrightness: 100,
  luxDark: 5, luxBright: 400, presenceMaxDistance: 0, intervalSeconds: 10, co2Altitude: 0, temperatureOffset: 0,
};

const WAKE_SEVERITIES: { value: Severity; label: string }[] = [
  { value: 'info', label: 'Alle (auch Hinweise)' },
  { value: 'warning', label: 'Warnungen und Alarme' },
  { value: 'alarm', label: 'Nur Alarme' },
];

const VALUE_LABEL: Record<string, (v: number | boolean) => string> = {
  presence: (v) => (v ? 'anwesend' : 'niemand'),
  distance: (v) => `${v} cm`,
  lux: (v) => `${num(Number(v), 0)} lx`,
  co2: (v) => `${v} ppm CO₂`,
  temperature: (v) => `${num(Number(v), 1)} °C`,
  humidity: (v) => `${num(Number(v), 0)} % rF`,
  screen: (v) => (v ? 'Display an' : 'Display aus'),
  wake: (v) => (v ? 'hält an (Zeitplan / Benachrichtigung)' : ''),
  brightness: (v) => `Helligkeit ${v} %`,
};

/** Display methods of the agent that can not set the brightness. */
const NO_DIMMING = ['wlr-randr', 'xset', 'none'];

/** What the agent does without sensors (the fixed times of the card below apply). */
function fallbackHints(a: KioskAgent) {
  if (!a.online) return [];
  return [
    a.values.presence === undefined && 'Kein Präsenzradar: Display nach festen Aus-Zeiten',
    a.values.lux === undefined && (NO_DIMMING.includes(a.display.method ?? '') ? 'Kein Lichtsensor; Helligkeit mit dieser Steuerung nicht einstellbar' : 'Kein Lichtsensor: Helligkeit nach festen Dimmzeiten'),
  ].filter((h): h is string => Boolean(h));
}

function AgentRow({ a }: { a: KioskAgent }) {
  const values = Object.entries(VALUE_LABEL).filter(([k]) => a.values[k] !== undefined).map(([k, f]) => f(a.values[k])).filter(Boolean);
  const fallback = fallbackHints(a);
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${a.online ? 'bg-emerald-400' : 'bg-rose-500'}`} aria-hidden />
        <b className="text-sm">{a.name}</b>
        <span className="text-xs text-muted">({a.id}{a.version ? ` · v${a.version}` : ''}{a.address ? ` · ${a.address}` : ''})</span>
        <span className="text-xs text-muted ml-auto">{a.online ? 'online' : `offline · ${timeAgo(a.lastSeen)}`}</span>
      </div>
      <p className="text-xs mt-1">{values.join(' · ') || 'Noch keine Messwerte'}{a.display.method ? ` · Steuerung: ${a.display.method}` : ''}</p>
      {fallback.length > 0 && <p className="text-xs text-sky-400 mt-1">{fallback.join(' · ')}</p>}
      {a.errors.length > 0 && <p className="text-xs text-amber-400 mt-1">{a.errors.join(' · ')}</p>}
      <p className="text-[0.7rem] text-muted mt-1 font-mono break-all">Datenpunkte: homeapp.kiosk.{a.id}.presence, .lux, .co2, .temperature, .humidity …</p>
    </li>
  );
}

export function KioskTab({ draft, setDraft, kioskToken }: TabProps) {
  const k = { ...DEFAULT_KIOSK, ...draft.kiosk };
  const set = (p: Partial<KioskConfig>) => setDraft({ ...draft, kiosk: { ...k, ...p } });
  const [agents, setAgents] = useState<KioskAgent[] | null>(null);
  const load = () => api.kioskAgents().then((r) => setAgents(r.agents)).catch(() => setAgents([]));
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const url = `${origin}/api/kiosk/report?token=${kioskToken ?? ''}`;

  return (
    <>
      <Card title="Wanddisplays mit Sensoren" right={<button className="btn !py-1 !text-xs" onClick={load}><RotateCw size={13} /> Aktualisieren</button>}>
        {agents === null ? <p className="text-sm text-muted">Lade …</p> : agents.length === 0 ? (
          <p className="text-sm text-muted">Noch kein Kiosk-Agent hat sich gemeldet. Installation siehe unten.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">{agents.map((a) => <AgentRow key={a.id} a={a} />)}</ul>
        )}
      </Card>

      <Card title="Installation auf dem Raspberry Pi">
        <div className="text-sm grid gap-2">
          <p>
            Der Kiosk-Agent (Ordner <code>kiosk-agent/</code> im Projekt) liest am Pi den Präsenzradar <b>LD2410</b> (UART),
            den Lichtsensor <b>BH1750</b> und den CO₂-Sensor <b>SCD41</b> (beide I²C). Er schaltet das Display bei Abwesenheit aus,
            regelt die Helligkeit nach dem Umgebungslicht und meldet alle Werte hierher.
          </p>
          <p className="text-muted text-xs">
            Auf dem Pi: <code>sudo ./install.sh</code> ausführen und dabei die folgende Adresse angeben (enthält den geheimen Schlüssel).
            Verkabelung und Details stehen in der README.
          </p>
          <CopyUrl label="Melde-Adresse für den Agenten" url={url} />
        </div>
      </Card>

      <Card title="Display-Steuerung (vom Agenten ausgeführt)">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          <div className="sm:col-span-2"><Switch label="Display ausschalten, wenn niemand da ist (Präsenzradar)" checked={k.screenOff} onChange={(v) => set({ screenOff: v })} /></div>
          <Field label="Ausschalten nach (Sekunden ohne Präsenz)" hint="Ohne Radar: so lange bleibt es in einer Aus-Zeit nach einer Berührung an."><NumInput value={k.screenOffSeconds} onChange={(v) => set({ screenOffSeconds: v ?? 180 })} /></Field>
          <Field label="Max. Entfernung für Präsenz (cm)" hint="0 = gesamter Bereich des Radars. Hilft, wenn der Radar durch Wände oder in den Flur sieht.">
            <NumInput value={k.presenceMaxDistance} onChange={(v) => set({ presenceMaxDistance: v ?? 0 })} />
          </Field>
          <div className="sm:col-span-2"><Switch label="Helligkeit automatisch nach Umgebungslicht (Lichtsensor)" checked={k.autoBrightness} onChange={(v) => set({ autoBrightness: v })} /></div>
          <Field label="Minimale Helligkeit (%)" hint="Bei Dunkelheit (Lichtsensor)."><NumInput value={k.minBrightness} onChange={(v) => set({ minBrightness: v ?? 15 })} /></Field>
          <Field label="Maximale Helligkeit (%)"><NumInput value={k.maxBrightness} onChange={(v) => set({ maxBrightness: v ?? 100 })} /></Field>
          <Field label="Dunkel ab (Lux)" hint="Bei so wenig Licht gilt die minimale Helligkeit."><NumInput value={k.luxDark} onChange={(v) => set({ luxDark: v ?? 5 })} /></Field>
          <Field label="Hell ab (Lux)" hint="Ab hier volle Helligkeit; dazwischen logarithmisch."><NumInput value={k.luxBright} onChange={(v) => set({ luxBright: v ?? 400 })} /></Field>
        </div>
      </Card>

      <Card title="Feste Zeiten ohne Sensoren">
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            Für Displays ohne Präsenzradar oder Lichtsensor (oder wenn ein Sensor ausfällt). Die Zeiten gelten in der Ortszeit des Raspberry Pi; ein Zeitraum darf über Mitternacht gehen.
          </p>
          <div>
            <h4 className="text-sm font-semibold mb-1">Display aus</h4>
            <p className="text-xs text-muted mb-2">
              Gilt, wenn kein Präsenzradar Werte liefert oder das Ausschalten bei Abwesenheit oben aus ist. Eine Berührung schaltet das Display ein;
              „Immer an“ und das Wecken bei Einblendungen und Benachrichtigungen (unten) wirken ebenfalls.
            </p>
            <TimeWindowList
              windows={k.offTimes}
              onChange={(offTimes) => set({ offTimes })}
              template={{ days: ALL_DAYS, from: '23:00', to: '06:00' }}
              addLabel="Aus-Zeit"
              empty="Keine Aus-Zeiten: Ohne Präsenzradar bleibt das Display immer an."
            />
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-1">Gedimmt</h4>
            <p className="text-xs text-muted mb-2">
              Gilt, wenn kein Lichtsensor Werte liefert oder die automatische Helligkeit oben aus ist: in diesen Zeiten gedimmt ({k.dimBrightness} %), sonst hell ({k.fullBrightness} %).
              Nur mit einer Display-Steuerung, die die Helligkeit einstellen kann (backlight, ddcutil, eigener Befehl); sonst hilft die Nachtabdunkelung unter <i>Anzeige</i>. Benötigt Kiosk-Agent ab Version 1.2.0.
            </p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-3">
              <Field label="Gedimmte Helligkeit (%)" hint="In den Dimmzeiten.">
                <NumInput value={k.dimBrightness} onChange={(v) => set({ dimBrightness: v ?? 15 })} />
              </Field>
              <Field label="Helle Helligkeit (%)" hint="Außerhalb der Dimmzeiten.">
                <NumInput value={k.fullBrightness} onChange={(v) => set({ fullBrightness: v ?? 100 })} />
              </Field>
            </div>
            <TimeWindowList
              windows={k.dimTimes}
              onChange={(dimTimes) => set({ dimTimes })}
              template={{ days: ALL_DAYS, from: '21:00', to: '07:00' }}
              addLabel="Dimmzeit"
              empty={`Keine Dimmzeiten: Ohne Lichtsensor gilt immer die helle Helligkeit (${k.fullBrightness} %).`}
            />
          </div>
        </div>
      </Card>

      <Card title="Zeitplan und Wecken">
        <div className={`grid gap-4 ${dimUnless(k.screenOff || k.offTimes.length > 0)}`}>
          <p className="text-sm text-muted">
            Gilt, wenn das Display bei Abwesenheit oder in festen Aus-Zeiten ausgeht. Die Zeiten gelten in der Ortszeit des Raspberry Pi; ein Zeitraum darf über Mitternacht gehen.
            Präsenz und Berührung schalten das Display immer ein. Benötigt Kiosk-Agent ab Version 1.1.0.
          </p>
          <div>
            <h4 className="text-sm font-semibold mb-1">Immer an</h4>
            <p className="text-xs text-muted mb-2">In diesen Zeiten bleibt das Display an, auch wenn niemand davor steht, z. B. morgens beim Frühstück.</p>
            <TimeWindowList
              windows={k.alwaysOn}
              onChange={(alwaysOn) => set({ alwaysOn })}
              template={{ days: [1, 2, 3, 4, 5], from: '06:30', to: '08:00' }}
              addLabel="Zeitraum"
              empty="Keine Zeiträume: Das Display folgt nur der Präsenz."
            />
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Display einschalten bei</h4>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <div className="sm:col-span-2"><Switch label="Kamera-Einblendungen (Bewegung / Person, wenn sie laut „Kameras & Einblendungen“ erscheinen)" checked={k.wakeOnCamera} onChange={(v) => set({ wakeOnCamera: v })} /></div>
              <div className="sm:col-span-2"><Switch label="Neuen Benachrichtigungen (Glocke, Müllabfuhr, Lüften, 3D-Druck beendet)" checked={k.wakeOnAlerts} onChange={(v) => set({ wakeOnAlerts: v })} /></div>
              <Field label="Benachrichtigungen ab Stufe">
                <select className="field" value={k.wakeSeverity} disabled={!k.wakeOnAlerts} onChange={(e) => set({ wakeSeverity: e.target.value as Severity })}>
                  {WAKE_SEVERITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Danach an bleiben (Sekunden ohne Präsenz)" hint="Kommt jemand vor das Display, bleibt es wie gewohnt an.">
                <NumInput value={k.wakeSeconds} onChange={(v) => set({ wakeSeconds: v ?? 120 })} />
              </Field>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-1">Ruhezeiten</h4>
            <p className="text-xs text-muted mb-2">In diesen Zeiten schalten Kamera-Einblendungen und Benachrichtigungen das Display nicht ein, z. B. nachts.</p>
            <TimeWindowList
              windows={k.quietHours}
              onChange={(quietHours) => set({ quietHours })}
              template={{ days: ALL_DAYS, from: '22:00', to: '06:00' }}
              addLabel="Ruhezeit"
              empty="Keine Ruhezeiten: Einblendungen und Benachrichtigungen wecken das Display rund um die Uhr."
            />
          </div>
        </div>
      </Card>

      <Card title="Messung">
        <div className="grid sm:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Meldeintervall (Sekunden)" hint="Präsenzwechsel werden sofort gemeldet."><NumInput value={k.intervalSeconds} onChange={(v) => set({ intervalSeconds: v ?? 10 })} /></Field>
          <Field label="Höhe über NN (m)" hint="Verbessert die CO₂-Messung des SCD41."><NumInput value={k.co2Altitude} onChange={(v) => set({ co2Altitude: v ?? 0 })} /></Field>
          <Field label="Temperatur-Korrektur (K)" hint="Der Pi wärmt den Sensor; z. B. -2."><NumInput value={k.temperatureOffset} onChange={(v) => set({ temperatureOffset: v ?? 0 })} /></Field>
        </div>
      </Card>
    </>
  );
}
