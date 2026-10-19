// Which text tone stays readable over the active basemap. Only the light OSM
// street map needs dark chrome text; satellite, photoreal and dark-gray stacks
// keep the light text the shell uses by default.
const LIGHT_STACKS = new Set(['osm']);

/**
 * @param {string|null|undefined} stackId Active map stack id.
 * @returns {'light'|'dark'} 'light' = the map is bright, so chrome text goes dark.
 */
export function mapTone(stackId) {
  return LIGHT_STACKS.has(stackId) ? 'light' : 'dark';
}
