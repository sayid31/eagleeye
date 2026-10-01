/**
 * @module flights
 * @description Real-time flight tracking layer powered by the OpenSky Network API
 * (authenticated via Vite dev-server proxy at /api/opensky).
 *
 * Rendering strategy: all aircraft are drawn as billboards in a single
 * BillboardCollection for GPU-efficient batching (handles 5000+ aircraft).
 * Each billboard's alignedAxis is set to the WGS84 ellipsoid surface normal
 * so that the rotation value (derived from true_track heading) operates in
 * the local tangent plane (0 deg = north, 90 deg = east).
 *
 * Click-to-track: clicking a billboard creates a tracked Entity whose
 * position is driven by a dead-reckoning CallbackProperty.  Between API
 * refreshes (every ~10-30 s) the aircraft advances smoothly using ENU frame
 * math.  When a new API fix arrives, a 1-second lerp blends the current
 * dead-reckoned position into the corrected fix to avoid visual snapping.
 *
 * Press Escape or click empty space to deselect a tracked flight — the camera
 * is released IN PLACE (no flyTo), so the user keeps the context they were
 * looking at (owner decision 2026-07-02).
 */

import { LAYER_METADATA } from './layerMetadata.js';
import { advanceFocusEvidenceNowMs, getFocusDeemphasisParams, setFocusDeemphasisParams, setFocusEvidenceNowMs } from './focusDeemphasis.js';
import { getAircraftRecessionParams, setAircraftRecessionParams } from './aircraftRecession.js';
import { _normalizeTrackedIcao } from './flightsApi.js';
import { FLEET_DR_INTERVAL_MS, FOCUS_EVIDENCE_DEV } from './flightsConstants.js';
import { _clearDisplayFloorStateForTest } from './flightsDisplayFloor.js';
import { _focusEvidenceSnapshot, _moveFocusEvidenceAircraft, _setFocusEvidenceAircraft } from './flightsEvidence.js';
import { _presentation } from './flightsInstances.js';
import { destroyFlightsLayer, disableFlightsLayer, enableFlightsLayer, initFlightsLayer } from './flightsLifecycle.js';
import { findFlightsByQuery, flightsHasContact, getFlightsAllPositions, getFlightsAnalystRecords, getFlightsDetectableObjects, getFlightsNearby, refreshFlightsTr3b, setFlightsLayerParams } from './flightsQueries.js';
import { S } from './flightsState.js';
import { cancelFlightsPendingTrackingRestore, getFlightsStats, getFlightsTrackedInfo, getFlightsTrackedSubject, refocusFlightsTrackedById, stopFlightsTracking, trackFlightsById } from './flightsTrackingApi.js';
import { updateFlightsLayer } from './flightsUpdate.js';

export { TRACKED_MODEL_MAX_PX } from './flightsConstants.js';
export { _clearDisplayFloorStateForTest, _floorGroundedDisplayPositionForTest } from './flightsDisplayFloor.js';
export { mapAnalystRecord } from './flightsEvidence.js';
export { _addFlightTrackingCandidateForTest, _applyPendingFlightTrackingRestoreForTest, _armFlightTrackingRestoreForTest, _driveFleetModelHandoffForTest, _ensureFleetModelForTest, _militaryLayerSuppressesForTest, _pendingFlightTrackingRestoreForTest, _setCockpitDetectionSubjectForTest, _setFlightTrackingRefreshOutcomeForTest, _setTrackedFlightRefreshStateForTest, _trackedBillboardColorForTest, _trackedModelRegimeActiveForTest, _updateTrackedModelForTest } from './flightsTestHooks.js';

/**
 * Flights data-layer descriptor.
 * Conforms to the layer manager interface: init / enable / disable / update / destroy / getStats.
 * @type {object}
 */
const flightsLayer = {
  ...LAYER_METADATA.flights,
  // Browser-harness seam: isolates synthetic display-floor scenarios without
  // changing any production lifecycle or cache policy.
  _clearDisplayFloorStateForTest,
  /** @type {number} Polling interval (ms) between update() calls */
  updateInterval: 30000,

  /**
   * Initialize the flights layer.
   * Creates the BillboardCollection, resets all state, and installs the
   * click-to-track handler on the scene canvas.
   * @param {Cesium.Viewer} viewer - The CesiumJS viewer instance.
   */
  init: initFlightsLayer,

  /**
   * Show the billboard collection and re-install the click handler.
   * @param {Cesium.Viewer} viewer
   */
  enable: enableFlightsLayer,

  /**
   * Hide all flight billboards and tear down click/keyboard handlers.
   * Also clears any active flight tracking so the camera is released.
   * @param {Cesium.Viewer} viewer
   */
  disable: disableFlightsLayer,

  /**
   * Fetch the latest aircraft state vectors from the OpenSky proxy and
   * reconcile them with the billboard collection.
   *
   * Handles HTTP 429 (rate-limit), 401/403 (auth), and transient errors
   * with exponential-ish backoff.  On success, adds/updates/removes
   * billboards and position history, triggers lerp blending for the
   * tracked aircraft, and updates its label text.
   *
   * @param {Cesium.Viewer} viewer
   * @returns {Promise<void>}
   */
  update: updateFlightsLayer,

  /**
   * Fully tear down the flights layer — remove primitives, handlers,
   * tracked entities, and clear all internal state maps.
   * @param {Cesium.Viewer} viewer
   */
  destroy: destroyFlightsLayer,

  /**
   * Live layer params.
   * `models3d` toggles 3D glTF model rendering for the FLEET (altitude-gated): when on,
   * surrounding aircraft become 3D models once the camera is zoomed in past MODEL_ALT_CEIL_M.
   * The TRACKED contact is NOT gated by this — it takes its 3D model by camera distance
   * regardless (see `_trackedModelRegimeActive` / trackedModelRegime.js).
   * `models3dMode` is 'proximity' (nearest MODEL_MAX in view) or 'all' (every in-view plane).
   * @param {{models3d?: boolean, models3dMode?: 'proximity'|'all', selectedFlightsTrackingId?: string|null}} params
   */
  setParams: setFlightsLayerParams,
  getParams() {
    return {
      models3d: S._models3dEnabled,
      models3dMode: S._models3dMode,
      irBoost: _presentation.irBoost,
      selectedFlightsTrackingId: S._trackedIcao,
    };
  },

  /**
   * Re-render a contact whose TR-3B conversion just flipped (Easter egg).
   * Callers own the registry write; this only re-derives what renders.
   * @param {string} icao24 - ICAO 24-bit address.
   * @returns {boolean} True when this layer owns the contact.
   */
  refreshTr3b: refreshFlightsTr3b,

  /**
   * Return a subsample of currently visible aircraft for detection overlay
   * rendering (e.g. bounding boxes drawn on-screen by the CCTV detection layer).
   *
   * Uses a deterministic stride + seed to select a spatially distributed
   * subset without sorting or shuffling.
   *
   * @param {object}  [options]
   * @param {number}  [options.maxCount] - Maximum number of objects to return.
   * @param {number}  [options.seed]     - Deterministic offset into the stride pattern.
   * @returns {Array<{position: Cesium.Cartesian3, id: string, type: string, skipLabel: boolean}>}
   */
  getDetectableObjects: getFlightsDetectableObjects,

  /**
   * Find a single aircraft by free-text query.
   * Match priority: exact icao24 hex, exact callsign, callsign prefix,
   * then callsign substring (all case-insensitive, trimmed).
   * @param {string} query - ICAO24 hex or full/partial callsign.
   * @returns {{icao24: string, callsign: string|null, position: Cesium.Cartesian3, latitude: number, longitude: number, altitudeM: number, velocityMps: number|null, track: number|null}|null}
   *   Best match with a cloned, dead-reckoned position, or null if none.
   */
  findByQuery: findFlightsByQuery,

  /**
   * Find aircraft near a given ECEF position, sorted ascending by distance.
   * Return shape mirrors militaryFlightsLayer.getNearby (id/icao24/position/distance).
   * @param {Cesium.Cartesian3} center - Reference position in ECEF coordinates.
   * @param {number} range - Maximum distance in meters (Infinity if not finite).
   * @param {number} [maxCount=50] - Maximum number of results to return.
   * @param {object} [options] Query membership options.
   * @param {boolean} [options.includeHidden=false] Include loaded horizon-hidden aircraft.
   * @returns {Array<{id: string, icao24: string, callsign: string|null, position: Cesium.Cartesian3, distance: number, aircraftClass: string|null, altitudeM: number|null, velocityMps: number|null, track: number|null}>}
   */
  getNearby: getFlightsNearby,

  /**
   * Return id/label/position for up to maxCount currently rendered aircraft.
   * Cheap snapshot for voice-tool framing — billboard positions only, no
   * dead reckoning and no cloning.
   * @param {number} [maxCount=500] - Maximum number of entries to return.
   * @returns {Array<{id: string, label: string, position: Cesium.Cartesian3, latitude: number, longitude: number, altitudeM: number}>}
   */
  /**
   * Whether this layer still carries a contact, in O(1).
   *
   * Presence consumers must not infer absence from `getAllPositions`: it stops
   * at its cap, and this layer routinely carries ~11k contacts against a
   * 1,000-row cap, so "not in the returned rows" is not "gone". Id matching
   * mirrors trackById: exact key first, then lowercase.
   * A disabled layer keeps its records but hides the collection, so it must
   * decline rather than answer from data the user can no longer see —
   * otherwise a preserved subject reads as fresh off stale hidden state.
   * @param {string} icao24 Contact identifier.
   * @returns {boolean|null} Presence, or null when the layer is disabled or
   *   holds no data and therefore cannot answer.
   */
  hasContact: flightsHasContact,

  getAllPositions: getFlightsAllPositions,

  /**
   * Snapshot the layer's in-memory records as plain JSON-safe objects for
   * the analyst query engine. On-demand only (called at most once per
   * spoken query) — zero per-frame cost, no listeners, no caching, no
   * enrichment fetches (cached adsbdb values only). Returns [] while the
   * layer is disabled or empty.
   * @param {number} [maxCount=2000] - Maximum records to return (truncation).
   * @returns {Array<Object>} See mapAnalystRecord for the record shape.
   */
  getAnalystRecords: getFlightsAnalystRecords,

  /**
   * Start camera-tracking an aircraft by ICAO24 address.
   * @param {string} icao24 - ICAO 24-bit transponder address.
   * @returns {boolean} True if the aircraft exists and tracking started.
   */
  trackById: trackFlightsById,

  /** Resolve a shared Follow target only against the latest accepted refresh. */
  async resolveTrackingRestoreTarget(icao24, { signal = null, origin = 'share-restore' } = {}) {
    if (signal?.aborted) return { status: 'cancelled', reason: String(signal.reason || 'aborted') };
    const id = _normalizeTrackedIcao(icao24);
    if (!id) return { status: 'missing', reason: 'invalid-target' };
    const outcome = S._lastTrackingRefreshOutcome;
    if (outcome.status !== 'accepted') {
      return {
        status: 'source-unavailable',
        reason: 'OpenSky snapshot unavailable',
        refreshEpoch: outcome.epoch,
        source: outcome.source,
        coverage: outcome.coverage,
      };
    }
    if (!outcome.ids.has(id)) {
      return {
        status: 'missing',
        reason: 'target-absent-from-snapshot',
        refreshEpoch: outcome.epoch,
        source: outcome.source,
        coverage: outcome.coverage,
      };
    }
    if (signal?.aborted) return { status: 'cancelled', reason: String(signal.reason || 'aborted') };
    const followed = this.trackById(id, { origin });
    return followed
      ? {
          status: 'found',
          refreshEpoch: outcome.epoch,
          source: outcome.source,
          coverage: outcome.coverage,
        }
      : { status: 'source-unavailable', reason: 'target-not-renderable', refreshEpoch: outcome.epoch };
  },

  /** Reapply the canonical follow frame without recreating the selected flight. */
  refocusTrackedById: refocusFlightsTrackedById,

  /**
   * Stop tracking the currently followed aircraft (no-op if none).
   * @returns {boolean} Always true.
   */
  stopTracking: stopFlightsTracking,

  cancelPendingTrackingRestore: cancelFlightsPendingTrackingRestore,

  /**
   * Describe the currently tracked aircraft at its dead-reckoned position.
   * @returns {{icao24: string, callsign: string|null, latitude: number, longitude: number, altitudeM: number, velocityMps: number|null, track: number|null}|null}
   *   Tracked aircraft info, or null when nothing is tracked.
   */
  getTrackedInfo: getFlightsTrackedInfo,

  /**
   * Return the current aircraft as a Context subject without changing
   * tracking or camera ownership.
   * @returns {{layerId: string, id: string, label: string, position: Cesium.Cartesian3}|null}
   *   Detached subject descriptor, or null when no aircraft is tracked.
   */
  getTrackedSubject: getFlightsTrackedSubject,

  ...(FOCUS_EVIDENCE_DEV ? {
    __focusEvidence: Object.freeze({
      setAircraft: _setFocusEvidenceAircraft,
      moveAircraft: _moveFocusEvidenceAircraft,
      snapshot: _focusEvidenceSnapshot,
      setTuning({ focus = {}, horizon = {} } = {}) {
        return {
          focus: setFocusDeemphasisParams(focus),
          horizon: setAircraftRecessionParams(horizon),
        };
      },
      getTuning() {
        return {
          focus: { ...getFocusDeemphasisParams() },
          horizon: { ...getAircraftRecessionParams() },
        };
      },
      takeFrameClock(startMs = 1_000_000_000) {
        if (!S._viewer || !Number.isFinite(startMs)) return { ok: false, nowMs: null };
        S._viewer.useDefaultRenderLoop = false;
        setFocusEvidenceNowMs(startMs);
        S._lastFleetTickMs = startMs - FLEET_DR_INTERVAL_MS;
        // Cross a browser task boundary, then close Cesium's pending-loop
        // latch. Any already-queued callback still observes the false gate,
        // while manual evidence renders can begin without waiting on VSYNC.
        return new Promise((resolve) => setTimeout(() => {
          if (S._viewer?._cesiumWidget) S._viewer._cesiumWidget._renderLoopRunning = false;
          resolve({ ok: true, nowMs: startMs });
        }, 0));
      },
      advanceFrameClock(deltaMs = FLEET_DR_INTERVAL_MS) {
        return advanceFocusEvidenceNowMs(deltaMs);
      },
      releaseFrameClock() {
        setFocusEvidenceNowMs(null);
        if (S._viewer) S._viewer.useDefaultRenderLoop = true;
      },
    }),
  } : {}),

  /**
   * Return layer health/status for the HUD stats chip.
   * @returns {{count: number, lastUpdate: number|null, stale: boolean, error: string|null, status: number|null, retryInSec: number}}
   */
  getStats: getFlightsStats,
};

export default flightsLayer;
