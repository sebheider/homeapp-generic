export const MODULES = ['weather', 'printer', 'spotify', 'mower'];

export function sanitizeModules(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(MODULES.map((id) => [id, input[id] !== false]));
}
