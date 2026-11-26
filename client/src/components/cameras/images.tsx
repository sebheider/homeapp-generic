/** Camera pictures: refreshing snapshots, the smooth MJPEG live stream and the live picture combining both. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CameraOff } from 'lucide-react';
import { snapshotPath, streamUrl, type SnapshotQuality } from '../../lib/api';
import { useStore } from '../../lib/store';

/**
 * Picture that refreshes itself every `seconds` from `url` (an address without cache buster).
 * The next frame is loaded in the background and swapped in once it is complete,
 * so the image never flickers. Refreshing pauses while the tab is hidden.
 * `fit`: crop to the box (cover) or show it completely (contain); `imgStyle` e.g. mirrors the picture.
 */
export function RefreshingImage({ url, seconds, className = '', fit = 'cover', imgStyle }: {
  url: string; seconds: number; className?: string; fit?: 'cover' | 'contain'; imgStyle?: CSSProperties;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: number;
    const load = () => {
      if (document.hidden) {
        timer = window.setTimeout(load, 1000);
        return;
      }
      const next = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        setSrc(next);
        setFailed(false);
        // at least every 0.5 s, so a broken setting cannot flood the server
        timer = window.setTimeout(load, Math.max(0.5, seconds) * 1000);
      };
      img.onerror = () => {
        if (!alive) return;
        setFailed(true);
        // retry more slowly after an error (at least every 5 s)
        timer = window.setTimeout(load, Math.max(5, seconds) * 1000);
      };
      img.src = next;
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url, seconds]);

  if (!src) {
    return (
      <div className={`grid place-items-center bg-black/30 text-muted ${className}`}>
        {failed ? <CameraOff size={32} /> : <div className="skeleton absolute inset-0" />}
      </div>
    );
  }
  return (
    <div className={`relative bg-black overflow-hidden ${className}`}>
      <img src={src} alt="" className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} style={imgStyle} draggable={false} />
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 text-white/80 text-xs gap-1">
          <CameraOff size={24} />
          Verbindung verloren
        </div>
      )}
    </div>
  );
}

/** Camera picture of the Surveillance Station that refreshes itself (see `RefreshingImage`). */
export function SnapshotImage({ id, seconds, quality = 'balanced', className = '' }: { id: string; seconds: number; quality?: SnapshotQuality; className?: string }) {
  return <RefreshingImage url={snapshotPath(id, quality)} seconds={seconds} className={className} />;
}

/** 1×1 transparent GIF: assigning it to an <img> cancels a running MJPEG download. */
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
/** After a failed stream, the fallback pictures are shown this long before the stream is tried again. */
const STREAM_RETRY_MS = 30000;

/** True while the browser tab is visible. */
function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/**
 * Smooth live video: shows the MJPEG stream at `url` (the server shares one camera connection between
 * all viewers). Shows `fallback` (refreshing pictures) if the stream cannot be opened and tries the
 * stream again every 30 s. The connection is closed while the tab is hidden and on unmount.
 */
export function StreamImage({ url, fallback, className = '', fit = 'cover', imgStyle }: {
  url: string; fallback: ReactNode; className?: string; fit?: 'cover' | 'contain'; imgStyle?: CSSProperties;
}) {
  const visible = usePageVisible();
  // browsers do not report an MJPEG stream that ended, so it is opened again whenever the push channel
  // reconnects (e.g. after a server restart); a dropped camera connection is restored by the server
  const online = useStore((s) => s.wsConnected);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  const wasOnline = useRef<boolean | null>(null);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [url]);
  useEffect(() => {
    if (online && wasOnline.current === false) setAttempt((a) => a + 1);
    if (online || wasOnline.current !== null) wasOnline.current = online;
  }, [online]);
  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(() => {
      setFailed(false);
      setAttempt((a) => a + 1);
    }, STREAM_RETRY_MS);
    return () => clearTimeout(t);
  }, [failed]);
  // native listeners and an explicit cancel, so an aborted stream never counts as a failure
  useEffect(() => {
    const img = ref.current;
    if (!img || failed || !visible) return;
    let alive = true;
    const onLoad = () => alive && setLoaded(true);
    const onError = () => alive && setFailed(true);
    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
    img.src = `${url}${url.includes('?') ? '&' : '?'}s=${attempt}`;
    return () => {
      alive = false;
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      img.src = BLANK_IMAGE;
    };
  }, [url, attempt, failed, visible]);

  if (failed) return <>{fallback}</>;
  return (
    <div className={`relative bg-black overflow-hidden ${className}`}>
      {!loaded && <div className="skeleton absolute inset-0" />}
      <img ref={ref} alt="" className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} style={imgStyle} draggable={false} />
    </div>
  );
}

/**
 * Live picture of a camera: the MJPEG stream of the Surveillance Station, with refreshing
 * snapshots (`seconds`, `quality`) while the stream is not available.
 */
export function LiveImage({ id, className = '', seconds = 1, quality = 'high' }: { id: string; className?: string; seconds?: number; quality?: SnapshotQuality }) {
  return <StreamImage url={streamUrl(id)} fallback={<SnapshotImage id={id} seconds={seconds} quality={quality} className={className} />} className={className} />;
}
