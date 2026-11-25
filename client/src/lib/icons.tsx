/**
 * Icon registry. Rooms, devices and scenes store a short icon name (e.g. "sofa");
 * this file maps those names to lucide icons. Add an entry here to make a new
 * icon available in the settings icon picker.
 */
import {
  Activity, AirVent, Baby, Bath, BatteryCharging, BedDouble, Blinds, Camera, Car, Clapperboard, Coffee, CookingPot, Cpu, DoorClosed,
  DoorOpen, Droplets, Fan, Flame, Gauge, House, Laptop, Lamp, LampCeiling, LampDesk, Lightbulb, Moon, Plug, Power, Radiation, Settings,
  Shirt, ShowerHead, Snowflake, Sofa, Sparkles, Sun, Sunrise, Thermometer, Trees, Tv, Waves, WashingMachine, Wind, Zap, Warehouse,
  ShieldAlert, Flower2, Utensils, Siren, Wifi, Heater, Fence, Sprout, CloudRain, Lock, createLucideIcon, type LucideIcon,
} from 'lucide-react';

/** Robotic lawn mower seen from the side (lucide has no mower): sloped shell with camera mast, big rear and small front wheel. */
export const LawnMower = createLucideIcon('lawn-mower', [
  ['path', { d: 'M2 16v-1a5.5 5.5 0 0 1 5.5-5.5h4a9 9 0 0 1 7.4 3.9L21 16z', key: 'body' }],
  ['path', { d: 'M11 9.5V7', key: 'mast' }],
  ['circle', { cx: '11', cy: '5.5', r: '1.5', key: 'camera' }],
  ['circle', { cx: '6.5', cy: '17', r: '2.5', key: 'wheel-rear' }],
  ['circle', { cx: '17', cy: '18', r: '1.5', key: 'wheel-front' }],
]);

/** Icon name -> lucide component. */
export const ICONS: Record<string, LucideIcon> = {
  activity: Activity, airvent: AirVent, baby: Baby, bath: Bath, battery: BatteryCharging, bed: BedDouble, blinds: Blinds, camera: Camera,
  car: Car, clapperboard: Clapperboard, coffee: Coffee, cooking: CookingPot, cpu: Cpu, doorclosed: DoorClosed, dooropen: DoorOpen,
  droplets: Droplets, fan: Fan, flame: Flame, gauge: Gauge, home: House, desk: Laptop, lamp: Lamp, ceiling: LampCeiling, deskLamp: LampDesk,
  light: Lightbulb, moon: Moon, plug: Plug, power: Power, radiation: Radiation, settings: Settings, shirt: Shirt, shower: ShowerHead,
  snowflake: Snowflake, sofa: Sofa, sparkles: Sparkles, sun: Sun, sunrise: Sunrise, thermometer: Thermometer, trees: Trees, tv: Tv,
  waves: Waves, washing: WashingMachine, wind: Wind, zap: Zap, garage: Warehouse, shield: ShieldAlert, flower: Flower2,
  utensils: Utensils, siren: Siren, wifi: Wifi, heater: Heater, fence: Fence, sprout: Sprout, rain: CloudRain, lock: Lock, mower: LawnMower,
};

/** Renders a registered icon by name; unknown or missing names fall back to the "sparkles" icon. */
export function Icon({ name, ...props }: { name?: string; className?: string; size?: number; strokeWidth?: number }) {
  const C = (name && ICONS[name]) || Sparkles;
  return <C {...props} />;
}

/** Selection offered when choosing an icon for rooms, devices and scenes. */
export const ICON_CHOICES = Object.keys(ICONS);
