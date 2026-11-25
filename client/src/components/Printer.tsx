/**
 * 3D printer (OctoPrint or Bambu Lab): webcam picture (MJPEG live video or refreshing pictures, oriented
 * like in OctoPrint), state chip, progress bar, key figures and temperatures, the overview panels (HUD panel for
 * the standard overview and the "Eigene" widget, one-row strip for the kiosk) and the webcam pop-up
 * that appears regularly while printing and when the print ends. Pictures come from the server, which
 * proxies OctoPrint or the camera of the Bambu Lab printer.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { BellOff, Clock3, Flag, Printer3d, Thermometer, Timer, X } from 'lucide-react';
import { PRINTER_SNAPSHOT_URL, PRINTER_STREAM_URL } from '../lib/api';
import { useStore } from '../lib/store';
import { useNow } from '../lib/hooks';
import { useMedia } from '../lib/display';
import { num } from '../lib/format';
import { POPUP_TITLE, bambuJobLine, duration, fileLabel, finishTime, percent, printerStatus, webcamTransform } from '../lib/printer';
import type { PopupPosition, PopupSize, PrinterData, PrinterPopupEvent, PrinterPopupReason, PrinterTemp } from '../lib/types';
import { POPUP_WIDTH, RefreshingImage, StreamImage } from './Cameras';
import { HudPanel, toneStyle } from './Hud';

/** True while a print runs and the overview should show it (setting "Auf der Übersicht anzeigen"). */
export const usePrintOnOverview = () =>
  useStore((s) => Boolean(s.printer?.enabled && s.printer.connected && s.printer.active && s.config?.octoprint.dashboard !== false));

/**
 * Styles that show the picture like OctoPrint does: mirrored and / or turned by 90° anticlockwise.
 * A turned picture is laid out with swapped sides (container query units), so it fills its box.
 */
function orientation(webcam: PrinterData['webcam'] | undefined): { wrap?: CSSProperties; img?: CSSProperties } {
  const transform = webcamTransform(webcam);
  if (!transform) return {};
  if (!webcam?.rotate90) return { img: { transform } };
  return {
    wrap: { containerType: 'size' },
    img: { position: 'absolute', left: '50%', top: '50%', width: '100cqh', height: '100cqw', maxWidth: 'none', transform: `translate(-50%, -50%) ${transform}` },
  };
}

/**
 * Webcam picture of the printer: the MJPEG live video if "Webcam als Live-Video" is on (or `live` is set),
 * otherwise – and while the stream is not available – pictures refreshing every `seconds` (default from
 * the settings).
 */
export function PrinterWebcam({ className = '', seconds, fit = 'cover', live }: { className?: string; seconds?: number; fit?: 'cover' | 'contain'; live?: boolean }) {
  const webcam = useStore((s) => s.printer?.webcam);
  const refresh = useStore((s) => s.config?.octoprint.webcamRefreshSeconds ?? 2);
  const liveSetting = useStore((s) => s.config?.octoprint.webcamLive !== false);
  const o = orientation(webcam);
  const inner = o.wrap ? 'absolute inset-0' : className;
  const pictures = <RefreshingImage url={PRINTER_SNAPSHOT_URL} seconds={seconds ?? refresh} fit={fit} imgStyle={o.img} className={inner} />;
  const image = live ?? liveSetting
    ? <StreamImage url={PRINTER_STREAM_URL} fallback={pictures} fit={fit} imgStyle={o.img} className={inner} />
    : pictures;
  return o.wrap ? <div className={`relative ${className}`} style={o.wrap}>{image}</div> : image;
}

/** Live MJPEG stream of the printer webcam for the large live view (falls back to pictures every second). */
export function PrinterLive({ className = '' }: { className?: string }) {
  return <PrinterWebcam live seconds={1} fit="contain" className={className} />;
}

/** Coloured chip with the state of the printer (pulses while a print runs). */
export function PrinterStateChip({ p, className = '' }: { p: PrinterData | null; className?: string }) {
  const s = printerStatus(p);
  return (
    <span className={`chip on !cursor-default ${className}`} style={toneStyle(s.color)}>
      {p?.active && <i className="w-1.5 h-1.5 rounded-full bg-white anim-breathe" />}
      {s.label}
    </span>
  );
}

/** Progress of the print as a glowing bar in the colour of the state. */
export function PrintProgressBar({ p, className = '' }: { p: PrinterData; className?: string }) {
  const color = printerStatus(p).color;
  const value = Math.min(100, Math.max(0, p.progress?.completion ?? 0));
  return (
    <div className={`h-2 rounded-full bg-[var(--track)] overflow-hidden ${className}`} role="progressbar" aria-label="Druckfortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: color, boxShadow: `0 0 10px ${color}`, transition: 'width 1s linear' }} />
    </div>
  );
}

/** Remaining time, expected end and elapsed print time. */
export function PrintFacts({ p, className = '' }: { p: PrinterData; className?: string }) {
  const now = useNow(30000);
  const items = [
    { key: 'left', icon: <Timer size={12} />, label: 'Restzeit', value: duration(p.progress?.printTimeLeft) },
    { key: 'end', icon: <Flag size={12} />, label: 'Fertig um', value: finishTime(p.progress?.printTimeLeft, now) ?? '–' },
    { key: 'time', icon: <Clock3 size={12} />, label: 'Druckzeit', value: duration(p.progress?.printTime) },
  ];
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {items.map((i) => (
        <div key={i.key} className="min-w-0">
          <div className="text-[0.65rem] uppercase tracking-wider text-muted flex items-center gap-1 truncate">{i.icon}{i.label}</div>
          <div className="font-semibold tabular-nums truncate">{i.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Actual and target temperatures ("Düse 215° / 215°"); a target of 0 means the heater is off. */
export function PrinterTemps({ temps, className = '' }: { temps: PrinterTemp[]; className?: string }) {
  if (!temps.length) return null;
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${className}`}>
      {temps.map((t) => (
        <span key={t.key} className="inline-flex items-center gap-1 tabular-nums whitespace-nowrap">
          <Thermometer size={13} className="text-muted" />
          <span className="text-muted">{t.label}</span>
          <b>{t.actual == null ? '–' : `${num(t.actual, 0)}°`}</b>
          {t.target ? <span className="text-muted">/ {num(t.target, 0)}°</span> : null}
        </span>
      ))}
    </div>
  );
}

/** Percentage, file and progress bar of the current (or last) print. */
function JobSummary({ p }: { p: PrinterData }) {
  const pct = percent(p);
  const extra = bambuJobLine(p);
  return (
    <>
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="text-4xl font-bold leading-none hud-glow-text tabular-nums shrink-0">
          {pct ?? '–'}
          <span className="text-lg text-muted font-semibold">%</span>
        </span>
        <span className="text-sm truncate" title={p.job?.file}>{fileLabel(p.job?.file) || 'Druckauftrag'}</span>
      </div>
      <PrintProgressBar p={p} className="mt-3" />
      {extra && <div className="text-xs text-muted mt-1.5 truncate">{extra}</div>}
    </>
  );
}

/**
 * Overview panel of the printer: webcam, progress, times and temperatures; a tap opens the printer
 * page. Shown on the standard overview while printing and as widget of the own start page.
 */
export function PrinterPanel({ className = '', webcam = true }: { className?: string; webcam?: boolean }) {
  const p = useStore((s) => s.printer);
  const setView = useStore((s) => s.setView);
  if (!p?.enabled) return null;
  const st = printerStatus(p);
  const cam = webcam && p.webcam.available;
  return (
    <HudPanel
      title={<span className="inline-flex items-center gap-1.5 min-w-0"><Printer3d size={13} className="shrink-0" /> <span className="truncate">{p.name}</span></span>}
      color={st.color}
      right={<span className="font-semibold" style={{ color: st.color }}>{st.label}</span>}
      onClick={() => setView('printer')}
      className={className}
    >
      <div className={`grid gap-4 items-center ${cam ? 'sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]' : ''}`}>
        {cam && (
          <div className="relative aspect-video rounded-xl overflow-hidden border border-line">
            <PrinterWebcam className="absolute inset-0" />
          </div>
        )}
        <div className="min-w-0">
          {!p.connected ? (
            <p className="text-sm text-rose-400">{p.error ?? 'Verbindet …'}</p>
          ) : p.job ? (
            <>
              {!p.active && <div className="text-[0.65rem] uppercase tracking-wider text-muted mb-1">Letzter Druck</div>}
              <JobSummary p={p} />
              {p.active && <PrintFacts p={p} className="mt-3" />}
            </>
          ) : (
            <p className="text-sm text-muted">Kein Druckauftrag</p>
          )}
          {p.printerError && <p className="text-xs text-rose-400 mt-2">{p.printerError}</p>}
          <PrinterTemps temps={p.temps} className="mt-3" />
        </div>
      </div>
    </HudPanel>
  );
}

/** One-row strip for the kiosk overview while printing: state, file, progress, remaining time and end. */
export function PrinterStrip() {
  const p = useStore((s) => s.printer);
  const setView = useStore((s) => s.setView);
  const now = useNow(30000);
  if (!p) return null;
  const st = printerStatus(p);
  const pct = percent(p);
  const end = finishTime(p.progress?.printTimeLeft, now);
  return (
    <HudPanel color={st.color} onClick={() => setView('printer')} className="kiosk-printer">
      <div className="flex items-center gap-4 min-w-0">
        <div className="icon-bubble on !w-9 !h-9 shrink-0" style={toneStyle(st.color)}><Printer3d size={18} /></div>
        <div className="min-w-0 w-[13rem] shrink">
          <div className="text-sm font-semibold truncate">{p.name} · <span style={{ color: st.color }}>{st.label}</span></div>
          <div className="text-xs text-muted truncate" title={p.job?.file}>{[fileLabel(p.job?.file), bambuJobLine(p)].filter(Boolean).join(' · ')}</div>
        </div>
        <PrintProgressBar p={p} className="flex-1 min-w-[5rem]" />
        <span className="text-2xl font-bold tabular-nums hud-glow-text shrink-0">{pct ?? '–'}<span className="text-sm text-muted font-semibold">%</span></span>
        <div className="text-sm tabular-nums whitespace-nowrap shrink-0">
          <span className="text-muted">noch</span> {duration(p.progress?.printTimeLeft)}
          {end && <span className="text-muted"> · bis {end}</span>}
        </div>
      </div>
    </HudPanel>
  );
}

/** Accent colour of the pop-up per reason. */
const REASON_COLOR: Record<PrinterPopupReason, string> = {
  interval: '#22d3ee',
  preview: '#22d3ee',
  done: '#34d399',
  cancelled: '#fb923c',
  error: '#f43f5e',
};

/**
 * Webcam pop-up of the printer: regularly while printing and once when the print ends (see server
 * octoprint.js). Position and size come from the printer settings; it closes by itself (store timer).
 */
export function PrinterPopup() {
  const popup = useStore((s) => s.printerPopup);
  const cfg = useStore((s) => s.config?.octoprint);
  const dismiss = useStore((s) => s.dismissPrinterPopup);
  const id = popup?.id;
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, dismiss]);
  return (
    <AnimatePresence>
      {popup && (
        <PrinterPopupLayer
          key={popup.id}
          popup={popup}
          position={popup.look?.position ?? cfg?.popupPosition ?? 'corner'}
          size={popup.look?.size ?? cfg?.popupSize ?? 'medium'}
        />
      )}
    </AnimatePresence>
  );
}

function PrinterPopupLayer({ popup, position, size }: { popup: PrinterPopupEvent & { until: number }; position: PopupPosition; size: PopupSize }) {
  const p = useStore((s) => s.printer);
  const dismiss = useStore((s) => s.dismissPrinterPopup);
  const hide = useStore((s) => s.hidePrinterPopupsForJob);
  const setView = useStore((s) => s.setView);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const present = useIsPresent();
  const now = useNow(30000);
  // the remaining display time when the pop-up appeared drives the countdown bar
  const [seconds] = useState(() => Math.max(0, (popup.until - Date.now()) / 1000));
  const color = REASON_COLOR[popup.reason];
  const centered = position === 'center';
  const anim = reduced ? 0.12 : 0.24;
  const openPage = () => {
    setView('printer');
    dismiss();
  };
  const end = p?.active ? finishTime(p.progress?.printTimeLeft, now) : null;
  return (
    <motion.div
      className={centered ? 'fixed inset-0 z-40 grid place-items-center p-2 sm:p-6 bg-black/55 backdrop-blur-[2px] safe-t safe-b' : 'fixed inset-0 z-40 pointer-events-none'}
      inert={!present}
      style={{ pointerEvents: present ? undefined : 'none' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: anim }}
      onClick={centered ? dismiss : undefined}
    >
      <motion.div
        className={`glass overflow-hidden pointer-events-auto ${centered ? '' : 'absolute right-3 left-3 sm:left-auto sm:right-6 top-3 sm:top-auto sm:bottom-6 sm:w-[var(--popup-w)] safe-t'}`}
        style={{
          ...toneStyle(color),
          background: 'color-mix(in srgb, var(--bg2) 96%, transparent)',
          borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
          boxShadow: `0 20px 60px -10px rgba(0,0,0,.7), 0 0 40px -10px ${color}`,
          width: centered ? POPUP_WIDTH.center[size] : undefined,
          ['--popup-w' as string]: POPUP_WIDTH.corner[size],
        }}
        initial={{ opacity: 0, scale: reduced ? 1 : 0.75 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reduced ? 1 : 0.75 }}
        transition={{ duration: anim, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        role="status"
        aria-live="polite"
      >
        <div className={`flex items-center gap-2 ${centered ? 'p-4' : 'p-3'}`}>
          <div className={`icon-bubble on ${centered ? '!w-11 !h-11' : '!w-9 !h-9'}`}><Printer3d size={centered ? 22 : 18} /></div>
          <div className="min-w-0 flex-1">
            <div className={`font-semibold leading-tight truncate ${centered ? 'text-lg' : ''}`}>{POPUP_TITLE[popup.reason]}</div>
            <div className="text-xs text-muted truncate">{p?.name ?? '3D-Drucker'} · {new Date(popup.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <button className="btn btn-icon" onClick={dismiss} aria-label="Schließen"><X size={centered ? 18 : 16} /></button>
        </div>
        {p?.webcam.available !== false && (
          <button className="block w-full aspect-video" onClick={openPage} aria-label="3D-Drucker öffnen">
            <PrinterWebcam className="w-full h-full" />
          </button>
        )}
        {p && (
          <div className="px-3 pt-3">
            {p.job && <JobSummary p={p} />}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-2 text-sm">
              {p.active && (
                <span className="tabular-nums">
                  <span className="text-muted">noch</span> {duration(p.progress?.printTimeLeft)}
                  {end && <span className="text-muted"> · bis {end}</span>}
                </span>
              )}
              <PrinterTemps temps={p.temps} />
            </div>
          </div>
        )}
        <div className="p-3 flex gap-2">
          {/* the hide button gets the remaining width, so its longer text stays on one line */}
          <button className={`btn !py-1.5 !text-xs whitespace-nowrap ${popup.reason === 'interval' && popup.jobId ? '' : 'flex-1'}`} onClick={openPage}><Printer3d size={14} /> Drucker öffnen</button>
          {popup.reason === 'interval' && popup.jobId && (
            <button className="btn !py-1.5 !text-xs flex-1 whitespace-nowrap" onClick={() => hide(popup.jobId!)}><BellOff size={14} /> Bis Druckende ausblenden</button>
          )}
        </div>
        <motion.div className="h-1 origin-left" style={{ background: color }} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: seconds, ease: 'linear' }} />
      </motion.div>
    </motion.div>
  );
}
