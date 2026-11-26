import type { ReactNode } from 'react';
import { AirVent, Camera, CircleAlert, DoorOpen, Flame, Lightbulb, Music, Printer3d, Sun, Trash2, TriangleAlert } from 'lucide-react';
import { useStore, type View } from '../../lib/store';
import { powerText, timeAgo } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import type { Overview } from '../../lib/overview';
import { IDLE_W, type EnergyValues } from '../../components/Energy';
import { KIND_STYLE, KindIcon } from '../../components/Cameras';
import { usePrintOnOverview } from '../../components/Printer';
import { useSpotifyOnDashboard } from '../../components/Spotify';
import { duration, percent, printerStatus } from '../../lib/printer';
import { daysUntil, nextPickup, pickupText } from '../../lib/waste';
import { roomsToVentilate, ventilateText } from '../../lib/ventilation';
import { toneStyle } from '../../components/Hud';
import { MOTION_LABEL, type MotionEvent } from '../../lib/types';
import { C } from './colors';
import { useHouseState } from './HouseCore';

/**
 * Small glowing chips with the most important facts; each one leads to its page (`max` limits their number).
 * `strips`: print and music have strips of their own (kiosk overview), so they get no chip.
 */
export function StatusChips({ o, energy, max, strips = false }: { o: Overview; energy: EnergyValues; max?: number; strips?: boolean }) {
  const setView = useStore((s) => s.setView);
  const cams = useStore((s) => s.cameras.length);
  const camsOnline = useStore((s) => Boolean(s.status?.surveillance.connected));
  const last = useStore((s) => s.motion[0]) as MotionEvent | undefined;
  const now = useNow(30000);
  // running 3D print: primitive selections, so the chips do not re-render on every temperature change
  const printing = usePrintOnOverview();
  const printPct = useStore((s) => percent(s.printer));
  const printLeft = useStore((s) => (s.printer?.progress?.printTimeLeft == null ? null : Math.round(s.printer.progress.printTimeLeft / 60) * 60));
  const printColor = useStore((s) => printerStatus(s.printer).color);
  const music = useSpotifyOnDashboard();
  const musicTitle = useStore((s) => (s.spotify?.track ? `${s.spotify.track.name} – ${s.spotify.track.artists}` : null));
  const musicPlaying = useStore((s) => Boolean(s.spotify?.playing));
  const showNotifications = useStore((s) => s.showNotifications);
  // waste pickup today / tomorrow / the day after, and rooms that should be aired (both only change with a server push)
  const waste = useStore((s) => s.waste);
  const ventilation = useStore((s) => s.ventilation);
  const nextWaste = waste?.enabled ? nextPickup(waste.upcoming, new Date(now)) : null;
  const wasteIn = nextWaste ? daysUntil(nextWaste.date, new Date(now)) : Infinity;
  const airRooms = ventilation?.enabled ? roomsToVentilate(ventilation.rooms) : [];
  const house = useHouseState();
  const chips: { key: string; color: string; icon: ReactNode; text: string; view: View; room?: string | null; onClick?: () => void; alert?: boolean }[] = [];
  // a pending alarm / warning comes first and pulses, so it is noticed next to the clock
  if (house.alert) {
    const text = `${house.label}: ${house.alert.name}${house.more ? ` +${house.more}` : ''}`;
    chips.push({ key: 'alert', color: house.color, icon: house.state === 'alarm' ? <CircleAlert size={14} /> : <TriangleAlert size={14} />, text, view: 'home', onClick: () => showNotifications(true), alert: true });
  }
  if (o.openContacts.length) {
    const names = o.openContacts.map((d) => d.name).slice(0, 2).join(', ');
    chips.push({ key: 'open', color: C.alert, icon: <DoorOpen size={13} />, text: `${names} offen`, view: 'rooms' });
  }
  if (nextWaste && wasteIn <= 2) {
    chips.push({ key: 'waste', color: wasteIn <= 1 ? C.amber : '#a3e635', icon: <Trash2 size={13} />, text: pickupText(nextWaste, new Date(now)), view: 'home', onClick: () => showNotifications(true) });
  }
  if (airRooms.length) {
    const room = airRooms.length === 1 ? airRooms[0].room : null;
    chips.push({ key: 'vent', color: airRooms[0].severity === 'warning' ? C.alert : C.cyan, icon: <AirVent size={13} />, text: ventilateText(airRooms), view: 'rooms', room });
  }
  if (printing && !strips) {
    chips.push({ key: 'printer', color: printColor, icon: <Printer3d size={13} />, text: `3D-Druck ${printPct ?? '–'} %${printLeft != null ? ` · noch ${duration(printLeft)}` : ''}`, view: 'printer' });
  }
  if (music && musicTitle && !strips) {
    const title = musicTitle.length > 42 ? `${musicTitle.slice(0, 41)}…` : musicTitle;
    chips.push({ key: 'music', color: '#1ed760', icon: <Music size={13} />, text: musicPlaying ? title : `Pausiert: ${title}`, view: 'spotify' });
  }
  if (o.lights.length) {
    const n = o.lightsOn.length;
    chips.push({ key: 'lights', color: C.amber, icon: <Lightbulb size={13} />, text: n ? `${n} ${n === 1 ? 'Licht' : 'Lichter'} an` : 'Alle Lichter aus', view: 'lights' });
  }
  if (o.heatingRooms) chips.push({ key: 'heat', color: C.heat, icon: <Flame size={13} />, text: `Heizt in ${o.heatingRooms} ${o.heatingRooms === 1 ? 'Raum' : 'Räumen'}`, view: 'climate' });
  if (energy.enabled && energy.pv > IDLE_W) chips.push({ key: 'pv', color: C.solar, icon: <Sun size={13} />, text: `${powerText(energy.pv)} Solar`, view: 'energy' });
  if (cams) chips.push({ key: 'cams', color: C.violet, icon: <Camera size={13} />, text: `${cams} ${cams === 1 ? 'Kamera' : 'Kameras'} ${camsOnline ? 'online' : 'offline'}`, view: 'cameras' });
  if (last && now - last.ts < 10 * 60e3) {
    chips.push({ key: 'motion', color: KIND_STYLE[last.kind].color, icon: <KindIcon kind={last.kind} size={13} />, text: `${MOTION_LABEL[last.kind]}: ${last.name} ${timeAgo(last.ts)}`, view: 'cameras' });
  }
  return (
    <div className={`flex flex-wrap gap-2 ${max ? 'mt-3' : 'mt-4'}`}>
      {chips.slice(0, max).map((c) => (
        <button key={c.key} className={`hud-chip hover:brightness-125 transition ${c.alert ? `hud-chip-alert anim-ring ${house.state === 'alarm' ? 'is-alarm' : ''}` : ''}`} style={toneStyle(c.color)} onClick={c.onClick ?? (() => setView(c.view, c.room))}>
          {c.icon}
          {c.alert ? <span className="truncate min-w-0">{c.text}</span> : c.text}
        </button>
      ))}
    </div>
  );
}
