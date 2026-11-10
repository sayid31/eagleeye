// src/panelScrollRetention.js
/**
 * Keeps a panel's scroll position across the side stacks' measure pass.
 *
 * To read a panel's natural height, the layout pass removes the panel's
 * allocated height, measures, and then sets it again. While the height is
 * removed the panel's inner scroller has nothing to scroll, so the browser
 * clamps its `scrollTop` to 0, and setting the height again does not bring it
 * back. The Radio panel inside Context re-runs that pass on every state
 * change, so each Play/Next/Volume click jumped Context back to the top. The
 * fix is to record the offsets before the measure pass and write them back
 * afterwards. Pure — no DOM globals.
 *
 * @module panelScrollRetention
 */

/**
 * Records the non-zero scroll offsets of each panel and its direct children.
 * The panel scrollers in this app (`.global-context-panel-inner`,
 * `.cctv-panel-inner`) are direct children of their panel.
 * @param {Iterable<{scrollTop: number, children?: Iterable<object>}>} panels
 * @returns {() => void} Puts every recorded offset back.
 */
export function retainPanelScroll(panels) {
  const saved = [];
  for (const panel of panels) {
    for (const element of [panel, ...(panel.children || [])]) {
      if (element.scrollTop > 0) saved.push([element, element.scrollTop]);
    }
  }
  return () => {
    for (const [element, scrollTop] of saved) {
      if (element.scrollTop !== scrollTop) element.scrollTop = scrollTop;
    }
  };
}
