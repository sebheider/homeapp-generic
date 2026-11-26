/**
 * Segway Navimow robotic mowers (adapter `navimow`): state, battery, progress, position, map track, commands.
 */
import { slug } from './names.js';

/**
 * Datapoints of a mower of the navimow adapter, relative to `navimow.<instance>.<serial>` (first existing
 * candidate wins). The map datapoints (mapTrack, mapFrame, dockPosition) only exist with the adapter's map switched on.
 */
const NAVIMOW_STATES = {
  battery: ['status.battery'],
  progress: ['location.mowingPercentage'],
  area: ['location.subtotalArea'],
  weekArea: ['location.mowingWeekArea'],
  x: ['location.postureX'],
  y: ['location.postureY'],
  heading: ['location.postureTheta'],
  positionTime: ['location.time'],
  track: ['mapTrack'],
  frame: ['mapFrame'],
  station: ['dockPosition'],
  updated: ['status.timestamp'],
  model: ['general.model'],
  firmware: ['general.firmware'],
  start: ['remote.start'],
  pause: ['remote.pause'],
  resume: ['remote.resume'],
  home: ['remote.dock'],
  refresh: ['remote.Refresh', 'remote.refresh'],
  resetMap: ['remote.resetMap'],
};

/** Adds the mowers; their names are read from the devices. */
export async function discoverNavimow({ byId, rooms, add, matching, read }) {
  // every mower lives under navimow.<instance>.<serial>; its state is the anchor
  for (const o of matching(/^navimow\.\d+\.[^.]+\.status\.vehicleState$/)) {
    const base = o.id.slice(0, -'.status.vehicleState'.length);
    const instance = base.split('.').slice(0, 2).join('.');
    const states = { state: o.id };
    for (const [key, candidates] of Object.entries(NAVIMOW_STATES)) {
      const suffix = candidates.find((c) => byId.has(`${base}.${c}`));
      if (suffix) states[key] = `${base}.${suffix}`;
    }
    if (byId.has(`${instance}.info.connection`)) states.online = `${instance}.info.connection`;
    const name = String((await read(`${base}.general.name`)) || 'Mähroboter');
    add({ id: `navimow_${slug(base.split('.').slice(1).join('_'))}`, type: 'mower', name, states, options: {} }, rooms.key('Garten', null));
  }
}
