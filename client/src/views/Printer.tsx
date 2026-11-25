/**
 * Printer page ("3D-Drucker"): webcam (tap = MJPEG live view), the current print with progress gauge,
 * remaining time and expected end, temperatures with the curve of the last 30 minutes and details
 * of the job and the connection (OctoPrint or Bambu Lab). For Bambu Lab printers also health
 * messages, state and controls and the AMS. The data is pushed by the server (see server octoprint.js).
 */
import { useEffect, useState } from 'react';
import { CloudOff, Expand, Printer3d, Radio, X } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { clockTime, num } from '../lib/format';
import { duration, fileLabel, filamentText, percent, printerStatus, sourceName, wifiText } from '../lib/printer';
import type { PrinterData, PrinterTempHistory } from '../lib/types';
import { AreaChart, Legend, type ChartSeries } from '../components/Charts';
import { ArcGauge, toneStyle } from '../components/Hud';
import { Empty, Modal, OpenSettingsButton, PageHeader, Panel, Rise, Stagger } from '../components/ui';
import { PrintFacts, PrintProgressBar, PrinterLive, PrinterStateChip, PrinterWebcam } from '../components/Printer';
import { AmsCard, BambuStatusCard, HmsCard } from '../components/Bambu';

/** Curve colours per sensor. */
const TEMP_COLORS: Record<string, string> = { tool0: '#fb923c', tool1: '#f43f5e', tool2: '#facc15', bed: '#38bdf8', chamber: '#a78bfa' };
const tempColor = (key: string) => TEMP_COLORS[key] ?? '#94a3b8';

/** Where OctoPrint's remaining time comes from. */
const LEFT_ORIGIN: Record<string, string> = {
  linear: 'linear hochgerechnet',
  analysis: 'G-Code-Analyse',
  estimate: 'Schätzung',
  average: 'Durchschnitt früherer Drucke',
  'mixed-analysis': 'Analyse und Schätzung',
  'mixed-average': 'Durchschnitt und Schätzung',
};

/** Temperature curves of the last ~30 minutes, refreshed every 30 seconds while the page is open. */
function useTempHistory(enabled: boolean) {
  const [data, setData] = useState<PrinterTempHistory>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api.printerTemps().then((d) => alive && setData(d)).catch(() => { /* keep the last curve */ });
    };
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return data;
}

/** Webcam picture in the ratio of the camera; a tap opens the live view. */
function WebcamCard({ p, onLive }: { p: PrinterData; onLive: () => void }) {
  return (
    <button className="glass block w-full overflow-hidden p-0 text-left relative" onClick={onLive} aria-label="Live-Bild öffnen">
      <div className="relative" style={{ aspectRatio: p.webcam.ratio === '4:3' ? '4 / 3' : '16 / 9' }}>
        <PrinterWebcam className="absolute inset-0" />
        <div className="absolute inset-x-0 top-0 p-3 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent text-white">
          <span className="w-2 h-2 rounded-full bg-red-500 anim-breathe" />
          <span className="text-sm font-semibold drop-shadow">Webcam</span>
          <Expand size={14} className="ml-auto opacity-70" />
        </div>
      </div>
    </button>
  );
}

/** The current (or last) print: gauge, file, progress bar and times. */
function JobCard({ p }: { p: PrinterData }) {
  const st = printerStatus(p);
  const pct = percent(p);
  if (!p.job) {
    return (
      <Panel title="Druckauftrag">
        <p className="text-sm text-muted">{p.connected ? 'Kein Druckauftrag geladen.' : `Keine Daten, solange ${p.kind === 'bambu' ? 'der Drucker' : 'OctoPrint'} nicht erreichbar ist.`}</p>
      </Panel>
    );
  }
  return (
    <Panel title={p.active ? 'Aktueller Druck' : 'Letzter Druck'} right={<PrinterStateChip p={p} />}>
      {/* gauge beside the text only if the card itself is wide enough for the three times (container query, see SpotifyView) */}
      <div className="@container">
        <div className="grid gap-4 items-center @min-[26rem]:grid-cols-[minmax(0,8rem)_minmax(0,1fr)]" style={toneStyle(st.color)}>
          <div className="w-full max-w-[9rem] mx-auto"><ArcGauge value={pct} max={100} unit="%" colors={['#6366f1', st.color]} /></div>
          <div className="min-w-0">
            <div className="font-semibold break-words leading-snug" title={p.job.file}>{fileLabel(p.job.file)}</div>
            <PrintProgressBar p={p} className="mt-3" />
            {p.active ? (
              <PrintFacts p={p} className="mt-3" />
            ) : (
              <p className="text-sm text-muted mt-3">Druckzeit {duration(p.progress?.printTime)}</p>
            )}
          </div>
        </div>
      </div>
      {p.printerError && <p className="text-sm text-rose-400 mt-3">{p.printerError}</p>}
    </Panel>
  );
}

/** Current temperatures and their curves (actual as area, target as thin line). */
function TempCard({ p }: { p: PrinterData }) {
  const history = useTempHistory(p.enabled && p.connected);
  const series: ChartSeries[] = [];
  for (const [key, s] of Object.entries(history)) {
    series.push({ id: key, label: s.label, color: tempColor(key), data: s.actual });
    if (s.target.some(([, v]) => v > 0)) series.push({ id: `${key}-target`, label: `${s.label} (Soll)`, color: `${tempColor(key)}99`, data: s.target, line: true });
  }
  return (
    <Panel title="Temperaturen" right={series.length > 0 && <Legend items={series} />}>
      {p.temps.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {p.temps.map((t) => {
            const heating = t.target != null && t.target > 0 && t.actual != null && t.actual < t.target - 2;
            return (
              <div key={t.key} className="rounded-xl px-3 py-2 border border-line" style={{ background: `color-mix(in srgb, ${tempColor(t.key)} 8%, transparent)`, borderTop: `2px solid ${tempColor(t.key)}` }}>
                <div className="text-[0.65rem] text-muted uppercase tracking-wider">{t.label}{heating ? ' · heizt' : ''}</div>
                <div className="text-2xl font-bold tabular-nums">{t.actual == null ? '–' : num(t.actual, 1)}<span className="text-sm text-muted font-semibold"> °C</span></div>
                <div className="text-xs text-muted">{t.target ? `Soll ${num(t.target, 0)} °C` : 'Heizung aus'}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">{p.connected && p.kind !== 'bambu' ? 'Der Drucker ist nicht mit OctoPrint verbunden – keine Temperaturen.' : 'Keine Daten.'}</p>
      )}
      {series.length > 0 && (
        <div className="mt-4">
          <div className="text-[0.65rem] text-muted uppercase tracking-[0.18em] mb-1">Letzte 30 Minuten</div>
          <AreaChart series={series} height={200} unit="°C" format={(v) => num(v, 0)} />
        </div>
      )}
    </Panel>
  );
}

/** File, source, filament and connection details. */
function DetailsCard({ p }: { p: PrinterData }) {
  const rows: [string, string][] = [];
  if (p.job) {
    rows.push(['Datei', p.job.file]);
    if (p.job.size != null) rows.push(['Größe', `${num(p.job.size / 1048576, 1)} MB`]);
    rows.push(['Speicherort', p.job.origin === 'sdcard' ? 'SD-Karte des Druckers' : p.job.origin === 'cloud' ? 'Bambu Cloud' : 'OctoPrint']);
    if (p.job.user) rows.push(['Gestartet von', p.job.user]);
    const fil = filamentText(p.job.filament);
    if (fil) rows.push(['Filament', fil]);
    if (p.job.estimatedPrintTime != null) rows.push(['Geschätzte Druckzeit', duration(p.job.estimatedPrintTime)]);
    const origin = p.progress?.printTimeLeftOrigin;
    if (p.active && origin) rows.push(['Restzeit aus', LEFT_ORIGIN[origin] ?? origin]);
  }
  rows.push([`Zustand (${sourceName(p)})`, p.stateText || '–']);
  const b = p.bambu;
  if (b?.model) rows.push(['Modell', b.model]);
  if (p.version) rows.push(['Version', p.version]);
  if (b) {
    if (b.serial) rows.push(['Seriennummer', b.serial]);
    for (const n of b.nozzles) {
      const value = [n.diameter ? `${num(n.diameter, 1)} mm` : null, n.type, n.active ? 'aktiv' : null].filter(Boolean).join(' · ');
      if (value) rows.push([n.label, value]);
    }
    const wifi = wifiText(b.wifi);
    if (wifi) rows.push(['WLAN', wifi]);
    if (b.sdcard != null) rows.push(['Speicherkarte', b.sdcard ? 'eingesteckt' : 'fehlt']);
    if (b.timelapse != null) rows.push(['Zeitraffer', b.timelapse ? 'an' : 'aus']);
  }
  if (p.user) rows.push(['Angemeldet als', p.user]);
  rows.push(['Aktualisiert', clockTime(p.updatedAt)]);
  return (
    <Panel title="Details">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Live view of the webcam in a large dialog (the MJPEG stream closes with it). */
function LiveDialog({ p, open, onClose }: { p: PrinterData; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} wide zoom>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="chip on !bg-red-500/90"><Radio size={13} className="anim-breathe" /> LIVE</span>
          <h2 className="text-lg font-semibold flex-1 truncate">{p.name}</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>
        <div className="rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: p.webcam.ratio === '4:3' ? '4 / 3' : '16 / 9' }}>
          {open && <PrinterLive className="w-full h-full" />}
        </div>
      </div>
    </Modal>
  );
}

/** Page of the 3D printer. */
export function PrinterView() {
  const p = useStore((s) => s.printer);
  const [live, setLive] = useState(false);

  if (!p?.enabled) {
    return (
      <div>
        <PageHeader title="3D-Drucker" />
        <Empty icon={<Printer3d size={28} />} title="Kein 3D-Drucker eingerichtet" text="Verbinde OctoPrint oder einen Bambu-Lab-Drucker unter Einstellungen → 3D-Drucker, dann erscheinen hier Fortschritt, Temperaturen und das Webcam-Bild.">
          <OpenSettingsButton />
        </Empty>
      </div>
    );
  }

  const subtitle = !p.connected
    ? p.error ?? (p.kind === 'bambu' ? 'Verbindet mit dem Drucker …' : 'Verbindet mit OctoPrint …')
    : [p.demo ? 'Simulierter Drucker (Demo)' : p.version, p.active && p.progress?.printTimeLeft != null ? `noch ${duration(p.progress.printTimeLeft)}` : null].filter(Boolean).join(' · ');

  // two columns only when the page itself is wide enough (container query in the scaled rem of the
  // kiosk mode, see SpotifyView); in one column: webcam, current print, printer state (Bambu),
  // AMS (Bambu), temperatures, details
  const col = 'contents @5xl:flex flex-col gap-4 min-w-0';
  return (
    <div className="@container">
      <PageHeader title={p.name} subtitle={subtitle}>
        <PrinterStateChip p={p} />
        {p.webcam.available && (
          <button className="btn" onClick={() => setLive(true)}><Radio size={15} /> Live</button>
        )}
      </PageHeader>
      {!p.connected && p.error ? (
        <Empty icon={<CloudOff size={28} />} title={`${sourceName(p)} nicht erreichbar`} text={p.error}>
          <OpenSettingsButton />
        </Empty>
      ) : (
        <>
          {p.bambu && p.bambu.hms.length > 0 && <div className="mb-4"><HmsCard hms={p.bambu.hms} /></div>}
          <Stagger className="grid gap-4 @5xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
            <Rise className={col}>
              {p.webcam.available && <div className="min-w-0 order-1 @5xl:order-none"><WebcamCard p={p} onLive={() => setLive(true)} /></div>}
              {p.bambu && <div className="min-w-0 order-4 @5xl:order-none empty:hidden"><AmsCard b={p.bambu} /></div>}
              <div className="min-w-0 order-5 @5xl:order-none"><TempCard p={p} /></div>
            </Rise>
            <Rise className={col}>
              <div className="min-w-0 order-2 @5xl:order-none"><JobCard p={p} /></div>
              {p.bambu && <div className="min-w-0 order-3 @5xl:order-none"><BambuStatusCard p={p} /></div>}
              <div className="min-w-0 order-6 @5xl:order-none"><DetailsCard p={p} /></div>
            </Rise>
          </Stagger>
        </>
      )}
      <LiveDialog p={p} open={live} onClose={() => setLive(false)} />
    </div>
  );
}
