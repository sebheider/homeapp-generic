/** Cameras page: camera wall and motion history. */
import { useEffect } from 'react';
import { Camera } from 'lucide-react';
import { useStore } from '../lib/store';
import { timeAgo } from '../lib/format';
import { MOTION_LABEL } from '../lib/types';
import { CameraTile, ColoredKindIcon, KIND_STYLE, motionKey } from '../components/Cameras';
import { Empty, OpenSettingsButton, PageHeader, Rise, Stagger } from '../components/ui';

/** Camera wall with motion indicators and the list of recent motion events. */
export function CamerasView() {
  const cameras = useStore((s) => s.cameras);
  const motion = useStore((s) => s.motion);
  const open = useStore((s) => s.openCamera);
  const status = useStore((s) => s.status);
  const refreshCameras = useStore((s) => s.refreshCameras);

  // always show the current list when the page is opened
  useEffect(() => {
    refreshCameras();
  }, []);

  return (
    <div>
      <PageHeader title="Kameras" subtitle={status?.surveillance.error ?? `${cameras.length} Kameras · Bewegungen werden automatisch eingeblendet`} />
      {cameras.length === 0 ? (
        <Empty icon={<Camera size={28} />} title="Keine Kameras gefunden" text="Verbinde die Synology Surveillance Station in den Einstellungen, damit deine Kameras hier erscheinen.">
          <OpenSettingsButton />
        </Empty>
      ) : (
        <>
          <Stagger className="grid-wide">
            {cameras.map((c) => <Rise key={c.id}><CameraTile cam={c} onOpen={() => open(c.id)} /></Rise>)}
          </Stagger>
          <h2 className="section-title mt-8 mb-3">Letzte Bewegungen</h2>
          {motion.length === 0 ? (
            <div className="glass p-6 text-sm text-muted text-center">Noch keine Bewegung erkannt.</div>
          ) : (
            <div className="glass divide-y divide-[var(--line)]">
              {motion.slice(0, 12).map((e) => (
                <button key={motionKey(e)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--card-hover)] transition-colors first:rounded-t-3xl last:rounded-b-3xl" onClick={() => open(e.cameraId)}>
                  <ColoredKindIcon kind={e.kind} size={16} />
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs font-semibold" style={{ color: KIND_STYLE[e.kind].color }}>{MOTION_LABEL[e.kind]}</span>
                  <span className="text-xs text-muted hidden sm:inline">{e.source}{e.reason !== null && e.reason !== '' ? ` · Art ${e.reason}` : ''}</span>
                  <span className="ml-auto text-xs text-muted whitespace-nowrap">{new Date(e.ts).toLocaleTimeString('de-DE')} · {timeAgo(e.ts)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
