/**
 * Bambu Lab printer on the printer page: health messages (HMS), state of the printer (step, layer,
 * speed, fans, light) with the controls, and the AMS with its spools. The data comes from the server
 * (see server bambu.js); commands go to POST /api/printer/command.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Droplets, ExternalLink, Fan, Gauge, Layers, Lightbulb, LightbulbOff, Pause, Play, Square, Thermometer, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { num } from '../lib/format';
import { HMS_SEVERITY, HMS_WIKI_URL, amsHumidity, isLightColor } from '../lib/printer';
import type { BambuDetails, BambuTray, PrinterCommand, PrinterData } from '../lib/types';
import { LevelBar, Panel } from './ui';
import { toneStyle } from './Hud';

const SPEEDS = [
  { level: 1, label: 'Leise' },
  { level: 2, label: 'Standard' },
  { level: 3, label: 'Sport' },
  { level: 4, label: 'Ludicrous' },
];

/** Health messages of the printer with a link to the explanations in the Bambu wiki. */
export function HmsCard({ hms }: { hms: BambuDetails['hms'] }) {
  if (!hms.length) return null;
  const worst = hms.find((h) => h.severity === 'fatal') ?? hms.find((h) => h.severity === 'serious') ?? hms[0];
  const color = HMS_SEVERITY[worst.severity].color;
  return (
    <section className="glass p-4 sm:p-5" style={{ ...toneStyle(color), borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}>
      <div className="flex items-center gap-2 mb-2">
        <TriangleAlert size={18} style={{ color }} />
        <h2 className="section-title flex-1">Meldungen des Druckers</h2>
        <a className="text-xs text-muted inline-flex items-center gap-1 hover:underline" href={HMS_WIKI_URL} target="_blank" rel="noreferrer">
          HMS-Wiki <ExternalLink size={12} />
        </a>
      </div>
      <ul className="grid gap-1.5 text-sm">
        {hms.map((h) => (
          <li key={h.code} className="flex items-center gap-2 flex-wrap">
            <span className="chip !cursor-default !py-0.5" style={toneStyle(HMS_SEVERITY[h.severity].color)}>{HMS_SEVERITY[h.severity].label}</span>
            <code className="font-mono tabular-nums">HMS_{h.code}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sends a command; remembers the error of the last one for a few seconds. */
function useCommand() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async (cmd: PrinterCommand) => {
    setBusy(cmd.action);
    setError(null);
    try {
      await api.printerCommand(cmd);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setError(null), 6000);
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

/** Pause / resume and cancel (with a second tap to confirm). */
function PrintControls({ p, run, busy }: { p: PrinterData; run: (c: PrinterCommand) => void; busy: string | null }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 5000);
    return () => clearTimeout(t);
  }, [confirm]);
  if (!p.active) return null;
  const paused = p.state === 'paused';
  return (
    <div className="flex flex-wrap gap-2">
      {paused ? (
        <button className="btn primary" disabled={busy !== null} onClick={() => run({ action: 'resume' })}><Play size={16} /> Fortsetzen</button>
      ) : (
        <button className="btn" disabled={busy !== null} onClick={() => run({ action: 'pause' })}><Pause size={16} /> Pausieren</button>
      )}
      {confirm ? (
        <button className="btn ack" disabled={busy !== null} onClick={() => { setConfirm(false); run({ action: 'stop' }); }}><Square size={15} /> Wirklich abbrechen?</button>
      ) : (
        <button className="btn danger" disabled={busy !== null} onClick={() => setConfirm(true)}><Square size={15} /> Abbrechen</button>
      )}
    </div>
  );
}

/** Step, layer, speed, fans and light of the printer; with the controls if they are allowed. */
export function BambuStatusCard({ p }: { p: PrinterData }) {
  const b = p.bambu;
  const { busy, error, run } = useCommand();
  if (!b) return null;
  const controls = Boolean(p.controls && p.connected);
  const facts: { key: string; icon: ReactNode; label: string; value: string }[] = [];
  if (b.stage) facts.push({ key: 'stage', icon: <Gauge size={12} />, label: 'Schritt', value: b.stage });
  if (b.layer) facts.push({ key: 'layer', icon: <Layers size={12} />, label: 'Schicht', value: `${num(b.layer.current, 0)} / ${num(b.layer.total, 0)}` });
  if (b.speed) facts.push({ key: 'speed', icon: <Gauge size={12} />, label: 'Geschwindigkeit', value: `${b.speed.label}${b.speed.percent ? ` (${b.speed.percent} %)` : ''}` });
  return (
    <Panel
      title="Drucker"
      right={b.light != null && (
        controls ? (
          <button className={`chip ${b.light ? 'on' : ''}`} disabled={busy !== null} onClick={() => run({ action: 'light', on: !b.light })} aria-pressed={b.light}>
            {b.light ? <Lightbulb size={14} /> : <LightbulbOff size={14} />} Licht {b.light ? 'an' : 'aus'}
          </button>
        ) : (
          <span className="chip !cursor-default">{b.light ? <Lightbulb size={14} /> : <LightbulbOff size={14} />} Licht {b.light ? 'an' : 'aus'}</span>
        )
      )}
    >
      {facts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {facts.map((f) => (
            <div key={f.key} className={`min-w-0 ${f.key === 'stage' ? 'col-span-2 sm:col-span-1' : ''}`}>
              <div className="text-[0.65rem] uppercase tracking-wider text-muted flex items-center gap-1 truncate">{f.icon}{f.label}</div>
              <div className="font-semibold truncate" title={f.value}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
      {b.fans.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2" style={toneStyle('#22d3ee')}>
          {b.fans.map((f) => (
            <div key={f.key} className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm">
                <Fan size={13} className={`text-muted ${f.percent ? 'anim-spin-slow' : ''}`} />
                <span className="text-muted truncate flex-1">{f.label}</span>
                <b className="tabular-nums">{f.percent == null ? '–' : `${f.percent} %`}</b>
              </div>
              <LevelBar value={f.percent ?? 0} label={f.label} />
            </div>
          ))}
        </div>
      )}
      {controls && p.active && (
        <div className="mt-4 pt-4 border-t border-line grid gap-3">
          <div>
            <div className="text-xs font-semibold text-muted mb-1.5">Geschwindigkeit</div>
            <div className="flex flex-wrap gap-2">
              {SPEEDS.map((s) => (
                <button key={s.level} className={`chip ${b.speed?.level === s.level ? 'on' : ''}`} disabled={busy !== null} aria-pressed={b.speed?.level === s.level} onClick={() => run({ action: 'speed', level: s.level })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <PrintControls p={p} run={run} busy={busy} />
        </div>
      )}
      {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
    </Panel>
  );
}

/** One spool: colour disc with the material, name and remaining filament. */
function Spool({ t, label }: { t: BambuTray; label: string }) {
  if (t.empty) {
    return (
      <div className="rounded-xl border border-dashed border-line p-2 text-center text-xs text-muted min-w-0">
        <div className="mx-auto mb-1.5 w-10 h-10 rounded-full border-2 border-dashed border-line" />
        {label}<br />leer
      </div>
    );
  }
  const color = t.color ?? '#64748b';
  const side = t.nozzle === 'left' ? 'links' : t.nozzle === 'right' ? 'rechts' : null;
  return (
    <div
      className="rounded-xl border p-2 text-center min-w-0 relative"
      style={{ borderColor: t.active ? color : 'var(--line)', boxShadow: t.active ? `0 0 14px -4px ${color}` : undefined }}
      title={[t.name, t.type, t.remain != null ? `${t.remain} % übrig` : null, side ? `Düse ${side}` : null].filter(Boolean).join(' · ')}
    >
      {side && <span className="absolute top-1 left-1.5 text-[0.6rem] font-bold text-muted" aria-label={`Düse ${side}`}>{side === 'links' ? 'L' : 'R'}</span>}
      {t.active && <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full anim-breathe" style={{ background: color }} aria-label="aktiv" />}
      <div
        className="mx-auto mb-1.5 w-10 h-10 rounded-full grid place-items-center text-[0.6rem] font-bold border border-white/20"
        style={{ background: color, color: isLightColor(color) ? '#0f172a' : '#fff' }}
      >
        {t.type}
      </div>
      <div className="text-xs font-semibold truncate">{t.name ?? t.type}</div>
      <div className="text-[0.65rem] text-muted">{label}{t.remain != null ? ` · ${t.remain} %` : ''}</div>
      {t.remain != null && (
        <div className="h-1 mt-1 rounded-full bg-[var(--track)] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${t.remain}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

/** AMS units with humidity and temperature, their slots and the external spools. */
export function AmsCard({ b }: { b: BambuDetails }) {
  const { units, external } = b.ams;
  if (!units.length && !external.length) return null;
  return (
    <Panel title={units.length ? 'AMS' : 'Filament'}>
      <div className="grid gap-4">
        {units.map((u) => {
          const humidity = amsHumidity(u);
          return (
            <div key={u.id}>
              <div className="flex items-center gap-3 text-sm mb-2">
                <span className="font-semibold flex-1">{u.name}</span>
                {humidity && <span className="text-muted inline-flex items-center gap-1"><Droplets size={13} /> {humidity}</span>}
                {u.temp != null && <span className="text-muted inline-flex items-center gap-1"><Thermometer size={13} /> {num(u.temp, 1)} °C</span>}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {u.trays.map((t, i) => <Spool key={t.id} t={t} label={`Slot ${Number(t.id) + 1 || i + 1}`} />)}
              </div>
            </div>
          );
        })}
        {external.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-2">{external.length > 1 ? 'Externe Spulen' : 'Externe Spule'}</div>
            <div className="grid grid-cols-4 gap-2">{external.map((t) => <Spool key={t.id} t={t} label={t.label} />)}</div>
          </div>
        )}
      </div>
    </Panel>
  );
}
