// Which side panels to collapse when a rail button opens one, so the panels
// that share the strip beside the rail never stack on top of each other.
// Pure: the controller does the clicking.

/** Panels that open beside the rail. */
export const SIDE_PANELS = Object.freeze(['data-panel', 'scene-panel', 'pp-toggles', 'global-context-panel']);
// DISPLAY and CONTEXT live in the right-hand rail's markup; the theme floats them
// to the left, so they must not overlap the left accordion.
const FLOATING = new Set(['pp-toggles', 'global-context-panel']);

/**
 * @param {string} openId panel the rail is about to open
 * @param {Iterable<string>} expandedIds currently expanded panel ids
 * @returns {string[]} panel ids to collapse first
 */
export function panelsToCollapse(openId, expandedIds) {
  if (!SIDE_PANELS.includes(openId)) return [];
  const openIsFloating = FLOATING.has(openId);
  const expanded = new Set(expandedIds);
  return SIDE_PANELS.filter((id) => id !== openId
    && expanded.has(id)
    && (openIsFloating || FLOATING.has(id)));
}
