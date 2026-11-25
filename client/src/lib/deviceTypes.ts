/**
 * Description of the supported device types.
 *
 * `fields` lists the ioBroker datapoints a device of that type can use (the settings editor
 * renders one datapoint picker per field); `options` are additional device settings
 * (ranges, units, mode lists). The cards in DeviceCards.tsx implement the behaviour.
 */
import type { ChoiceOption, DeviceType } from './types';

/** An ioBroker datapoint a device type can use. */
export interface StateField {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
}

/** An additional device setting and the input used to edit it. */
export interface OptionField {
  key: string;
  label: string;
  kind: 'number' | 'bool' | 'text' | 'select' | 'list';
  choices?: ChoiceOption[];
  hint?: string;
  placeholder?: string;
}

/** Label, default icon, datapoints and options of a device type. */
export interface DeviceTypeInfo {
  label: string;
  icon: string;
  fields: StateField[];
  options: OptionField[];
}

/** Presentation of a sensor kind; `boolean` sensors show a state text instead of a number. */
export interface SensorKind {
  label: string;
  icon: string;
  unit: string;
  boolean?: boolean;
  /** Colour theme of the card (`tone-*` CSS class). */
  tone: string;
}

/** Sensor kinds selectable for devices of type "sensor" (option `kind`). */
export const SENSOR_KINDS: Record<string, SensorKind> = {
  temperature: { label: 'Temperatur', icon: 'thermometer', unit: '°C', tone: 'heat' },
  humidity: { label: 'Luftfeuchte', icon: 'droplets', unit: '%', tone: 'cool' },
  co2: { label: 'CO₂', icon: 'wind', unit: 'ppm', tone: 'green' },
  power: { label: 'Leistung', icon: 'zap', unit: 'W', tone: 'energy' },
  energy: { label: 'Energie', icon: 'battery', unit: 'kWh', tone: 'energy' },
  lux: { label: 'Helligkeit', icon: 'sun', unit: 'lx', tone: 'light' },
  pressure: { label: 'Luftdruck', icon: 'gauge', unit: 'hPa', tone: 'cool' },
  wind: { label: 'Wind', icon: 'wind', unit: 'km/h', tone: 'cool' },
  rain: { label: 'Regen', icon: 'rain', unit: 'mm', tone: 'cool' },
  battery: { label: 'Batterie', icon: 'battery', unit: '%', tone: 'green' },
  generic: { label: 'Messwert', icon: 'activity', unit: '', tone: 'cool' },
  motion: { label: 'Bewegung', icon: 'activity', unit: '', boolean: true, tone: 'alert' },
  presence: { label: 'Anwesenheit', icon: 'home', unit: '', boolean: true, tone: 'green' },
  door: { label: 'Tür', icon: 'doorclosed', unit: '', boolean: true, tone: 'alert' },
  window: { label: 'Fenster', icon: 'blinds', unit: '', boolean: true, tone: 'alert' },
  smoke: { label: 'Rauchmelder', icon: 'siren', unit: '', boolean: true, tone: 'alert' },
  water: { label: 'Wassermelder', icon: 'droplets', unit: '', boolean: true, tone: 'alert' },
};

/** All supported device types. */
export const DEVICE_TYPES: Record<DeviceType, DeviceTypeInfo> = {
  light: {
    label: 'Licht',
    icon: 'light',
    fields: [
      { key: 'power', label: 'Ein/Aus (bei reinen Dimmern leer lassen)' },
      { key: 'brightness', label: 'Helligkeit (Dimmer)' },
      { key: 'color', label: 'Farbe (Hex, z. B. #ff8800)' },
    ],
    options: [{ key: 'brightnessMax', label: 'Max. Helligkeitswert', kind: 'number', hint: 'z. B. 100 oder 254', placeholder: '100' }],
  },
  switch: {
    label: 'Steckdose / Schalter',
    icon: 'plug',
    fields: [
      { key: 'power', label: 'Ein/Aus', required: true },
      { key: 'consumption', label: 'Verbrauch (W)' },
    ],
    options: [],
  },
  thermostat: {
    label: 'Heizkörper-Thermostat',
    icon: 'flame',
    fields: [
      { key: 'target', label: 'Solltemperatur', required: true },
      { key: 'current', label: 'Isttemperatur' },
      { key: 'valve', label: 'Ventilstellung (%)' },
    ],
    options: [
      { key: 'min', label: 'Minimum', kind: 'number', placeholder: '5' },
      { key: 'max', label: 'Maximum', kind: 'number', placeholder: '30' },
      { key: 'step', label: 'Schrittweite', kind: 'number', placeholder: '0.5' },
    ],
  },
  blind: {
    label: 'Rollladen / Jalousie',
    icon: 'blinds',
    fields: [{ key: 'position', label: 'Position (0–100 %)', required: true }],
    options: [{ key: 'invert', label: 'Position invertieren (0 = offen)', kind: 'bool' }],
  },
  sensor: {
    label: 'Sensor',
    icon: 'activity',
    fields: [{ key: 'value', label: 'Wert', required: true }],
    options: [
      {
        key: 'kind',
        label: 'Art',
        kind: 'select',
        choices: Object.entries(SENSOR_KINDS).map(([value, k]) => ({ value, label: k.label })),
      },
      { key: 'unit', label: 'Einheit überschreiben', kind: 'text' },
    ],
  },
  climate: {
    label: 'Klimaanlage',
    icon: 'snowflake',
    fields: [
      { key: 'power', label: 'Ein/Aus', required: true },
      { key: 'mode', label: 'Betriebsart' },
      { key: 'target', label: 'Solltemperatur (gemeinsam)' },
      { key: 'targetHeat', label: 'Solltemperatur Heizen' },
      { key: 'targetCool', label: 'Solltemperatur Kühlen' },
      { key: 'targetAuto', label: 'Solltemperatur Auto' },
      { key: 'current', label: 'Isttemperatur' },
      { key: 'fan', label: 'Lüfterstufe' },
    ],
    options: [
      { key: 'min', label: 'Minimum', kind: 'number', placeholder: '16' },
      { key: 'max', label: 'Maximum', kind: 'number', placeholder: '30' },
      { key: 'step', label: 'Schrittweite', kind: 'number', placeholder: '1' },
      { key: 'modes', label: 'Betriebsarten', kind: 'list', hint: 'Wert:Name, z. B. cool:Kühlen, heat:Heizen' },
      { key: 'fanModes', label: 'Lüfterstufen', kind: 'list', hint: 'Wert:Name, z. B. auto:Auto, low:Leise' },
    ],
  },
  heatpump: {
    label: 'Wärmepumpe',
    icon: 'heater',
    fields: [
      { key: 'power', label: 'Ein/Aus' },
      { key: 'compressor', label: 'Verdichter läuft / Drehzahl', hint: 'Schalter (true / 1) oder Drehzahl – läuft, solange der Wert über 0 liegt' },
      { key: 'flowTemp', label: 'Vorlauftemperatur' },
      { key: 'returnTemp', label: 'Rücklauftemperatur' },
      { key: 'outsideTemp', label: 'Außentemperatur' },
      { key: 'dhwTemp', label: 'Warmwasser Ist' },
      { key: 'dhwTarget', label: 'Warmwasser Soll' },
      { key: 'mode', label: 'Betriebsart Heizkreis' },
      { key: 'electricPower', label: 'Elektrische Leistung (Verbrauch)' },
      { key: 'heatPower', label: 'Heizleistung' },
      { key: 'cop', label: 'COP / Leistungszahl' },
    ],
    options: [
      { key: 'dhwMin', label: 'Warmwasser min.', kind: 'number', placeholder: '35' },
      { key: 'dhwMax', label: 'Warmwasser max.', kind: 'number', placeholder: '65' },
      {
        key: 'powerUnit',
        label: 'Einheit der Leistungen',
        kind: 'select',
        choices: [{ value: 'W', label: 'Watt (W)' }, { value: 'kW', label: 'Kilowatt (kW)' }],
        hint: 'Wie die Datenpunkte für elektrische Leistung und Heizleistung liefern (steht in der Datenpunktsuche hinter dem Namen)',
      },
    ],
  },
  mower: {
    label: 'Mähroboter',
    icon: 'mower',
    fields: [
      { key: 'state', label: 'Zustand', required: true, hint: 'navimow: status.vehicleState' },
      { key: 'battery', label: 'Akku (%)', hint: 'navimow: status.battery' },
      { key: 'progress', label: 'Fortschritt (%)', hint: 'navimow: location.mowingPercentage' },
      { key: 'area', label: 'Gemähte Fläche (m²)', hint: 'navimow: location.subtotalArea' },
      { key: 'weekArea', label: 'Gemäht diese Woche (m²)', hint: 'navimow: location.mowingWeekArea' },
      { key: 'x', label: 'Position X (m)', hint: 'navimow: location.postureX' },
      { key: 'y', label: 'Position Y (m)', hint: 'navimow: location.postureY' },
      { key: 'heading', label: 'Fahrtrichtung (rad)', hint: 'navimow: location.postureTheta' },
      { key: 'positionTime', label: 'Zeit der letzten Position', hint: 'navimow: location.time' },
      { key: 'track', label: 'Fahrspur (JSON)', hint: 'navimow: mapTrack – nur mit eingeschalteter Karte (mapEnabled) im Adapter' },
      { key: 'frame', label: 'Kartenausschnitt (JSON)', hint: 'navimow: mapFrame' },
      { key: 'station', label: 'Ladestation (JSON)', hint: 'navimow: dockPosition' },
      { key: 'updated', label: 'Zeit der letzten Statusmeldung', hint: 'navimow: status.timestamp' },
      { key: 'online', label: 'Cloud verbunden', hint: 'navimow.0.info.connection' },
      { key: 'model', label: 'Modell', hint: 'navimow: general.model' },
      { key: 'firmware', label: 'Firmware', hint: 'navimow: general.firmware' },
      { key: 'start', label: 'Knopf Start', hint: 'navimow: remote.start' },
      { key: 'pause', label: 'Knopf Pause', hint: 'navimow: remote.pause' },
      { key: 'resume', label: 'Knopf Fortsetzen', hint: 'navimow: remote.resume' },
      { key: 'home', label: 'Knopf Zur Ladestation', hint: 'navimow: remote.dock' },
      { key: 'refresh', label: 'Knopf Status abrufen', hint: 'navimow: remote.Refresh' },
      { key: 'resetMap', label: 'Knopf Karte zurücksetzen', hint: 'navimow: remote.resetMap' },
    ],
    options: [
      { key: 'cutWidth', label: 'Schnittbreite (cm)', kind: 'number', hint: 'Breite der gemähten Bahn auf der Karte, z. B. 18 (i-Serie) oder 21 (H-Serie)', placeholder: '20' },
      {
        key: 'rotate',
        label: 'Karte drehen',
        kind: 'select',
        choices: [
          { value: '', label: 'Nicht drehen' },
          { value: '90', label: '90° im Uhrzeigersinn' },
          { value: '180', label: '180°' },
          { value: '270', label: '90° gegen den Uhrzeigersinn' },
        ],
        hint: 'Damit die Karte zum Blick auf den Garten passt',
      },
    ],
  },
};

/** Datapoints of the energy system (PV, battery, grid, wallbox) offered in the settings. */
export const ENERGY_FIELDS: StateField[] = [
  { key: 'production', label: 'PV-Erzeugung (W)' },
  { key: 'consumption', label: 'Hausverbrauch (W)' },
  { key: 'grid', label: 'Netz (W, + = Bezug)' },
  { key: 'battery', label: 'Batterie (W, + = Entladen)' },
  { key: 'batterySoc', label: 'Batterie-Ladestand (%)' },
  { key: 'wallbox', label: 'Wallbox (W)' },
  { key: 'autarky', label: 'Autarkie (%)' },
  { key: 'selfConsumption', label: 'Eigenverbrauch (%)' },
  { key: 'dailyYield', label: 'Tagesertrag (kWh)' },
  { key: 'totalYield', label: 'Gesamtertrag (kWh)' },
];
