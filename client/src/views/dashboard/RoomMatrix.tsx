/** Rooms at a glance: one compact card per room, as a grid or a sideways scrolling strip. */
import { DoorOpen, Droplets, Flame } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Icon } from '../../lib/icons';
import { clamp, num } from '../../lib/format';
import type { RoomSummary } from '../../lib/overview';
import { HudPanel, toneStyle } from '../../components/Hud';
import { C } from './colors';

/** Compact room card: temperature with scale, humidity / CO₂, heating, lamps as dots, open windows. */
export function RoomPod({ r, compact = false }: { r: RoomSummary; compact?: boolean }) {
  const setView = useStore((s) => s.setView);
  const lightsOn = r.lights.filter(Boolean).length;
  const tone = r.open.length ? C.alert : r.heating ? C.heat : lightsOn ? C.amber : C.violet;
  const active = Boolean(r.open.length || r.heating || lightsOn);
  // position on a 14 … 28 °C scale
  const pos = r.temp == null ? null : clamp((r.temp - 14) / 14, 0, 1);
  const lampTitle = `${lightsOn} von ${r.lights.length} Lichtern an`;
  const lampDots = r.lights.length > 0 && (
    <span className="flex gap-1 shrink-0" title={lampTitle}>
      {r.lights.map((on, i) => (
        <i key={i} className="w-2 h-2 rounded-full" style={on ? { background: C.amber, boxShadow: `0 0 8px ${C.amber}` } : { background: 'var(--track)' }} />
      ))}
    </span>
  );
  // compact header: a single glowing dot while any light is on, so the room name keeps its room
  const lampHint = lightsOn > 0 && (
    <i className="w-2 h-2 rounded-full shrink-0" title={lampTitle} aria-label={lampTitle} role="img" style={{ background: C.amber, boxShadow: `0 0 8px ${C.amber}` }} />
  );
  return (
    <button className={`hud-room glass !rounded-2xl ${compact ? 'px-2.5 py-2' : 'p-3'} w-full text-left relative overflow-hidden ${active ? 'is-active' : ''}`} style={toneStyle(tone)} onClick={() => setView('rooms', r.room.id)}>
      <div className="flex items-center gap-2">
        <div className={`icon-bubble on !rounded-xl ${compact ? '!w-7 !h-7' : '!w-8 !h-8'}`}><Icon name={r.room.icon} size={compact ? 14 : 16} /></div>
        <div className="font-semibold text-sm truncate flex-1">{r.room.name}</div>
        {r.open.length > 0 && <DoorOpen size={15} className="text-rose-400 anim-breathe" />}
        {r.heating && <Flame size={15} className="text-rose-400 anim-flicker" />}
        {compact && lampHint}
      </div>
      <div className={`${compact ? 'mt-1' : 'mt-2'} flex items-baseline gap-1`}>
        {r.temp != null ? (
          <>
            <span className={`${compact ? 'text-xl' : 'text-2xl'} font-bold tabular-nums`}>{num(r.temp, 1)}</span>
            <span className="text-xs text-muted">°C</span>
          </>
        ) : (
          // rooms without a thermometer show their lights or the number of devices instead
          <>
            <span className={`${compact ? 'text-xl' : 'text-2xl'} font-bold tabular-nums`}>{r.lights.length ? `${lightsOn}/${r.lights.length}` : r.deviceCount}</span>
            <span className="text-xs text-muted">{r.lights.length ? 'Lichter an' : r.deviceCount === 1 ? 'Gerät' : 'Geräte'}</span>
          </>
        )}
        {r.target != null && <span className="text-[0.7rem] text-muted ml-auto">Soll {num(r.target, 1)}°</span>}
      </div>
      {pos != null && (
        <div className="relative h-1.5 mt-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, #38bdf855, #fbbf2455, #fb718555)' }}>
          <i className="absolute top-1/2 w-2.5 h-2.5 -mt-[5px] -ml-[5px] rounded-full bg-white" style={{ left: `${pos * 100}%`, boxShadow: '0 0 8px var(--tone)', transition: 'left 1s' }} />
        </div>
      )}
      {/* compact (kiosk strip): the lamp dots move into the header, humidity / CO₂ are left out */}
      {!compact && (
        <div className="mt-2 flex items-center gap-2 text-[0.7rem] text-muted min-h-[1rem]">
          {r.humidity != null && <span className="inline-flex items-center gap-0.5"><Droplets size={11} /> {num(r.humidity, 0)} %</span>}
          {r.co2 != null && <span>CO₂ {num(r.co2, 0)}</span>}
          <span className="ml-auto">{lampDots}</span>
        </div>
      )}
    </button>
  );
}

/**
 * All rooms at a glance; `strip`: one row that scrolls sideways (kiosk); `columns`: the strip shows that
 * many rooms at once (kiosk in portrait format: wide enough for the names), the rest scrolls.
 */
export function RoomMatrix({ rooms, strip = false, columns }: { rooms: RoomSummary[]; strip?: boolean; columns?: number }) {
  const cols = columns ? Math.min(columns, rooms.length) : 0;
  return (
    <HudPanel title="Räume im Blick" color={C.violet} right={`${rooms.length} Räume`} className="min-w-0">
      {strip && cols ? (
        <div className="grid grid-flow-col gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory" style={{ gridAutoColumns: `calc((100% - ${cols - 1} * 0.75rem) / ${cols})` }}>
          {rooms.map((r) => <div key={r.room.id} className="snap-start min-w-0"><RoomPod r={r} compact /></div>)}
        </div>
      ) : strip ? (
        <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
          {rooms.map((r) => (
            <div key={r.room.id} className="w-[9.5rem] shrink-0 snap-start">
              <RoomPod r={r} compact />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 9rem), 1fr))' }}>
          {rooms.map((r) => <RoomPod key={r.room.id} r={r} />)}
        </div>
      )}
    </HudPanel>
  );
}
