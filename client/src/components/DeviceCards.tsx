/**
 * Device cards.
 *
 * Every device type of the configuration (light, switch, thermostat, blind, sensor,
 * climate, heat pump, robotic mower) has its own card. A card receives the device definition,
 * subscribes to exactly the datapoints it needs and writes through `store.set()`.
 * `DeviceCard` picks the right card for a device; `DeviceTiles` / `DeviceSection`
 * render lists of cards for the pages. The cards themselves live in components/device-cards/.
 */
import { memo, type ReactNode } from 'react';
import type { Device } from '../lib/types';
import { Rise, Stagger } from './ui';
import { LightCard } from './device-cards/LightCard';
import { SwitchCard } from './device-cards/SwitchCard';
import { ThermostatCard } from './device-cards/ThermostatCard';
import { BlindCard } from './device-cards/BlindCard';
import { SensorCard } from './device-cards/SensorCard';
import { ClimateCard } from './device-cards/ClimateCard';
import { HeatPumpCard } from './device-cards/HeatPumpCard';
import { MowerCard } from './device-cards/MowerCard';
import { SmallSwitch } from './device-cards/SmallSwitch';

/** Renders the card matching the device type. */
const DeviceCard = memo(function DeviceCard({ device }: { device: Device }) {
  switch (device.type) {
    case 'light': return <LightCard d={device} />;
    case 'switch': return <SwitchCard d={device} />;
    case 'thermostat': return <ThermostatCard d={device} />;
    case 'blind': return <BlindCard d={device} />;
    case 'sensor': return <SensorCard d={device} />;
    case 'climate': return <ClimateCard d={device} />;
    case 'heatpump': return <HeatPumpCard d={device} />;
    case 'mower': return <MowerCard d={device} />;
    default: return null;
  }
});

/**
 * Device card in the chosen size: `small` shows lights and switches as small tiles that only
 * switch (all other devices keep their full card).
 */
export function DeviceCardSized({ device, small }: { device: Device; small: boolean }) {
  return small && (device.type === 'light' || device.type === 'switch') && (device.states.power || device.states.brightness) ? <SmallSwitch d={device} /> : <DeviceCard device={device} />;
}

/** Device cards wrapped in entrance animations; place inside a `Stagger` or grid container. */
export function DeviceTiles({ devices }: { devices: Device[] }) {
  return (
    <>
      {devices.map((d) => <Rise key={d.id}><DeviceCard device={d} /></Rise>)}
    </>
  );
}

/**
 * Page section with a small muted heading (icon + title, optionally the number of devices) and a grid of
 * device cards (`wide` for large system cards). Used by the rooms, lights and climate pages.
 */
export function DeviceSection({ icon, title, devices, wide = false, showCount = false }: { icon: ReactNode; title: string; devices: Device[]; wide?: boolean; showCount?: boolean }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3 text-muted">
        {icon}
        <h2 className="section-title">{title}</h2>
        {showCount && <span className="text-xs">· {devices.length} {devices.length === 1 ? 'Gerät' : 'Geräte'}</span>}
      </div>
      <Stagger className={wide ? 'grid-wide' : 'grid-cards'}>
        <DeviceTiles devices={devices} />
      </Stagger>
    </section>
  );
}
