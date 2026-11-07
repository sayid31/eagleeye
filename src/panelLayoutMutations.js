// src/panelLayoutMutations.js
/**
 * Which DOM mutations inside a panel stack can change the adaptive layout.
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
 * @module panelLayoutMutations
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
