import { LAYER_METADATA } from './layerMetadata.js';
import { _presentation } from './militaryFlightsInstances.js';
import { destroyMilitaryFlightsLayer, disableMilitaryFlightsLayer, enableMilitaryFlightsLayer, initMilitaryFlightsLayer } from './militaryFlightsLifecycle.js';
import { findMilitaryFlightsByQuery, getMilitaryFlightsAllPositions, getMilitaryFlightsAnalystRecords, getMilitaryFlightsDetectableObjects, getMilitaryFlightsNearby, militaryFlightsHasContact, setMilitaryFlightsLayerParams } from './militaryFlightsQueries.js';
import { S } from './militaryFlightsState.js';
import { _refreshTr3bContact } from './militaryFlightsTracking.js';
import { cancelMilitaryFlightsPendingTrackingRestore, getMilitaryFlightsStats, getMilitaryFlightsTrackedInfo, getMilitaryFlightsTrackedSubject, refocusMilitaryFlightsTrackedById, stopMilitaryFlightsTracking, trackMilitaryFlightsById } from './militaryFlightsTrackingApi.js';
import { updateMilitaryFlightsLayer } from './militaryFlightsUpdate.js';

export { TRACKED_MODEL_MAX_PX } from './militaryFlightsConstants.js';
export { mapAnalystRecord } from './militaryFlightsEvidence.js';
export { _addMilitaryTrackingCandidateForTest, _applyPendingMilitaryTrackingRestoreForTest, _driveFleetModelHandoffForTest, _ensureFleetModelForTest, _pendingMilitaryTrackingRestoreForTest, _setCockpitDetectionSubjectForTest, _setMilitaryTrackingRefreshOutcomeForTest, _setTrackedMilitaryRefreshStateForTest, _trackedBillboardColorForTest, _trackedModelRegimeActiveForTest, _updateTrackedModelForTest } from './militaryFlightsTestHooks.js';

/**
 * Layer descriptor object for the military flights data layer.
 * Conforms to the layer manager contract: init, enable, disable, update, destroy,
 * plus optional getNearby, getDetectableObjects, and getStats accessors.
 * @type {Object}
 */
const militaryFlightsLayer = {
  ...LAYER_METADATA.military,
  /** @type {number} Polling interval in ms between API fetches */
  updateInterval: 15000,

  /**
   * Initialize the layer: create the billboard collection, reset all state,
   * and install the click-to-track handler.
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance
   */
  init: initMilitaryFlightsLayer,

  /**
   * Show the layer and re-install the click handler.
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance
   */
  enable: enableMilitaryFlightsLayer,

  /**
   * Hide the layer, clear any active tracking, and remove input handlers
   * so clicks do not get intercepted while the layer is off.
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance
   */
  disable: disableMilitaryFlightsLayer,

  /** @deprecated Compatibility alias for {@link enable}. */
  show(viewer) {
    this.enable(viewer);
  },

  /** @deprecated Compatibility alias for {@link disable}. */
  hide(viewer) {
    this.disable(viewer);
  },

  /**
   * Fetch the latest military aircraft positions from adsb.lol and reconcile
   * with the billboard collection. Handles error backoff, feed-time-stamped
   * position history updates, and grace-period removal of absent aircraft.
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance
   * @returns {Promise<void>}
   */
  update: updateMilitaryFlightsLayer,

  /**
   * Tear down the layer: clear tracking, remove handlers, remove the billboard
   * collection from the scene, and release all state.
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance
   */
  destroy: destroyMilitaryFlightsLayer,

  /**
   * Live layer params.
   * `models3d` toggles 3D glTF jet-model rendering for the FLEET (altitude-gated): when on,
   * surrounding military aircraft become 3D models once the camera is zoomed in past
   * MODEL_ALT_CEIL_M. The TRACKED contact is NOT gated by this — it takes its 3D model by
   * camera distance regardless (see `_trackedModelRegimeActive` / trackedModelRegime.js).
   * `models3dMode` is 'proximity' (nearest MODEL_MAX in view) or 'all' (every in-view plane).
   * @param {{models3d?: boolean, models3dMode?: 'proximity'|'all', selectedMilitaryTrackingId?: string|null}} params
   */
  setParams: setMilitaryFlightsLayerParams,
  getParams() {
    return {
      models3d: S._models3dEnabled,
      models3dMode: S._models3dMode,
      irBoost: _presentation.irBoost,
      selectedMilitaryTrackingId: S._trackedIcao,
    };
  },

  /**
   * Re-render a contact whose TR-3B conversion just flipped (Easter egg).
   * Callers own the registry write; this only re-derives what renders.
   * @param {string} icao24 - ICAO 24-bit address.
   * @returns {boolean} True when this layer owns the contact.
   */
  refreshTr3b(icao24) { return _refreshTr3bContact(icao24); },

  /**
   * Find military aircraft near a given ECEF position, sorted by distance.
   * Used by proximity-based features (e.g. detection overlay, spatial queries).
   * @param {Cesium.Cartesian3} center - Reference position in ECEF coordinates
   * @param {number} range - Maximum distance in meters (Infinity if not specified)
   * @param {number} [maxCount=50] - Maximum number of results to return
   * @param {object} [options] Query membership options.
   * @param {boolean} [options.includeHidden=false] Include loaded horizon-hidden aircraft.
   * @returns {Array<Object>} Sorted array of nearby aircraft descriptors
   */
  getNearby: getMilitaryFlightsNearby,

  /**
   * Return a subset of aircraft suitable for the detection overlay system.
   * Uses a deterministic stride-based sampling to keep the count manageable
   * while distributing selections evenly across the collection.
   * @param {Object} [options={}] - Options
   * @param {number} [options.maxCount] - Maximum objects to return (defaults to all)
   * @param {number} [options.seed] - Seed offset for stride sampling (for frame variation)
   * @returns {Array<{position: Cesium.Cartesian3, id: string, type: string, skipLabel: boolean}>}
   */
  getDetectableObjects: getMilitaryFlightsDetectableObjects,

  /**
   * Find a single aircraft by free-text query.
   * Match priority: exact icao24 hex, exact callsign, callsign prefix,
   * then callsign substring (all case-insensitive, trimmed).
   * @param {string} query - ICAO hex or full/partial callsign.
   * @returns {{icao24: string, callsign: string|null, position: Cesium.Cartesian3, latitude: number, longitude: number, altitudeM: number, velocityMps: number|null, track: number|null}|null}
   *   Best match with a cloned, dead-reckoned position, or null if none.
   */
  findByQuery: findMilitaryFlightsByQuery,

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
   * Mirror of `flights.hasContact`: presence consumers must not infer absence
   * from the capped `getAllPositions` rows. Id matching follows trackById —
   * exact key first, then lowercase.
   * A disabled layer keeps its records but hides the collection, so it must
   * decline rather than answer from data the user can no longer see.
   * @param {string} icao24 Contact identifier.
   * @returns {boolean|null} Presence, or null when the layer is disabled or
   *   holds no data and therefore cannot answer.
   */
  hasContact: militaryFlightsHasContact,

  getAllPositions: getMilitaryFlightsAllPositions,

  /**
   * Snapshot the layer's in-memory records as plain JSON-safe objects for
   * the analyst query engine. On-demand only (called at most once per
   * spoken query) — zero per-frame cost, no listeners, no caching. Returns
   * [] while the layer is disabled or empty.
   * @param {number} [maxCount=2000] - Maximum records to return (truncation).
   * @returns {Array<Object>} See mapAnalystRecord for the record shape.
   */
  getAnalystRecords: getMilitaryFlightsAnalystRecords,

  /**
   * Start camera-tracking an aircraft by ICAO hex identifier.
   * @param {string} icao24 - ICAO hex identifier of the aircraft.
   * @returns {boolean} True if the aircraft exists and tracking started.
   */
  trackById: trackMilitaryFlightsById,

  /** Resolve a shared Follow target only against the latest accepted refresh. */
  async resolveTrackingRestoreTarget(icao24, { signal = null, origin = 'share-restore' } = {}) {
    if (signal?.aborted) return { status: 'cancelled', reason: String(signal.reason || 'aborted') };
    const id = String(icao24 ?? '').trim().toLowerCase();
    if (!id) return { status: 'missing', reason: 'invalid-target' };
    const outcome = S._lastTrackingRefreshOutcome;
    if (outcome.status !== 'accepted') {
      return {
        status: 'source-unavailable',
        reason: 'adsb.lol snapshot unavailable',
        refreshEpoch: outcome.epoch,
        source: outcome.source,
      };
    }
    if (!outcome.ids.has(id)) {
      return {
        status: 'missing',
        reason: 'target-absent-from-snapshot',
        refreshEpoch: outcome.epoch,
        source: outcome.source,
      };
    }
    if (signal?.aborted) return { status: 'cancelled', reason: String(signal.reason || 'aborted') };
    const followed = this.trackById(id, { origin });
    return followed
      ? { status: 'found', refreshEpoch: outcome.epoch, source: outcome.source }
      : { status: 'source-unavailable', reason: 'target-not-renderable', refreshEpoch: outcome.epoch };
  },

  /** Reapply the canonical follow frame without recreating the selected flight. */
  refocusTrackedById: refocusMilitaryFlightsTrackedById,

  /**
   * Stop tracking the currently followed aircraft (no-op if none).
   * @returns {boolean} Always true.
   */
  stopTracking: stopMilitaryFlightsTracking,

  cancelPendingTrackingRestore: cancelMilitaryFlightsPendingTrackingRestore,

  /**
   * Describe the currently tracked aircraft at its dead-reckoned position.
   * @returns {{icao24: string, callsign: string|null, latitude: number, longitude: number, altitudeM: number, velocityMps: number|null, track: number|null}|null}
   *   Tracked aircraft info, or null when nothing is tracked.
   */
  getTrackedInfo: getMilitaryFlightsTrackedInfo,

  /**
   * Return the current aircraft as a Context subject without changing
   * tracking or camera ownership.
   * @returns {{layerId: string, id: string, label: string, position: Cesium.Cartesian3}|null}
   *   Detached subject descriptor, or null when no aircraft is tracked.
   */
  getTrackedSubject: getMilitaryFlightsTrackedSubject,

  /**
   * Return current layer health/status for the HUD status chip.
   * @returns {{count: number, lastUpdate: number|null, stale: boolean, error: string|null, status: number|null, retryInSec: number}}
   */
  getStats: getMilitaryFlightsStats,
};

export default militaryFlightsLayer;
