// src/panelLayoutTriggers.js
/**
 * Which DOM mutations and resizes can change the side stacks' adaptive layout.
 *
 * The left/right stack observers used to re-run the full layout pass
 * (querySelectorAll + getBoundingClientRect, i.e. a forced reflow) on ANY
 * subtree mutation, so every count update, typewriter character and
 * `textContent` write inside a panel cost a layout pass — ~5% of the main
 * thread with CCTV on (profile 2026-11-07). A text change that alters a
 * panel's size is already caught by the stacks' ResizeObserver, so only
 * attribute changes (collapse/hidden/variant) and element insertions or
 * removals are worth a pass. Pure — no DOM globals.
 *
 * The same pass also re-ran on every resize of an "obstacle" (top status
 * chips, HUD corners). The status chips ease their width over many frames
 * whenever their text ticks (split-flap), so a 1 s counter meant a layout pass
 * per animation frame (~12/s per stack, profile 2026-11-07). An obstacle now
 * counts only when its height changes or its width moves OBSTACLE_WIDTH_STEP_PX
 * from the size of the last pass it triggered.
 *
 * @module panelLayoutTriggers
 */

const ELEMENT_NODE = 1;

/** True when the record list adds or removes an element node. */
function changesElements(record) {
  for (const list of [record.addedNodes, record.removedNodes]) {
    for (const node of list || []) if (node?.nodeType === ELEMENT_NODE) return true;
  }
  return false;
}

/**
 * @param {Array<{type: string, addedNodes?: ArrayLike<{nodeType: number}>, removedNodes?: ArrayLike<{nodeType: number}>}>} records
 * @returns {boolean} Whether any record warrants an adaptive layout pass.
 */
export function isLayoutRelevantMutation(records) {
  for (const record of records || []) {
    if (record.type === 'attributes') return true;
    if (record.type === 'childList' && changesElements(record)) return true;
  }
  return false;
}

/** Width change (px) an obstacle must accumulate before it re-runs a layout pass. */
export const OBSTACLE_WIDTH_STEP_PX = 24;

/**
 * Remembers each obstacle's size at the last pass it triggered.
 * @returns {(target: object, width: number, height: number) => boolean} True
 *   when this size is a layout-relevant change (and records it as the new base).
 */
export function createObstacleSizeGate() {
  const lastTriggered = new WeakMap();
  return (target, width, height) => {
    const prev = lastTriggered.get(target);
    if (prev && Math.abs(prev.height - height) < 1 && Math.abs(prev.width - width) < OBSTACLE_WIDTH_STEP_PX) return false;
    lastTriggered.set(target, { width, height });
    return true;
  };
}

/**
 * Whether a ResizeObserver batch warrants a layout pass: any non-obstacle entry
 * (stack, panel, panel inner) does; obstacle entries go through the gate. Every
 * obstacle entry is fed to the gate so its base stays current.
 * @param {Array<{target: object, contentRect: {width: number, height: number}}>} entries
 * @param {Set<object>} obstacles
 * @param {ReturnType<typeof createObstacleSizeGate>} gate
 * @returns {boolean}
 */
export function isLayoutRelevantResize(entries, obstacles, gate) {
  let relevant = false;
  for (const entry of entries || []) {
    if (!obstacles.has(entry.target)) relevant = true;
    else if (gate(entry.target, entry.contentRect.width, entry.contentRect.height)) relevant = true;
  }
  return relevant;
}
