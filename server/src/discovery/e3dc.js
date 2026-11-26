/**
 * E3/DC home power station (adapter `e3dc-rscp`): PV, battery, grid, house, wallbox, autarky.
 */

/** Datapoints of the energy flow, or null without a power station. */
export function discoverE3dc({ byId }) {
  let energy = null;
  const e3 = (name) => (byId.has(`e3dc-rscp.0.EMS.${name}`) ? `e3dc-rscp.0.EMS.${name}` : undefined);
  if (e3('POWER_PV')) {
    energy = {
      enabled: true,
      // E3/DC reports "Power to battery" (positive = charging) while the app uses positive = discharging
      batteryInvert: true,
      // E3/DC reports "Power from grid" (positive = import), same as the app
      gridInvert: false,
      states: Object.fromEntries(
        Object.entries({
          production: e3('POWER_PV'),
          consumption: e3('POWER_HOME'),
          grid: e3('POWER_GRID'),
          battery: e3('POWER_BAT'),
          batterySoc: e3('BAT_SOC'),
          wallbox: e3('POWER_WB_ALL'),
          autarky: e3('AUTARKY'),
          selfConsumption: e3('SELF_CONSUMPTION'),
        }).filter(([, v]) => v),
      ),
    };
  }
  return energy;
}
