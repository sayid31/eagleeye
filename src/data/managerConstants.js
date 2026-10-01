// Module constants moved out of manager.js.

/**
 * Cross-layer concurrency ceiling for bulk restore/clear fan-outs (page-load
 * layer-state restore, Context-mode session restore/exit, Contacts'
 * dependency auto-enable). Chosen below the browser's ~6-connection
 * same-origin HTTP/1.1 ceiling: CCTV alone can occupy a large share of a
 * "slot" for many seconds (its own internal viewshed fan-out, ~19.6s/~193MB
 * cold per docs/PERFORMANCE.md), so headroom is needed to avoid several
 * layers' concurrent fetch()+scene-mutation work compounding and crashing
 * the tab — the reported failure this constant fixes. 4 lets the common
 * case (1-4 saved layers) restore in one wave with no serialization
 * penalty while bounding the worst case.
 */
export const RESTORE_CONCURRENCY = 4;

export const SUPERSEDED_VISIBILITY_INTENT = Symbol('superseded-visibility-intent');

export const VALID_LAYER_SERIALIZATION_DISPOSITIONS = new Set([
  'enabled-only',
  'enabled+options',
  'enabled+mirrored-options',
]);
