/**
 * Write-permission analysis for ioBroker.
 *
 * Besides the group rights of a user ("State permissions: write" in the admin), every single
 * object carries its own access control list:
 *
 *   acl: { owner: 'system.user.admin', ownerGroup: 'system.group.administrator', state: 0x664, object: 0x664 }
 *
 * The 12 bits are three octal-like digits for owner / group / others (read = 4, write = 2 per digit,
 * written as hex: 0x664 = owner rw, group rw, others r). A user is checked against exactly one of them:
 *   - the owner of the object            -> owner bits
 *   - a member of the object's ownerGroup -> group bits
 *   - everybody else                      -> others bits
 *
 * Objects created by the admin user (the default) are owned by `administrator` with 0x664, so a user in
 * a different group (e.g. "user") is "others" and may read but not write. This module finds out which
 * datapoints are affected and generates a script for the ioBroker "javascript" adapter (runs with
 * full rights) that adds the "others may write" bit (0x002) to exactly those datapoints.
 */

const OWNER_WRITE = 0x200;
const GROUP_WRITE = 0x020;
const OTHERS_WRITE = 0x002;

/** ioBroker user id for a login name. */
export const userIdOf = (name) => `system.user.${String(name || '').trim().toLowerCase().replace(/\s+/g, '_')}`;

/**
 * Decides whether a user may write a state.
 * @param {object|undefined} acl object ACL (may be missing = no restriction)
 * @param {string} userId e.g. system.user.homeapp
 * @param {string[]} userGroups ids of the groups the user is a member of
 * @param {boolean} groupsAllowWrite true if one of the user's groups has "state write"
 */
export function analyseWrite(acl, userId, userGroups, groupsAllowWrite) {
  if (!groupsAllowWrite) return { writable: false, reason: 'groups' };
  if (!acl || acl.state === undefined) return { writable: true, reason: 'no-acl' };
  const state = Number(acl.state);
  if (acl.owner === userId) return { writable: Boolean(state & OWNER_WRITE), reason: 'owner' };
  if (userGroups.includes(acl.ownerGroup)) return { writable: Boolean(state & GROUP_WRITE), reason: 'group' };
  return { writable: Boolean(state & OTHERS_WRITE), reason: 'others' };
}

/** Datapoints the app writes to: control fields of the devices and the actions of the scenes. */
const CONTROL_KEYS = {
  light: ['power', 'brightness', 'color'],
  switch: ['power'],
  thermostat: ['target'],
  blind: ['position'],
  climate: ['power', 'mode', 'target', 'targetHeat', 'targetCool', 'targetAuto', 'fan'],
  heatpump: ['power', 'mode', 'dhwTarget'],
  sensor: [],
  mower: ['start', 'pause', 'resume', 'home', 'refresh', 'resetMap', 'station'],
};

/** All state ids the app writes to (device control fields and scene actions), without duplicates. */
export function controlIds(cfg) {
  const ids = new Set();
  for (const d of cfg.devices || []) {
    for (const key of CONTROL_KEYS[d.type] || []) if (d.states?.[key]) ids.add(d.states[key]);
  }
  for (const s of cfg.scenes || []) for (const a of s.actions || []) if (a.state) ids.add(a.state);
  return [...ids];
}

/** Script for the ioBroker "javascript" adapter: grants "others: write" on the given states. */
export function buildFixScript(ids) {
  const list = ids.map((id) => `  ${JSON.stringify(id)},`).join('\n');
  return `// HomeApp – Schreibrechte für Datenpunkte freigeben
// Einmal im ioBroker-Adapter "javascript" als neues Skript anlegen und starten (läuft mit Administratorrechten).
// Es erlaubt "Anderen" (also auch dem Benutzer der App) das Schreiben auf genau diese ${ids.length} Datenpunkte,
// indem es in den Objektrechten das Bit "others write" setzt. Nichts wird gelöscht oder umbenannt.
// Nach dem Hinzufügen neuer Geräte in der App das Skript erneut erzeugen und ausführen.
const ids = [
${list}
];

const WRITE_OTHERS = 0x002;
let open = ids.length;
let changed = 0;
let missing = 0;
const done = () => {
  if (--open === 0) log('HomeApp: Schreibrechte angepasst für ' + changed + ' Datenpunkte (' + missing + ' nicht gefunden)');
};

for (const id of ids) {
  getObject(id, (err, obj) => {
    if (err || !obj) {
      missing++;
      log('HomeApp: Datenpunkt nicht gefunden: ' + id, 'warn');
      return done();
    }
    const state = obj.acl && obj.acl.state !== undefined ? obj.acl.state : 0x664;
    if (state & WRITE_OTHERS) return done();
    extendObject(id, { acl: { state: state | WRITE_OTHERS } }, (e) => {
      if (e) log('HomeApp: Fehler bei ' + id + ': ' + e, 'error');
      else changed++;
      done();
    });
  });
}
`;
}
