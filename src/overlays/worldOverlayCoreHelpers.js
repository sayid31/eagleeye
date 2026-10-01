// Moved out of worldOverlay.js (worldOverlayCoreHelpers).

import { compareStableKeys } from './worldOverlaySourceRegistry.js';
import { S, _paintRectByKey } from './worldOverlayCoreState.js';

export function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function compareProtectedCandidates(a, b) {
  return b.priority - a.priority || compareStableKeys(a.key, b.key);
}

export function comparePaintItems(a, b) {
  return a.lane - b.lane || a.zIndex - b.zIndex || compareStableKeys(a.key, b.key);
}

/**
 * Stable in-place insertion sort over the live prefix of a pooled array.
 * `Array#sort` allocates a work buffer per call; the frame path only ever
 * orders a short, nearly sorted prefix.
 */
export function sortPooledRange(items, count, compare) {
  for (let i = 1; i < count; i++) {
    const item = items[i];
    let j = i - 1;
    while (j >= 0 && compare(items[j], item) > 0) {
      items[j + 1] = items[j];
      j--;
    }
    items[j + 1] = item;
  }
}

/** Map#forEach callback that zeroes a demand tally without clearing the map. */
export function zeroDemandEntry(value, key, map) {
  map.set(key, 0);
}

/**
 * Amortized prune for a keyed index that is rebuilt every frame but only
 * grows when a source publishes new identities. Clearing unconditionally
 * reallocates the backing hash table per domain per frame, so the index is
 * dropped only once it dwarfs the live cohort — the same policy the arbiter
 * applies to its per-solve key stamps.
 * @param {Map<string, object>} index
 * @param {number} liveCount
 */
export function pruneKeyedIndex(index, liveCount) {
  if (index.size > liveCount * 4 + 64) index.clear();
}

export function sourceActive(source) {
  return source.options.visible && !(S._cockpitActive && source.options.hideInCockpit);
}

export function invalidateHost({ solve = true, layout = false } = {}) {
  if (solve) S._solveDirty = true;
  if (layout) S._occludersDirty = true;
  S._canvasNeedsClear = true;
  S._paintRectCount = 0;
  S._hitRectCount = 0;
  _paintRectByKey.clear();
  S._viewer?.scene?.requestRender?.();
}

export function inertPaintLaneHandle() {
  return { surface: null, setActive() {}, requestPaint() {}, unregister() {} };
}
