/**
 * Daikin cloud (adapter `daikin-cloud`): air conditioners and Altherma heat pumps.
 */
import { deviceOf, slug } from './names.js';

/** Daikin operation modes: label and icon per mode key. */
const AC_MODE_ICONS = { fanOnly: ['Lüften', 'fan'], heating: ['Heizen', 'flame'], cooling: ['Kühlen', 'snowflake'], auto: ['Auto', 'sparkles'], dry: ['Entfeuchten', 'droplets'] };
const FAN_LABELS = { auto: 'Auto', quiet: 'Leise', fixed: 'Fest' };

/**
 * Mode buttons for a Daikin unit from the `states` list of its operationMode object.
 * @param {object|undefined} modeObj ioBroker object of the operationMode datapoint
 * @param {Record<string, string>} [targets] mode key -> setpoint key of the device (air conditioner only)
 */
function modeOptions(modeObj, targets = {}) {
  return Object.entries(modeObj?.states || {}).map(([value, key]) => {
    const [label, icon] = AC_MODE_ICONS[key] || [key, 'sparkles'];
    const target = Object.hasOwn(targets, key) ? targets[key] : undefined;
    return { value, label, icon, ...(target ? { target } : {}) };
  });
}

/** Adds the air conditioners and heat pumps of every unit; their names are read from the units. */
export async function discoverDaikin({ byId, rooms, add, matching, read }) {
  // every unit lives under daikin-cloud.<instance>.<uuid>
  const daikinUnits = new Set(matching(/^daikin-cloud\.\d+\.[0-9a-f-]{36}\./).map((o) => deviceOf(o.id)));
  for (const unit of daikinUnits) {
    const has = (suffix) => byId.has(`${unit}.${suffix}`);
    if (has('climateControl.onOffMode')) {
      // Room air conditioner: one setpoint per operating mode
      const name = String((await read(`${unit}.climateControl.name`)) || 'Klimaanlage');
      const modes = modeOptions(byId.get(`${unit}.climateControl.operationMode`), { heating: 'targetHeat', cooling: 'targetCool', auto: 'targetAuto' });
      const fanObj = byId.get(`${unit}.climateControl.fanControl.operationModes.cooling.fanSpeed.currentMode`);
      const fanModes = Object.entries(fanObj?.states || {}).map(([value, key]) => ({ value, label: FAN_LABELS[key] || key }));
      const states = {
        power: `${unit}.climateControl.onOffMode`,
        mode: `${unit}.climateControl.operationMode`,
        current: `${unit}.climateControl.sensoryData.roomTemperature`,
      };
      for (const [key, m] of [['targetHeat', 'heating'], ['targetCool', 'cooling'], ['targetAuto', 'auto']]) {
        if (has(`climateControl.temperatureControl.operationModes.${m}.setpoints.roomTemperature`)) {
          states[key] = `${unit}.climateControl.temperatureControl.operationModes.${m}.setpoints.roomTemperature`;
        }
      }
      if (fanObj) states.fan = fanObj.id;
      add(
        { id: `daikin_${slug(unit.split('.').pop())}`, type: 'climate', name: `Klima ${name}`, states, options: { min: 16, max: 30, step: 1, modes, fanModes } },
        rooms.key(name, null),
      );
    }
    if (has('climateControlMainZone.onOffMode') && has('domesticHotWaterTank.onOffMode')) {
      // Altherma heat pump: heating circuit + hot water tank
      const modes = modeOptions(byId.get(`${unit}.climateControlMainZone.operationMode`));
      const dhw = byId.get(`${unit}.domesticHotWaterTank.temperatureControl.operationModes.heating.setpoints.domesticHotWaterTemperature`);
      add(
        {
          id: `daikin_${slug(unit.split('.').pop())}`,
          type: 'heatpump',
          name: 'Wärmepumpe',
          states: {
            power: `${unit}.climateControlMainZone.onOffMode`,
            mode: `${unit}.climateControlMainZone.operationMode`,
            flowTemp: `${unit}.climateControlMainZone.sensoryData.leavingWaterTemperature`,
            outsideTemp: `${unit}.climateControlMainZone.sensoryData.outdoorTemperature`,
            dhwTemp: `${unit}.domesticHotWaterTank.sensoryData.tankTemperature`,
            ...(dhw ? { dhwTarget: dhw.id } : {}),
          },
          options: { dhwMin: dhw?.min ?? 30, dhwMax: dhw?.max ?? 65, modes },
        },
        rooms.key('Technik', null),
      );
    }
  }
}
