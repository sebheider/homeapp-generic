/** Devices, rooms and scenes of the configuration. */

export type DeviceType = 'light' | 'switch' | 'thermostat' | 'blind' | 'sensor' | 'climate' | 'heatpump' | 'mower';

/** A configured device. Which `states` / `options` keys are used depends on the type (see lib/deviceTypes.ts). */
export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  room: string;
  icon?: string;
  /** Datapoint key (e.g. "power") -> ioBroker state id. */
  states: Record<string, string>;
  /** Type specific settings (ranges, units, mode lists); free-form because every type has its own keys. */
  options: Record<string, any>;
}

/** Entry of a value/label list (select choices, operating modes, fan levels). */
export interface ChoiceOption {
  value: string;
  label: string;
}

/** Operating mode of a climate device or heat pump. */
export interface ModeOption extends ChoiceOption {
  icon?: string;
  /** Climate devices: key of the setpoint datapoint used in this mode (e.g. "targetHeat"). */
  target?: string;
}

/** A room; `icon` is a name from the icon registry (lib/icons.tsx). */
export interface Room {
  id: string;
  name: string;
  icon: string;
  /** Storey for the digital twin of the "Nexus" overview: -1 basement, 0 ground floor, 1 … 3 upper floors (missing = ground floor). */
  floor?: number;
}

/** One step of a scene: write `value` to the datapoint `state`. */
export interface SceneAction {
  state: string;
  value: string | number | boolean;
}

/** A scene writes several datapoints at once. */
export interface Scene {
  id: string;
  name: string;
  icon: string;
  actions: SceneAction[];
}
