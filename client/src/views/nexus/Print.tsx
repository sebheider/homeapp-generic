import { useStore } from '../../lib/store';
import { useNow } from '../../lib/hooks';
import { PrinterWebcam, usePrintOnOverview } from '../../components/Printer';
import { duration, fileLabel, finishTime, percent } from '../../lib/printer';
import { NX } from '../../components/HomeTwin';
import { Panel } from './Panel';

/** Running 3D print: webcam with reticle (not in the kiosk), file, progress bar, remaining time and temperatures (`compact`: kiosk in portrait format, file and time in one line). */
export function Print({ fill, compact }: { fill: boolean; compact: boolean }) {
  const show = usePrintOnOverview();
  const p = useStore((s) => s.printer);
  const now = useNow(30000);
  if (!show || !p) return null;
  const pct = percent(p);
  const end = finishTime(p.progress?.printTimeLeft, now);
  const color = p.state === 'printing' || p.state === 'finishing' ? NX.cyan : NX.amber;
  return (
    <Panel title="3D-Druck" right={`${pct ?? '–'} %`} to="printer" color={color}>
      {p.webcam.available && !fill && (
        <div className="nx-cam nx-print-cam">
          <PrinterWebcam className="absolute inset-0" />
          <i className="nx-ret" />
          <span className="nx-cam-ov">
            <span className="a"><span>{p.name}</span><span className="nx-live-tag">Live</span></span>
          </span>
        </div>
      )}
      {!compact && <div className="nx-pfile" title={p.job?.file}>{fileLabel(p.job?.file) || p.name}</div>}
      <div className="nx-pbar"><i style={{ width: `${p.progress?.completion ?? 0}%` }} /></div>
      <div className="nx-lrow">
        {/* kiosk in portrait format: one line less – the file name takes the place of the temperatures */}
        {compact && <span className="nx-pfile !mt-0 min-w-0" title={p.job?.file}>{fileLabel(p.job?.file) || p.name}</span>}
        <span className={compact ? 'ml-auto shrink-0' : ''}>NOCH {duration(p.progress?.printTimeLeft).toUpperCase()}{end ? ` · BIS ${end.toUpperCase()}` : ''}</span>
        {!compact && <span className="nx-ptemps">{p.temps.map((t) => `${t.label.toUpperCase()} ${t.actual == null ? '–' : Math.round(t.actual)}°`).join(' · ')}</span>}
      </div>
    </Panel>
  );
}
