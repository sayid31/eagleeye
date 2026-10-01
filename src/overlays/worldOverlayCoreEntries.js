// Moved out of worldOverlay.js (worldOverlayCoreEntries).

import { assertSourceId, entryKey, getOrCreateSource, rebuildSourceCohorts, registrySources } from './worldOverlaySourceRegistry.js';
import { normalizeOverlayEntry } from './worldOverlay.js';
import { PAINT_LANE_INDEX, PAINT_TARGET_DETECTION, PAINT_TARGET_SHARED, _diagnostics, _paintedBySource } from './worldOverlayCoreConstants.js';
import { inertPaintLaneHandle, invalidateHost } from './worldOverlayCoreHelpers.js';
import { S, _customPaintLaneList, _customPaintLanes, _hitRects, _paintRectByKey, _paintedSourceKeys, _records } from './worldOverlayCoreState.js';

/**
 * Register a source-owned painter behind one deterministic host lane. The
 * callback receives the host's already-sized/clipped Canvas2D target plus the
 * frame's shared matrix, keyhole, occluder, and UI rectangles. It must not
 * clear or resize the target. The detection target is a host-owned sibling
 * surface used only to preserve element-level scene blending.
 * @param {string} laneId One of `WORLD_OVERLAY_PAINT_LANES`.
 * @param {function(object):void} painter Source-owned paint callback.
 * @param {{id?:string,active?:boolean,target?:'shared'|'detection',shouldPaint?:function(object):boolean}} [options]
 * @returns {{surface:HTMLCanvasElement|null,setActive:function(boolean):void,requestPaint:function():void,unregister:function():void}}
 */
export function registerWorldOverlayPaintLane(laneId, painter, options = {}) {
  if (S._destroyed) return inertPaintLaneHandle();
  if (!PAINT_LANE_INDEX.has(laneId)) {
    throw new TypeError(`Unsupported WorldOverlay paint lane: ${laneId}`);
  }
  if (typeof painter !== 'function') {
    throw new TypeError('WorldOverlay custom paint lane requires a painter callback');
  }
  const id = assertSourceId(options.id || laneId);
  const previous = _customPaintLanes.get(id);
  if (previous) {
    const index = _customPaintLaneList.indexOf(previous);
    if (index >= 0) _customPaintLaneList.splice(index, 1);
  }
  const record = {
    id,
    lane: PAINT_LANE_INDEX.get(laneId),
    painter,
    active: options.active === true,
    target: options.target === PAINT_TARGET_DETECTION
      ? PAINT_TARGET_DETECTION
      : PAINT_TARGET_SHARED,
    shouldPaint: typeof options.shouldPaint === 'function' ? options.shouldPaint : null,
  };
  _customPaintLanes.set(id, record);
  _customPaintLaneList.push(record);
  invalidateHost({ solve: false });

  const unregister = () => {
    if (_customPaintLanes.get(id) !== record) return;
    _customPaintLanes.delete(id);
    const index = _customPaintLaneList.indexOf(record);
    if (index >= 0) _customPaintLaneList.splice(index, 1);
    record.active = false;
    invalidateHost({ solve: false });
  };
  return {
    get surface() {
      return record.target === PAINT_TARGET_DETECTION ? S._detectionSurface : S._canvas;
    },
    setActive(active) {
      if (S._destroyed || _customPaintLanes.get(id) !== record) return;
      const next = active === true;
      if (record.active === next) return;
      record.active = next;
      invalidateHost({ solve: false });
    },
    requestPaint() {
      if (S._destroyed || _customPaintLanes.get(id) !== record) return;
      invalidateHost({ solve: false });
    },
    unregister,
  };
}

/**
 * Replace all entries owned by a source atomically.
 * @param {string} sourceId
 * @param {object[]} entries
 * @param {WorldOverlaySourceOptions} [options]
 */
export function setOverlayEntries(sourceId, entries, options = {}) {
  if (S._destroyed) return;
  if (!Array.isArray(entries)) throw new TypeError('WorldOverlay entries must be an array');
  const source = getOrCreateSource(sourceId, options);
  const normalized = entries.map((entry) => normalizeOverlayEntry(source.id, entry));
  const next = new Map();
  for (const entry of normalized) next.set(entry.id, entry);
  for (const entry of source.entries.values()) {
    if (!next.has(entry.id)) _records.delete(entry._overlayKey);
  }
  source.entries = next;
  rebuildSourceCohorts(source);
  updateEntryDiagnostics();
  invalidateHost();
}

/**
 * Insert or replace one entry without rebuilding another source.
 * @param {string} sourceId
 * @param {object} entry
 */
export function upsertOverlayEntry(sourceId, entry) {
  if (S._destroyed) return;
  const source = getOrCreateSource(sourceId);
  const normalized = normalizeOverlayEntry(source.id, entry);
  source.entries.set(normalized.id, normalized);
  rebuildSourceCohorts(source);
  updateEntryDiagnostics();
  invalidateHost();
}

/**
 * Remove one entry by stable identity.
 * @param {string} sourceId
 * @param {string} entryId
 * @returns {boolean}
 */
export function removeOverlayEntry(sourceId, entryId) {
  if (S._destroyed) return false;
  const source = registrySources.get(assertSourceId(sourceId));
  if (!source) return false;
  const id = String(entryId);
  const removed = source.entries.delete(id);
  if (!removed) return false;
  _records.delete(entryKey(source.id, id));
  rebuildSourceCohorts(source);
  updateEntryDiagnostics();
  invalidateHost();
  return true;
}

/**
 * Remove all entries while retaining the source's registration/options.
 * @param {string} sourceId
 * @returns {boolean}
 */
export function clearOverlaySource(sourceId) {
  if (S._destroyed) return false;
  const source = registrySources.get(assertSourceId(sourceId));
  if (!source) return false;
  for (const entry of source.entries.values()) _records.delete(entry._overlayKey);
  source.entries.clear();
  source.cohortDomainIds.length = 0;
  source.cohortLists.length = 0;
  source.cohortCount = 0;
  source.demandByDomain.clear();
  updateEntryDiagnostics();
  invalidateHost();
  return true;
}

/**
 * Enable/disable one registered source.
 * @param {string} sourceId
 * @param {boolean} visible
 */
export function setOverlaySourceVisible(sourceId, visible) {
  if (S._destroyed) return;
  const source = getOrCreateSource(sourceId);
  const next = visible !== false;
  if (source.options.visible === next) return;
  source.options.visible = next;
  invalidateHost();
}

export function updateEntryDiagnostics() {
  const entriesBySource = {};
  let entryCount = 0;
  for (const [sourceId, source] of registrySources) {
    entriesBySource[sourceId] = source.entries.size;
    entryCount += source.entries.size;
  }
  _diagnostics.sourceCount = registrySources.size;
  _diagnostics.entryCount = entryCount;
  _diagnostics.entriesBySource = entriesBySource;
}

/**
 * Return the most recently published painted box (valid until next frame).
 * @param {string} sourceId
 * @param {string} entryId
 * @returns {(OverlayRect & {sourceId:string,entryId:string})|null}
 */
export function getOverlayPaintRect(sourceId, entryId) {
  if (S._destroyed) return null;
  const key = entryKey(String(sourceId), String(entryId));
  const rect = _paintRectByKey.get(key);
  // Pooled rectangles outlive their key, so identity and the publishing frame
  // are both re-checked instead of clearing the index every frame.
  return rect && rect.key === key && rect.stamp === S._frameStamp ? rect : null;
}

/**
 * Resolve the topmost interactive world-overlay entry at CSS-pixel coords.
 * @param {number} x
 * @param {number} y
 * @param {{sourceId?:string,collisionGroup?:string,filter?:Function}} [options]
 * @returns {{sourceId:string,entryId:string,entry:WorldOverlayEntry,rect:OverlayRect}|null}
 */
export function hitTestWorldOverlay(x, y, options = {}) {
  if (S._destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (let i = S._hitRectCount - 1; i >= 0; i--) {
    const hit = _hitRects[i];
    if (options.sourceId && hit.sourceId !== options.sourceId) continue;
    if (options.collisionGroup && hit.entry.collisionGroup !== options.collisionGroup) continue;
    if (typeof options.filter === 'function' && !options.filter(hit.entry)) continue;
    if (x < hit.x || x > hit.x + hit.w || y < hit.y || y > hit.y + hit.h) continue;
    return { sourceId: hit.sourceId, entryId: hit.entryId, entry: hit.entry, rect: hit };
  }
  return null;
}

/** @returns {object} Copy of the stable diagnostic facade shape. */
export function getWorldOverlayDiagnostics() {
  const paintedBySource = {};
  for (let i = 0; i < _paintedSourceKeys.length; i++) {
    const sourceId = _paintedSourceKeys[i];
    const count = _paintedBySource[sourceId];
    if (count > 0) paintedBySource[sourceId] = count;
  }
  return {
    ..._diagnostics,
    entriesBySource: { ..._diagnostics.entriesBySource },
    paintedBySource,
  };
}

/**
 * True when a candidate survives the explicit horizon/viewport policies.
 * The horizon test prefers `entry.cullPosition` when the source supplied one
 * (see normalizeOverlayEntry) so a sub-ellipsoid render anchor is not
 * false-hidden near the limb; everything else still uses the render position.
 */
export function isOverlayPointVisible(entry, position, screen, viewport, occluder) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return false;
  }
  if (entry?.horizonCull !== false && occluder?.isPointVisible
    && !occluder.isPointVisible(entry?.cullPosition || position)) {
    return false;
  }
  const x = screen?.x;
  const y = screen?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const padding = Math.max(0, Number(entry?.viewportPadding) || 0);
  return x >= -padding && x <= viewport.width + padding
    && y >= -padding && y <= viewport.height + padding;
}

/**
 * Return true when a rectangle intersects any cached UI exclusion box.
 * `count` lets pooled buffers expose a live prefix without truncating.
 */
export function overlayRectIntersectsAny(rect, exclusions, count = exclusions.length) {
  for (let i = 0; i < count; i++) {
    const other = exclusions[i];
    if (rect.x < other.x + other.w && rect.x + rect.w > other.x
      && rect.y < other.y + other.h && rect.y + rect.h > other.y) return true;
  }
  return false;
}

/**
 * Like `overlayRectIntersectsAny`, but only against exclusions that composite
 * BELOW the host — the ones a placement may never overlap at any cost.
 */
export function overlayRectIntersectsAnyHard(rect, exclusions, count = exclusions.length) {
  for (let i = 0; i < count; i++) {
    const other = exclusions[i];
    if (!other.hard) continue;
    if (rect.x < other.x + other.w && rect.x + rect.w > other.x
      && rect.y < other.y + other.h && rect.y + rect.h > other.y) return true;
  }
  return false;
}

export function leastOverlappingPlacement(placements, exclusions, count) {
  let best = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const rect = placement?.rect;
    if (!rect) continue;
    let overlapArea = 0;
    for (let j = 0; j < count; j++) {
      const other = exclusions[j];
      const overlapW = Math.min(rect.x + rect.w, other.x + other.w) - Math.max(rect.x, other.x);
      const overlapH = Math.min(rect.y + rect.h, other.y + other.h) - Math.max(rect.y, other.y);
      if (overlapW > 0 && overlapH > 0) overlapArea += overlapW * overlapH;
    }
    if (overlapArea < bestArea) {
      best = placement;
      bestArea = overlapArea;
    }
  }
  return best;
}
