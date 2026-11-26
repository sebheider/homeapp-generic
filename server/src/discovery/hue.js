/**
 * Philips Hue (adapter `hue`): lights and smart plugs, and the saved scenes of room groups.
 */
import { guessRoom, parentOf, sceneIcon, slug } from './names.js';

/** Adds the lights and plugs and collects the scenes of the room groups. */
export function discoverHue({ byId, rooms, add, matching, scenes }) {
  // lights and plugs: an "on" switch with a "reachable" sibling; without a level/bri datapoint it is a plug
  const hueOn = matching(/^hue\.\d+\..+\.on$/, (o) => o.role === 'switch.light' && byId.has(`${parentOf(o.id)}.reachable`));
  for (const o of hueOn) {
    const base = parentOf(o.id);
    // the object name is "<lamp name>.on"
    const name = (o.name.split('.').slice(-2, -1)[0] || base.split('.').pop()).trim();
    if (/entertainment/i.test(name)) continue;
    const dimmer = byId.get(`${base}.level`) || byId.get(`${base}.bri`);
    const room = guessRoom(name);
    const isPlug = !dimmer;
    const states = { power: o.id };
    if (dimmer) states.brightness = dimmer.id;
    add(
      {
        id: `hue_${slug(base.split('.').slice(2).join('_'))}`,
        type: isPlug ? 'switch' : 'light',
        name,
        states,
        options: dimmer ? { brightnessMax: dimmer.id.endsWith('.bri') ? 254 : 100 } : {},
        ...(isPlug && /kaffee/i.test(name) ? { icon: 'coffee' } : {}),
      },
      rooms.key(room, null),
    );
  }

  // Hue room groups expose their saved scenes as buttons (scene_*)
  for (const group of ['Wohnzimmer', 'Esszimmer']) {
    const buttons = matching(new RegExp(`^hue\\.\\d+\\.[^.]+\\.${group}\\.scene_`), (o) => o.role === 'button');
    for (const b of buttons) {
      const label = b.name.replace(/^Scene\s+/i, '');
      scenes.push({
        id: `hue_${slug(group)}_${slug(label)}`,
        name: `${group}: ${label}`,
        icon: sceneIcon(label),
        actions: [{ state: b.id, value: true }],
      });
    }
  }
}
