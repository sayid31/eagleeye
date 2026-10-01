import { WORLD_OVERLAY_OCCLUDER_SELECTORS, destroyUiOccluderObservers, installUiOccluderObservers } from './worldOverlayOccluder.js';
import { normalizeOverlayEntry as normalizeOverlayEntryRegistry, paintLaneForOverlayEntry, registryDomainList, registryDomains, registrySourceList, registrySources, selectBoundedOverlayCohort } from './worldOverlaySourceRegistry.js';
import { WORLD_OVERLAY_PAINT_LANES } from './worldOverlayTokens.js';
import * as Cesium from 'cesium';
import { destroyWorldOverlayDraw } from './worldOverlayDraw.js';
import { _diagnostics, _paintedBySource, _viewport } from './worldOverlayCoreConstants.js';
import { ensureOverlayDom, markLayoutDirty, markOccludersDirty, overlayHasPaintWork } from './worldOverlayCoreDom.js';
import { getWorldOverlayDiagnostics, updateEntryDiagnostics } from './worldOverlayCoreEntries.js';
import { invalidateHost } from './worldOverlayCoreHelpers.js';
import { createDevFacade, drawWorldOverlay } from './worldOverlayCorePaint.js';
import { S, _accessibleActivatorByKey, _customPaintFrame, _customPaintLaneList, _customPaintLanes, _hitRects, _paintItemPool, _paintQueue, _paintRectByKey, _paintRectPool, _paintedSourceKeys, _records } from './worldOverlayCoreState.js';

export { AMBIENT_CARD_COLLISION_CAPACITY } from './worldOverlayCoreConstants.js';
export { clearOverlaySource, getOverlayPaintRect, getWorldOverlayDiagnostics, hitTestWorldOverlay, isOverlayPointVisible, overlayRectIntersectsAny, overlayRectIntersectsAnyHard, registerWorldOverlayPaintLane, removeOverlayEntry, setOverlayEntries, setOverlaySourceVisible, upsertOverlayEntry } from './worldOverlayCoreEntries.js';

export { WORLD_OVERLAY_OCCLUDER_SELECTORS };

export { paintLaneForOverlayEntry, selectBoundedOverlayCohort } from './worldOverlaySourceRegistry.js';

// `WORLD_OVERLAY_PAINT_LANES` itself now lives in `worldOverlayTokens.js` (see
// that file's docstring for why); re-exported unchanged for `worldOverlay.test.mjs`
// and any other existing external consumer of this module's public API.
export { WORLD_OVERLAY_PAINT_LANES } from './worldOverlayTokens.js';

/**
 * Validate and copy a source entry into the shared presentation contract.
 * Thin Cesium-bound wrapper over the registry's Cesium-agnostic normalizer
 * (kept as a named export here — unchanged public API/signature for the 13
 * external importers and `worldOverlay.test.mjs`).
 * @param {string} sourceId
 * @param {object} entry
 * @returns {WorldOverlayEntry}
 */
export function normalizeOverlayEntry(sourceId, entry) {
  return normalizeOverlayEntryRegistry(Cesium, sourceId, entry);
}

/**
 * Initialize the singleton host. Repeated calls for the same viewer are no-op.
 * @param {Cesium.Viewer} viewer
 */
export function initWorldOverlay(viewer) {
  if (!viewer?.scene?.postRender?.addEventListener) {
    throw new TypeError('initWorldOverlay requires a Cesium viewer with scene.postRender');
  }
  if (S._viewer === viewer && S._canvas && S._removePostRender) return;
  if (S._viewer) destroyWorldOverlay();
  S._destroyed = false;
  S._viewer = viewer;
  ensureOverlayDom();
  S._occluder = new Cesium.EllipsoidalOccluder(
    Cesium.Ellipsoid.WGS84,
    viewer.camera?.positionWC || new Cesium.Cartesian3(),
  );
  S._cockpitActive = !!document.body?.classList?.contains('cockpit-mode');
  S._cockpitModeHandler = (event) => {
    S._cockpitActive = event?.detail?.active === true;
    invalidateHost();
  };
  window.addEventListener('gev:cockpit-mode-changed', S._cockpitModeHandler);
  S._removePostRender = viewer.scene.postRender.addEventListener(drawWorldOverlay);
  if (viewer.camera?.moveEnd?.addEventListener) {
    S._removeMoveEnd = viewer.camera.moveEnd.addEventListener(() => invalidateHost());
  }
  installUiOccluderObservers(S._root, {
    onLayoutDirty: markLayoutDirty,
    hasPaintWork: overlayHasPaintWork,
    onOccludersDirty: markOccludersDirty,
  });
  // The backing store and the occluder inventory are both deferred to the
  // first frame with real paint work: a dormant host must not hold a
  // full-viewport canvas (~19 MB at DPR 2) or scan the UI for exclusions.
  S._resizeDirty = true;
  S._occludersDirty = true;
  S._solveDirty = true;
  S._canvasNeedsClear = true;
  S._detectionSurfaceNeedsClear = true;
  updateEntryDiagnostics();
  createDevFacade();
}

/** Remove all listeners, observers, entries, diagnostics, and overlay DOM. */
export function destroyWorldOverlay() {
  // Tearing down a host that was never initialized must not arm the
  // post-destroy guard: sources are allowed to publish before the first
  // `initWorldOverlay`, and that buffering has to survive a stray destroy.
  const hadHost = S._viewer !== null;
  S._removePostRender?.();
  S._removePostRender = null;
  S._removeMoveEnd?.();
  S._removeMoveEnd = null;
  if (S._cockpitModeHandler && typeof window !== 'undefined') {
    window.removeEventListener('gev:cockpit-mode-changed', S._cockpitModeHandler);
  }
  S._cockpitModeHandler = null;
  destroyUiOccluderObservers();
  destroyWorldOverlayDraw();
  S._root?.remove?.();
  S._accessibilityRoot?.remove?.();
  // The detection surface is not a child of `_root` (it lives in the Cesium
  // container so its `screen` blend reaches the scene), so it has to be torn
  // down explicitly rather than by the root's removal.
  S._detectionSurface?.remove?.();
  if (typeof window !== 'undefined' && window.__gevWorldOverlay?.getDiagnostics === getWorldOverlayDiagnostics) {
    delete window.__gevWorldOverlay;
  }
  registrySources.clear();
  registrySourceList.length = 0;
  for (let i = 0; i < _customPaintLaneList.length; i++) {
    _customPaintLaneList[i].active = false;
    _customPaintLaneList[i].painter = null;
    _customPaintLaneList[i].shouldPaint = null;
  }
  _customPaintLanes.clear();
  _customPaintLaneList.length = 0;
  registryDomains.clear();
  registryDomainList.length = 0;
  _records.clear();
  for (let i = 0; i < _paintItemPool.length; i++) {
    const item = _paintItemPool[i];
    item.record = null;
    item.placement = null;
  }
  for (let i = 0; i < _paintRectPool.length; i++) {
    _paintRectPool[i].entry = null;
  }
  _paintQueue.length = 0;
  _paintItemPool.length = 0;
  _paintRectPool.length = 0;
  _hitRects.length = 0;
  _accessibleActivatorByKey.clear();
  S._accessibilitySignature = '';
  _paintRectByKey.clear();
  S._paintCount = 0;
  S._paintRectCount = 0;
  S._hitRectCount = 0;
  // _uiOcclusionRects (and the occluder module's own pool/timer/observer
  // state) were already reset by destroyUiOccluderObservers() above.
  S._destroyed = hadHost || S._destroyed;
  S._viewer = null;
  S._root = null;
  S._canvas = null;
  S._ctx = null;
  S._accessibilityRoot = null;
  S._accessibilityList = null;
  S._accessibilityStatus = null;
  S._detectionSurface = null;
  S._detectionCtx = null;
  S._occluder = null;
  S._occluderCameraX = Number.NaN;
  S._occluderCameraY = Number.NaN;
  S._occluderCameraZ = Number.NaN;
  S._keyhole = null;
  S._keyholeWidth = -1;
  S._keyholeHeight = -1;
  S._keyholeFadeRatio = Number.NaN;
  S._keyholeOutsideOpacity = Number.NaN;
  S._cockpitActive = false;
  S._resizeDirty = true;
  S._occludersDirty = true;
  S._solveDirty = true;
  S._canvasNeedsClear = true;
  S._detectionSurfaceNeedsClear = true;
  S._detectionSurfacePrepared = false;
  S._canvasWidth = 0;
  S._canvasHeight = 0;
  _viewport.width = 0;
  _viewport.height = 0;
  S._canvasDpr = 1;
  S._layoutRevision = 0;
  _customPaintFrame.canvas = null;
  _customPaintFrame.surface = null;
  _customPaintFrame.ctx = null;
  _customPaintFrame.width = 0;
  _customPaintFrame.height = 0;
  _customPaintFrame.dpr = 1;
  _customPaintFrame.timestamp = 0;
  _customPaintFrame.cameraPosition = null;
  _customPaintFrame.occluder = null;
  _customPaintFrame.keyhole = null;
  _customPaintFrame.uiRectCount = 0;
  _customPaintFrame.layoutRevision = 0;
  for (let i = 0; i < _paintedSourceKeys.length; i++) {
    delete _paintedBySource[_paintedSourceKeys[i]];
  }
  _paintedSourceKeys.length = 0;
  Object.assign(_diagnostics, {
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
  });
}
