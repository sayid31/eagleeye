// Which side panels to collapse when a rail button opens one: the rail keeps
// one panel open at a time so panels never pile up over the map.
// Pure: the controller does the clicking.

/** Panels the rail opens. */
export const SIDE_PANELS = Object.freeze([
  'data-panel', 'cctv-panel', 'scene-panel', 'pp-toggles', 'global-context-panel',
]);

/**
 * @param {string} openId panel the rail is about to open
 * @param {Iterable<string>} expandedIds currently expanded panel ids
 * @returns {string[]} panel ids to collapse first
 */
export function panelsToCollapse(openId, expandedIds) {
  if (!SIDE_PANELS.includes(openId)) return [];
  const expanded = new Set(expandedIds);
  return SIDE_PANELS.filter((id) => id !== openId && expanded.has(id));
}
