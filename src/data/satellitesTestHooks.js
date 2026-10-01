// Moved out of satellites.js (satellitesTestHooks).

import * as Cesium from 'cesium';
import { DEFAULT_OVERLAY_HOST, ISS_NORAD, ISS_OVERLAY_SOURCE_ID } from './satellitesConstants.js';
import { _preRenderTick } from './satellitesDense.js';
import { _syncIssOverlay } from './satellitesIss.js';
import { S, _trackedFrameCartesian } from './satellitesState.js';
import { _applyPendingTrackingRestore, _cancelPendingTrackingRestore, _clearTracking, _trackSatellite } from './satellitesTracking.js';

/**
 * Seed a single tracked satellite so tests can invoke the exact production
 * pre-render callback without constructing a WebGL viewer.
 * @param {object} state
 * @param {number} state.noradId
 * @param {string} state.name
 * @param {object} state.satrec
 * @param {object} state.entity
 * @param {object} state.point
 * @param {object} state.viewer
 * @param {() => (number|Date)} state.now
 */
export function _setTrackedSatelliteRefreshStateForTest({
  noradId,
  name,
  satrec,
  entity,
  point,
  viewer,
  now,
  // Extra catalog/point rows so a test can exercise a docked cluster (and a
  // control satellite that must NOT be treated as part of it).
  neighbours = [],
}) {
  S._viewer = viewer;
  S._catalog = new Map([[noradId, { name, satrec, group: 'stations' }]]);
  S._points = new Map([[noradId, point]]);
  for (const neighbour of neighbours) {
    S._catalog.set(neighbour.noradId, {
      name: neighbour.name,
      satrec: neighbour.satrec || satrec,
      group: neighbour.group || 'stations',
    });
    S._points.set(neighbour.noradId, neighbour.point);
  }
  S._dockedCompanions = new Set();
  S._lastDockedScanMs = Number.NEGATIVE_INFINITY;
  S._trackedNorad = noradId;
  S._trackedEntity = entity;
  S._trackedFrameNumber = -1;
  S._trackedFrameGeo = null;
  S._trackedFrameNowForTest = now;
  S._params = { catalog: 'core', showPoints: false, showOrbits: false };
  S._enabled = true;
}

/** Seed catalog authority and optional dense settlement for share-Follow tests. */
export function _setSatelliteTrackingRefreshOutcomeForTest({
  status = 'accepted',
  failedGroups = [],
  catalog = 'core',
  densePromise = null,
} = {}) {
  const epoch = ++S._trackingRefreshEpoch;
  S._lastTrackingRefreshOutcome = { epoch, status, failedGroups: [...failedGroups] };
  S._params.catalog = catalog;
  S._denseLoadPromise = densePromise || Promise.resolve({ status: 'not-requested' });
}

/** The tracked satellite's current ECEF sample — the value the docked-cluster
 *  scan measures against. Exposed so a test can place neighbours around it. */
export function _trackedFrameCartesianForTest() {
  return _trackedFrameCartesian;
}

/** Invoke the same callback registered on `scene.preRender` in production. */
export function _runSatellitePreRenderForTest() {
  _preRenderTick();
}

/**
 * Seed the minimum render state a dense-catalog load needs, so a test can
 * exercise the real async load/settle/fail path (and the row-control states it
 * drives) without constructing a WebGL viewer.
 * @param {{ catalog?: 'core'|'dense', showPoints?: boolean }} [options]
 */
export function _setDenseCatalogStateForTest({ catalog = 'core', showPoints = true } = {}) {
  S._viewer = { scene: { primitives: { add: (p) => p, remove() {} } } };
  // Neutralize the shared world-overlay host: these tests exercise catalog and
  // row-control logic, not the ISS callout.
  S._overlayHost = { setEntries() {}, setVisible() {}, clearSource() {} };
  S._pointCollection = {
    show: true,
    add: (opts) => ({ ...opts }),
    remove() {},
    removeAll() {},
  };
  S._catalog = new Map();
  S._points = new Map();
  S._detectionObjects = new Map();
  S._orbitPaths = new Map();
  S._denseIds = [];
  S._denseCursor = 0;
  S._denseLoadToken++;
  S._denseStatus = 'idle';
  S._denseError = null;
  S._catalogRevision++;
  S._trackedNorad = null;
  _cancelPendingTrackingRestore();
  S._params = { catalog, showPoints, showOrbits: false };
  S._enabled = true;
  // So a test driving _runSatellitePreRenderForTest() right after this seam
  // isn't at the mercy of how much wall-clock time elapsed since whatever
  // ran before it in the same test process — force the next tick's
  // interval gate (POSITION_UPDATE_MS) to pass unconditionally.
  S._lastPropagation = 0;
}

/** Tear the dense seam back down so ordering cannot leak into other tests. */
export function _clearDenseCatalogStateForTest() {
  S._rowControlsListener = null;
  S._overlayHost = DEFAULT_OVERLAY_HOST;
  S._orbitPaths = new Map();
  S._viewer = null;
  S._pointCollection = null;
  S._catalog = new Map();
  S._points = new Map();
  S._denseIds = [];
  S._denseLoadToken++;
  S._denseStatus = 'idle';
  S._denseError = null;
  S._params = { catalog: 'core', showPoints: true, showOrbits: true };
  _cancelPendingTrackingRestore();
  S._enabled = false;
}

/** Catalog group tag recorded for a satellite, for ingestion-path assertions. */
export function _catalogGroupForTest(noradId) {
  return S._catalog.get(Number(noradId))?.group;
}

/**
 * Add one real, propagable core-catalog satellite + point primitive on top
 * of whichever render-state seam (e.g. _setDenseCatalogStateForTest) already
 * set up _catalog/_points — for tests that need _propagateAll()'s real SGP4 +
 * on-screen scan to have a genuine target, not a 'dense' entry it skips.
 * @param {number} noradId
 * @param {import('satellite.js').SatRec} satrec
 * @param {{show?: boolean}} [pointOverrides]
 */
export function _addCoreCatalogEntryForTest(noradId, satrec, pointOverrides = {}) {
  S._catalog.set(noradId, { name: `TEST-${noradId}`, satrec, group: 'stations' });
  const point = { position: new Cesium.Cartesian3(), show: true, ...pointOverrides };
  S._points.set(noradId, point);
  S._count = S._points.size;
  return point;
}

/**
 * Attach a real Cesium camera to whichever render-state seam (e.g.
 * _setDenseCatalogStateForTest) already built `_viewer` — needed so
 * `_propagateAll()`'s on-screen scan (horizon occluder + frustum cull) has
 * something genuine to test satellites against instead of the seam's
 * camera-less viewer stub (which makes the scan fail toward "on screen").
 * @param {Cesium.Camera} camera
 */
export function _setCameraForTest(camera) {
  if (S._viewer) S._viewer.camera = camera;
}

/**
 * Force the next `_runSatellitePreRenderForTest()` call to re-run
 * `_propagateAll()` (and therefore the on-screen scan) regardless of how
 * little wall-clock time has passed since the last one — a test driving two
 * scans back to back (e.g. to swing the camera between them) would otherwise
 * have its second call swallowed by the real 1s throttle in `_preRenderTick`.
 */
export function _forceNextPropagationForTest() {
  S._lastPropagation = 0;
}

/** Seed ISS/tracking state while retaining the production track and host paths. */
export function _setSatelliteLabelLifecycleStateForTest({
  viewer,
  satrec,
  point,
  overlayHost,
  preservePending = false,
}) {
  S._viewer = viewer;
  S._catalog = new Map([[ISS_NORAD, { name: 'ISS (ZARYA)', satrec, group: 'stations' }]]);
  S._points = new Map([[ISS_NORAD, point]]);
  S._orbitPaths = new Map([[
    ISS_NORAD,
    { primitive: { show: true, modelMatrix: new Cesium.Matrix4() }, gmstAtBake: 0 },
  ]]);
  S._trackedNorad = null;
  S._trackedEntity = null;
  if (!preservePending) _cancelPendingTrackingRestore();
  S._trackedFrameNumber = -1;
  S._trackedFrameGeo = null;
  S._enabled = true;
  S._params = { catalog: 'core', showPoints: true, showOrbits: true };
  S._overlayHost = overlayHost || DEFAULT_OVERLAY_HOST;
  _syncIssOverlay();
}

/** Exercise production ISS tracking from the cached catalog and point. */
export function _trackIssForTest() {
  _trackSatellite(ISS_NORAD);
  return S._trackedEntity;
}

/** Return the deferred restore target held by the production tracker. */
export function _pendingSatelliteTrackingRestoreForTest() {
  return S._pendingTrackingRestore?.id ?? null;
}

/** Exercise the production deferred-restore retry after a simulated catalog refresh. */
export function _applyPendingSatelliteTrackingRestoreForTest() {
  return _applyPendingTrackingRestore();
}

/** Remove a cached catalog row so tests can model a target arriving later. */
export function _removeSatelliteTrackingCandidateForTest(noradId) {
  const id = Number(noradId);
  S._catalog.delete(id);
  S._points.delete(id);
}

/** Exercise production untrack and restore the default host seam. */
export function _clearSatelliteLabelLifecycleForTest() {
  _clearTracking();
  S._enabled = false;
  S._overlayHost.clearSource(ISS_OVERLAY_SOURCE_ID);
  S._overlayHost.setVisible(ISS_OVERLAY_SOURCE_ID, false);
  S._overlayHost = DEFAULT_OVERLAY_HOST;
}
