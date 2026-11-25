/**
 * Rain radar: a small tile map (Esri gray base map + RainViewer radar frames) that is centred on the
 * configured location and animates through the last ~100 minutes.
 * No map library: tiles are positioned directly, which keeps the bundle small. RainViewer only
 * serves radar tiles up to zoom level 7, so that is the maximum.
 * The browser loads the tiles directly from the providers; the server only supplies the frame index.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Pause, Play, Plus } from 'lucide-react';
import { api, type RadarIndex } from '../lib/api';
import { fmtTime } from '../lib/weather';
import { useStore } from '../lib/store';
import { useElementSize } from '../lib/hooks';

const TILE = 256;
const MIN_ZOOM = 4;
const MAX_ZOOM = 7;
const MAX_FRAMES = 10;

/** Web-Mercator pixel position of a coordinate at a zoom level. */
function project(lat: number, lon: number, z: number) {
  const n = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';

/** A visible map tile: wrapped tile coordinates (`x`, `y`) and its pixel position in the map box. */
interface Tile {
  key: string;
  x: number;
  y: number;
  px: number;
  py: number;
}

/** One absolutely positioned 256 px map tile. */
function TileImg({ tile, src, className = '' }: { tile: Tile; src: string; className?: string }) {
  return (
    <img
      alt=""
      draggable={false}
      src={src}
      className={`absolute max-w-none ${className}`}
      style={{ left: tile.px, top: tile.py, width: TILE, height: TILE }}
    />
  );
}

/** Animated rain radar centred on the given location; `tz` is used for the frame times. `fill`: the map takes the height of the parent (flex column). */
export function RadarMap({ lat, lon, tz, fill = false }: { lat: number; lon: number; tz: string; fill?: boolean }) {
  const theme = useStore((s) => s.theme);
  const wrap = useRef<HTMLDivElement>(null);
  const size = useElementSize(wrap, { w: 600, h: 320 });
  const [zoom, setZoom] = useState(6);
  const [radar, setRadar] = useState<RadarIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  // frame index from the server, refreshed every 5 minutes
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .radar()
        .then((r) => {
          if (!alive) return;
          setRadar(r);
          setError(null);
        })
        .catch((e: Error) => alive && setError(e.message));
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const frames = useMemo(() => (radar?.frames ?? []).slice(-MAX_FRAMES), [radar]);
  // start at the newest frame whenever the frame list changes
  const lastKey = frames.length ? frames[frames.length - 1].path : '';
  useEffect(() => setIdx(Math.max(0, frames.length - 1)), [lastKey]);

  // play: 650 ms per frame, a longer pause on the newest frame before starting over
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % frames.length), idx === frames.length - 1 ? 1800 : 650);
    return () => clearTimeout(t);
  }, [playing, idx, frames.length]);

  // all tiles that cover the map box with the location in its centre (x wraps around the date line)
  const tiles = useMemo(() => {
    const c = project(lat, lon, zoom);
    const left = c.x - size.w / 2;
    const top = c.y - size.h / 2;
    const max = 2 ** zoom;
    const out: Tile[] = [];
    for (let ty = Math.max(0, Math.floor(top / TILE)); ty <= Math.min(max - 1, Math.floor((top + size.h) / TILE)); ty++) {
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx++) {
        out.push({ key: `${tx}/${ty}`, x: ((tx % max) + max) % max, y: ty, px: Math.round(tx * TILE - left), py: Math.round(ty * TILE - top) });
      }
    }
    return out;
  }, [lat, lon, zoom, size.w, size.h]);

  const style = theme === 'light' ? 'Light' : 'Dark';
  const frame = frames[idx];
  const now = Date.now() / 1000;
  const ageMin = frame ? Math.round((now - frame.time) / 60) : 0;

  return (
    <div className={`relative ${fill ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
      <div ref={wrap} className={`relative ${fill ? 'flex-1 min-h-32' : 'h-64 sm:h-80 xl:h-96'} rounded-2xl overflow-hidden bg-black/20 border border-line select-none`}>
        {tiles.map((t) => (
          <TileImg key={`b${zoom}/${t.key}`} tile={t} src={`${ESRI}/World_${style}_Gray_Base/MapServer/tile/${zoom}/${t.y}/${t.x}`} />
        ))}
        {/* all radar frames stay mounted (preloaded); only the current one is visible */}
        {radar &&
          frames.map((f, fi) => (
            <div key={f.path} className="absolute inset-0 transition-opacity duration-300" style={{ opacity: fi === idx ? 0.85 : 0 }}>
              {tiles.map((t) => (
                <TileImg key={`${zoom}/${t.key}`} tile={t} src={`${radar.host}${f.path}/${TILE}/${zoom}/${t.x}/${t.y}/2/1_1.png`} />
              ))}
            </div>
          ))}

        {/* place names on top of the radar */}
        {tiles.map((t) => (
          <TileImg key={`l${zoom}/${t.key}`} tile={t} src={`${ESRI}/World_${style}_Gray_Reference/MapServer/tile/${zoom}/${t.y}/${t.x}`} className="pointer-events-none" />
        ))}
        {/* location marker */}
        <div className="absolute" style={{ left: '50%', top: '50%' }}>
          <span className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-violet-400/70 wx-ping" />
          <span className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-violet-400 border-2 border-white shadow" />
        </div>

        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          <button className="btn btn-icon backdrop-blur" aria-label="Hineinzoomen" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom(zoom + 1)}><Plus size={15} /></button>
          <button className="btn btn-icon backdrop-blur" aria-label="Herauszoomen" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom(zoom - 1)}><Minus size={15} /></button>
        </div>

        {error && <div className="absolute inset-x-0 bottom-0 bg-rose-500/80 text-white text-xs px-3 py-1.5">{error}</div>}
        {!error && !radar && <div className="absolute inset-0 grid place-items-center text-xs text-muted">Radar wird geladen …</div>}
        <div className="absolute bottom-1 left-2 text-[0.6rem] text-white/60 drop-shadow">Radar: RainViewer · Karte: Esri, HERE, Garmin, © OpenStreetMap-Mitwirkende</div>
      </div>

      {frames.length > 0 && (
        <div className="flex items-center gap-3 mt-3">
          <button className="btn btn-icon" aria-label={playing ? 'Pause' : 'Abspielen'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
          <input
            type="range"
            className="flex-1 accent-violet-400"
            min={0}
            max={frames.length - 1}
            value={idx}
            aria-label="Radarbild wählen"
            onChange={(e) => {
              setPlaying(false);
              setIdx(Number(e.target.value));
            }}
          />
          <div className="text-xs tabular-nums text-right w-28">
            <div className="font-semibold">{fmtTime(frame?.time, tz)} Uhr</div>
            <div className="text-muted">{ageMin <= 2 ? 'aktuell' : ageMin < 0 ? `in ${-ageMin} min` : `vor ${ageMin} min`}</div>
          </div>
        </div>
      )}
    </div>
  );
}
