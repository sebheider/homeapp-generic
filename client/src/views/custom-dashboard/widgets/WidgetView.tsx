import { useContext } from 'react';
import { useStore } from '../../../lib/store';
import type { Overview } from '../../../lib/overview';
import { WIDGETS, widgetPart, type Widget } from '../../../lib/widgets';
import type { EnergyValues } from '../../../components/Energy';
import { HudPanel, HudScale, ScaleUp } from '../../../components/Hud';
import { WeatherPart } from '../../../components/Weather';
import { PrinterPanel } from '../../../components/Printer';
import { WastePanel } from '../../../components/Waste';
import { VentilationPanel } from '../../../components/Ventilation';
import { KioskSensorsPanel } from '../../../components/KioskSensors';
import { C } from '../../dashboard/colors';
import { EnergyPanel } from '../../dashboard/EnergyPanel';
import { HeroWeather } from '../../dashboard/HeroWeather';
import { HudCamera, SecurityPanel } from '../../dashboard/SecurityPanel';
import { RoomMatrix, RoomPod } from '../../dashboard/RoomMatrix';
import { ScenePanel } from '../../dashboard/ScenePanel';
import { str } from '../shared';
import { WidgetNote } from './WidgetNote';
import { ClockWidget } from './ClockWidget';
import { StatusWidget } from './StatusWidget';
import { GaugeWidget } from './GaugeWidget';
import { LightsWidget, DevicesWidget } from './DeviceWidgets';
import { TextWidget } from './TextWidget';
import { EnergyPartWidget } from './EnergyPartWidget';
import { ExtensionWidget } from './ExtensionWidget';
import { SpotifyWidget } from './SpotifyWidget';

/** Content of one widget. */
export function WidgetView({ w, o, energy }: { w: Widget; o: Overview; energy: EnergyValues }) {
  const cameras = useStore((s) => s.cameras);
  const scenes = useStore((s) => s.config?.scenes.length ?? 0);
  const printer = useStore((s) => Boolean(s.printer?.enabled));
  const modules = useStore((s) => s.config?.modules);
  const scale = useContext(HudScale);
  if ((w.type === 'weather' || w.type === 'weatherPart') && modules?.weather === false) return <WidgetNote type={w.type} text="Das Wettermodul ist deaktiviert." />;
  if (w.type === 'printer' && modules?.printer === false) return <WidgetNote type="printer" text="Das Druckermodul ist deaktiviert." />;
  if (w.type === 'spotify' && modules?.spotify === false) return <WidgetNote type="spotify" text="Das Spotify-Modul ist deaktiviert." />;
  switch (w.type) {
    case 'clock':
      return <ClockWidget o={o} energy={energy} chips={w.options.chips !== false} />;
    case 'status':
      return <StatusWidget />;
    case 'weather':
      return (
        <HudPanel title="Wetter" color={C.cyan}>
          <HeroWeather fallback={o.outside} compact />
        </HudPanel>
      );
    case 'weatherPart':
      return <WeatherPart part={str(w.options.part)} label={widgetPart(w)?.label ?? WIDGETS.weatherPart.label} />;
    case 'gauge':
      return <GaugeWidget o={o} energy={energy} w={w} />;
    case 'energy':
      return energy.enabled ? <EnergyPanel energy={energy} compact={!w.options.chart} /> : <WidgetNote type="energy" text="Kein Energiesystem eingerichtet." />;
    case 'energyPart':
      return <EnergyPartWidget energy={energy} w={w} />;
    case 'security':
      return <SecurityPanel contacts={o.contacts} />;
    case 'camera': {
      const cam = cameras.find((c) => c.id === str(w.options.camera)) ?? (w.options.camera ? undefined : cameras[0]);
      return cam ? <HudCamera cam={cam} /> : <WidgetNote type="camera" text="Kamera nicht gefunden." />;
    }
    case 'rooms':
      return o.rooms.length ? <RoomMatrix rooms={o.rooms} /> : <WidgetNote type="rooms" text="Noch keine Räume eingerichtet." />;
    case 'room': {
      const r = o.rooms.find((x) => x.room.id === str(w.options.room)) ?? (w.options.room ? undefined : o.rooms[0]);
      if (!r) return <WidgetNote type="room" text="Raum nicht gefunden." />;
      // the room card is not a HUD panel: the whole card grows
      return scale ? <ScaleUp stretch><RoomPod r={r} /></ScaleUp> : <RoomPod r={r} />;
    }
    case 'scenes':
      return scenes ? <ScenePanel /> : <WidgetNote type="scenes" text="Noch keine Szenen eingerichtet." />;
    case 'lights':
      return <LightsWidget o={o} small={Boolean(w.options.compact)} />;
    case 'devices':
      return <DevicesWidget o={o} w={w} />;
    case 'text':
      return <TextWidget w={w} />;
    case 'printer':
      return printer ? <PrinterPanel webcam={w.options.webcam !== false} /> : <WidgetNote type="printer" text="Kein 3D-Drucker eingerichtet (Einstellungen → 3D-Drucker)." />;
    case 'spotify':
      return <SpotifyWidget />;
    case 'waste':
      return <WastePanel count={typeof w.options.count === 'number' ? w.options.count : 4} />;
    case 'ventilation':
      return <VentilationPanel />;
    case 'kiosk':
      return <KioskSensorsPanel showEmpty />;
    case 'extension':
      return <ExtensionWidget w={w} />;
  }
}
