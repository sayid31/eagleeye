// Moved out of satellites.js (satellitesStyle).

import { tallySatelliteClasses } from './satelliteClass.js';
import { advanceSpriteFocus, focusAlphaNeedsWrite, focusPassIsNeeded, getFocusTarget, nearFarScalarValueAtDistance } from './focusDeemphasis.js';
import * as Cesium from 'cesium';
import { ISS_NORAD, POINT_STYLES } from './satellitesConstants.js';
import { S, _activeUpdateControllers, _scratchFocusScreen } from './satellitesState.js';

/**
 * Resolve the canonical point style for a satellite.
 * @param {number} noradId NORAD catalog number.
 * @param {string|undefined} group Catalog group tag (see CATALOG_GROUPS / 'dense').
 * @returns {{ pixelSize: number, color: Cesium.Color, outlineColor: Cesium.Color, outlineWidth: number }}
 */
export function _pointStyleFor(noradId, group) {
  if (noradId === ISS_NORAD) return POINT_STYLES.iss;
  return POINT_STYLES[group] || POINT_STYLES.visual;
}

export function _abortActiveUpdates() {
  for (const controller of _activeUpdateControllers) controller.abort();
  _activeUpdateControllers.clear();
  S._denseLoadController?.abort();
  S._denseLoadController = null;
}

/** Tell the manager to re-render this layer's row (chip state / legend counts). */
export function _notifyRowControls() {
  try {
    S._rowControlsListener?.();
  } catch (error) {
    console.warn('[Data:Satellites] row-controls listener failed:', error);
  }
}

/**
 * Per-class tally for the row legend, cached against the catalog revision.
 * Without the cache this scans ~10.7k entries in dense mode on every panel
 * refresh, and any layer polling on the 1s stats timer refreshes the panel.
 * @returns {Record<string, number>} Class key → count.
 */
export function _classTally() {
  if (S._classTallyCache.counts && S._classTallyCache.revision === S._catalogRevision) {
    return S._classTallyCache.counts;
  }
  const entries = [];
  // Pass the ISS flag, not just the group: during a stations-feed outage the
  // ISS is ingested as `visual`, and the legend must file it exactly where its
  // card does (STATION) rather than letting STATION vanish from the legend.
  for (const [noradId, sat] of S._catalog) {
    entries.push({ group: sat.group, isIss: noradId === ISS_NORAD });
  }
  const counts = tallySatelliteClasses(entries);
  S._classTallyCache = { revision: S._catalogRevision, counts };
  return counts;
}

/**
 * Satellite preferences may be restored while the layer is disabled (for
 * example, when Space Missions releases its dependency). Preferences must not
 * revive render primitives until the layer is explicitly enabled again.
 * @param {boolean} layerEnabled Whether the Satellite layer is enabled.
 * @param {boolean} requestedVisible Whether the current presentation requests visibility.
 * @returns {boolean} Whether a primitive should be visible now.
 */
export function satelliteVisualsVisible(layerEnabled, requestedVisible) {
  return Boolean(layerEnabled) && Boolean(requestedVisible);
}

/**
 * Decide whether a valid catalog request represents a real mode transition.
 * Reapplying an already-active mode must not restart the dense TLE load.
 * @param {'core'|'dense'} currentCatalog Current catalog mode.
 * @param {string|undefined} requestedCatalog Requested catalog mode.
 * @returns {boolean} Whether the catalog mode should change.
 */
export function satelliteCatalogModeChanged(currentCatalog, requestedCatalog) {
  return (requestedCatalog === 'core' || requestedCatalog === 'dense')
    && requestedCatalog !== currentCatalog;
}

/** Focus alpha for satellite points, inside the existing shared preRender tick. */
export function _updatePointFocus(nowMs) {
  const target = getFocusTarget();
  if (!S._params.showPoints || !focusPassIsNeeded(target, S._activeFocusCount)) return;
  if (nowMs - S._lastFocusUpdate < 80) return;
  S._lastFocusUpdate = nowMs;
  const scene = S._viewer.scene;
  const camera = S._viewer.camera;
  const result = applySatellitePointFocusDeemphasis({
    points: S._points,
    trackedId: S._trackedNorad,
    target,
    previousActiveCount: S._activeFocusCount,
    nowMs,
    screenPositionFor: (position) => (
      Cesium.SceneTransforms.worldToWindowCoordinates(scene, position, _scratchFocusScreen)
    ),
    cameraDistanceFor: (position) => Cesium.Cartesian3.distance(camera.positionWC, position),
    baseColorFor: (noradId) => _pointStyleFor(noradId, S._catalog.get(noradId)?.group).color,
  });
  S._activeFocusCount = result.activeCount;
}

/**
 * Apply the gated satellite-point focus pass through the production color path.
 * @param {object} input
 * @returns {{writes:number,transitioning:boolean,activeCount:number,ran:boolean}}
 */
export function applySatellitePointFocusDeemphasis({
  points,
  trackedId,
  target,
  previousActiveCount = 0,
  nowMs,
  screenPositionFor,
  cameraDistanceFor,
  baseColorFor,
  params,
}) {
  if (!focusPassIsNeeded(target, previousActiveCount)) {
    return { writes: 0, transitioning: false, activeCount: 0, ran: false };
  }
  let writes = 0;
  let transitioning = false;
  let activeCount = 0;
  for (const [noradId, point] of points || []) {
    if (noradId === trackedId || !point?.position) continue;
    const cameraDistance = cameraDistanceFor(point.position);
    const distanceScale = nearFarScalarValueAtDistance(point.scaleByDistance, cameraDistance);
    const halfExtentPx = (point.pixelSize || 5) * distanceScale * 0.5;
    const focus = advanceSpriteFocus(point, {
      // Hidden points still release toward identity, preventing stale dim
      // alpha if a catalog/presentation toggle later makes them visible.
      screenPosition: point.show === false ? null : screenPositionFor(point.position),
      cameraDistance,
      nowMs,
      target,
      params,
      spriteHalfWidthPx: halfExtentPx,
      spriteHalfHeightPx: halfExtentPx,
    });
    transitioning ||= focus.transitioning;
    if (focus.active) activeCount += 1;
    const base = baseColorFor(noradId);
    const alpha = base.alpha * focus.factor;
    if (focusAlphaNeedsWrite(point.color?.alpha, alpha, params)) {
      // Point stays continuously present at the non-zero emphasis floor; its
      // own alpha yields around the tracked target, independent of draw order.
      point.color = base.withAlpha(alpha);
      writes += 1;
    }
  }
  return { writes, transitioning, activeCount, ran: true };
}
