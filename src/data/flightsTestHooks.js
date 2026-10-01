// Moved out of flights.js (flightsTestHooks).

import * as Cesium from 'cesium';
import { _applyCockpitState } from './flightsCockpit.js';
import { CYAN_TRANSPARENT } from './flightsConstants.js';
import { _ensureModel } from './flightsFleetModels.js';
import { _driveFleetModelHandoff, _modelOwnsVisual } from './flightsInstances.js';
import { S, _displayCourse, _geoidNCache, _models } from './flightsState.js';
import { _trackedModelRegimeActive, _updateTrackedModel } from './flightsTrackedModel.js';
import { _applyPendingTrackingRestore, _cancelPendingTrackingRestore, _militaryLayerSuppresses } from './flightsTracking.js';

/**
 * Seed only the mutable state needed to exercise tracked-card refreshes through
 * the production poll reconciler. Tests still call `flightsLayer.update()`;
 * this seam avoids constructing the browser-only Cesium layer lifecycle.
 * @param {object} state
 * @param {string} state.icao24
 * @param {object} state.entity
 * @param {object} state.meta
 * @param {object} state.billboard
 * @param {object} state.billboardCollection
 * @param {object} state.viewer
 * @param {Array<Object>} [state.history=[]]
 * @param {boolean} [state.tracked=true]
 * @param {Iterable<[string, object]>} [state.models=[]] - Fleet 3D models keyed
 *   by icao24, for the billboard-hidden/model-shown handoff state.
 */
export function _setTrackedFlightRefreshStateForTest({
  icao24,
  entity,
  meta,
  billboard,
  billboardCollection,
  viewer,
  history = [],
  tracked = true,
  models = [],
  modelCollection = null,
}) {
  S._viewer = viewer;
  S._modelCollection = modelCollection;
  S._billboardCollection = billboardCollection;
  S._billboards = new Map([[icao24, billboard]]);
  _models.clear();
  for (const [key, model] of models) _models.set(key, model);
  S._detectionObjects = new Map();
  S._flightData = new Map([[icao24, meta]]);
  S._positionHistory = new Map([[icao24, history]]);
  S._missingPolls = new Map();
  _displayCourse.clear();
  _geoidNCache.clear();
  S._trackedIcao = tracked ? icao24 : null;
  S._trackedEntity = tracked ? entity : null;
  S._trackedModel = null;
  _cancelPendingTrackingRestore();
  S._trackedModelLoading = false;
  // NOTE: deliberately does NOT reset the per-selection latches. They are
  // production state owned by the tracking lifecycle (_resetTrackedSelectionState),
  // and clearing them here would mask exactly the deselect→re-track hole this
  // seam is used to test.
  S._backoff = false;
  S._retryAt = 0;
}

/** Seed the authoritative snapshot outcome used by share-Follow tests. */
export function _setFlightTrackingRefreshOutcomeForTest({
  status = 'accepted',
  ids = [],
  source = 'OpenSky Network',
  coverage = 'test',
} = {}) {
  const epoch = ++S._trackingRefreshEpoch;
  S._lastTrackingRefreshOutcome = {
    epoch,
    status,
    ids: new Set(ids.map((id) => String(id).trim().toLowerCase())),
    source,
    coverage,
  };
}

/** Add a cached contact so tests can model a target arriving on a later feed. */
export function _addFlightTrackingCandidateForTest({ icao24, meta, billboard, history = [] }) {
  S._billboards.set(icao24, billboard);
  S._flightData.set(icao24, meta);
  S._positionHistory.set(icao24, history);
}

/** Expose the military-suppression decision for the civil duplicate. */
export function _militaryLayerSuppressesForTest(icao24) {
  return _militaryLayerSuppresses(icao24);
}

/** Arm the deferred restore latch directly, without a full setParams turn. */
export function _armFlightTrackingRestoreForTest(id, origin = 'share-restore') {
  S._pendingTrackingRestore = id === null
    ? null
    : { id, generation: S._trackingIntentGeneration, origin };
}

/** Return the deferred restore target held by the production tracker. */
export function _pendingFlightTrackingRestoreForTest() {
  return S._pendingTrackingRestore?.id ?? null;
}

/** Exercise the production deferred-restore retry after a simulated feed refresh. */
export function _applyPendingFlightTrackingRestoreForTest() {
  return _applyPendingTrackingRestore();
}

/** Set the exact Cockpit subject through the production state transition for focused tests. */
export function _setCockpitDetectionSubjectForTest(active, subjectId = null) {
  _applyCockpitState({ active, subjectId });
}

/** Evaluate the TRACKED contact's zoom regime through the production predicate.
 *  The decision is latch-bearing (default-on, hysteretic, cockpit/TR-3B-suppressed)
 *  and otherwise only observable through a live scene, so tests drive it here. */
export function _trackedModelRegimeActiveForTest() {
  return _trackedModelRegimeActive();
}

/** Run one frame of the production tracked-model driver (normally a
 *  `scene.preUpdate` listener) so tests can pin its bounded load retries. */
export function _updateTrackedModelForTest() {
  return _updateTrackedModel();
}

/** Evaluate the production tracked-billboard handoff colour for focused tests. */
export function _trackedBillboardColorForTest() {
  return _modelOwnsVisual(S._trackedIcao) ? CYAN_TRANSPARENT : Cesium.Color.CYAN;
}

/** Drive the exact fleet billboard-to-model handoff used by `_fleetTick`. */
export function _driveFleetModelHandoffForTest({ icao24, position, course = 0 }) {
  return _driveFleetModelHandoff(
    icao24,
    _models.get(icao24),
    S._billboards.get(icao24),
    position,
    course,
  );
}

/** Exercise the exact asynchronous fleet loader and return its admitted model. */
export async function _ensureFleetModelForTest(icao24) {
  await _ensureModel(icao24);
  return _models.get(icao24) || null;
}
