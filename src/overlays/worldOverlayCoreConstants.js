// Moved out of worldOverlay.js (worldOverlayCoreConstants).

import { WORLD_OVERLAY_PAINT_LANES } from './worldOverlayTokens.js';

/**
 * @module worldOverlay
 * @description Shared screen-space renderer/scheduler for world-anchored
 * labels and cards. Sources own data, business rules, and bounded candidate
 * generation; this host owns projection, final placement, paint, and hits.
 */

export const ROOT_ID = 'world-overlay-root';

export const CANVAS_ID = 'world-overlay-canvas';

export const DETECTION_SURFACE_ID = 'world-overlay-detection-surface';

export const ACCESSIBILITY_ROOT_ID = 'world-overlay-actions';

export const ACCESSIBILITY_LIST_ID = 'world-overlay-action-list';

export const ACCESSIBILITY_STATUS_ID = 'world-overlay-status';

export const PAINT_TARGET_SHARED = 'shared';

export const PAINT_TARGET_DETECTION = 'detection';

const DEFAULT_COHORT_LIMIT = 256;

const MAX_SOURCE_COHORT_LIMIT = 900;

const DEFAULT_COLLISION_CAPACITY = 96;

// Phase 4 adds CCTV's shipped 40-card ambient tier to Phase 3's two 96-card
// infrastructure budgets, FIRMS' 18, and the vessel selector's configured
// 900-row absolute ceiling. Runtime vessel demand is the much smaller 118px
// viewport grid (112 at 1600x900, 170 at full HD). This aggregate
// work-conserving ceiling preserves every source's shipped cap; pinned and
// active/protected entries bypass it.
export const AMBIENT_CARD_COLLISION_CAPACITY = 1150;

// `WORLD_OVERLAY_PAINT_LANES` itself lives in `worldOverlayTokens.js` (see
// that file's docstring for why) and is imported above; `worldOverlay.js`
// re-exports it unchanged below for its existing external consumers.
export const PAINT_LANE_INDEX = new Map(WORLD_OVERLAY_PAINT_LANES.map((lane, index) => [lane, index]));

export const _viewport = { width: 0, height: 0 };

export const _paintedBySource = Object.create(null);

export const _diagnostics = {
  sourceCount: 0,
  entryCount: 0,
  candidateCount: 0,
  projectedCount: 0,
  selectedCount: 0,
  fadingCount: 0,
  paintedCount: 0,
  hitRectCount: 0,
  projectionMs: 0,
  solveMs: 0,
  paintMs: 0,
  solveRevision: 0,
  paintItemPoolSize: 0,
  paintRectPoolSize: 0,
  candidateIndexSize: 0,
  entriesBySource: {},
  paintedBySource: _paintedBySource,
};
