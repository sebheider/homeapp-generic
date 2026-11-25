/**
 * Camera list as shown in the app.
 *
 * The cameras themselves come from the Surveillance Station (or the demo content); entries in the
 * configuration only override name, room, visibility, pop-up behaviour and the optional ioBroker
 * motion datapoints.
 */

/**
 * One camera as the browser sees it: base data + the user's overrides.
 * @param {string|number} id camera id
 * @param {string} name name reported by the source
 * @param {boolean} enabled
 * @param {object} [o] override from the configuration (`cameras[]` entry)
 */
function cameraInfo(id, name, enabled, o = {}) {
  return {
    id: String(id),
    name: o.name || name,
    room: o.room || null,
    enabled,
    hidden: Boolean(o.hidden),
    popup: o.popup !== false, // master switch
    popupMotion: o.popupMotion !== false, // pop-up for normal motion
    popupPeople: o.popupPeople !== false, // pop-up for advanced detection (people)
    motionState: o.motionState || null,
    peopleState: o.peopleState || null,
  };
}

/**
 * Builds the visible camera list.
 * @param {object} p
 * @param {object[]} p.configured `cameras` of the effective configuration (overrides; in demo mode the demo cameras)
 * @param {boolean} p.isDemo demo mode: the configured cameras are the complete list
 * @param {{id: string, name: string, enabled?: boolean}[]} p.reported cameras reported by the Surveillance Station
 * @param {{cameraId: string, name: string}[]} p.recentMotion recent motion events
 */
export function buildCameraList({ configured, isDemo, reported, recentMotion }) {
  const overrides = new Map(configured.map((c) => [String(c.id), c]));
  const info = (id, name, enabled = true) => cameraInfo(id, name, enabled, overrides.get(String(id)));
  const base = isDemo ? configured.map((c) => ({ id: String(c.id), name: c.name, enabled: true })) : reported;
  const list = base.map((c) => info(c.id, c.name, c.enabled !== false));
  if (!isDemo) {
    const known = (id) => list.some((c) => c.id === String(id));
    // cameras that are configured but not (yet) reported by the Surveillance Station
    for (const o of configured) {
      if (!known(o.id)) list.push(info(o.id, o.name || `Kamera ${o.id}`));
    }
    // Fallback: a camera that reported motion is usable even if the camera list is empty
    for (const e of recentMotion) {
      if (!known(e.cameraId)) list.push(info(e.cameraId, e.name));
    }
  }
  return list.filter((c) => !c.hidden);
}
