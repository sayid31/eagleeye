import { findSatelliteOrbitTrackInTle, orbitTrackFromRecord, scoreSatelliteNameMatch } from './satelliteTleLookup.js';
import { LAYER_METADATA } from './layerMetadata.js';
import { cancelSatellitesPendingTrackingRestore, setSatellitesParams, stopSatellitesTracking, trackSatelliteById } from './satellitesControl.js';
import { destroySatellitesLayer, disableSatellitesLayer, enableSatellitesLayer, getSatellitesStats, initSatellitesLayer } from './satellitesLifecycle.js';
import { findSatellitesByQuery, getSatellitesAllPositions, getSatellitesDetectableObjects, getSatellitesRowControls, getSatellitesTrackedInfo, setSatellitesRowControlsListener } from './satellitesQuery.js';
import { S } from './satellitesState.js';
import { _normalizeTrackedNorad } from './satellitesTracking.js';
import { updateSatellitesLayer } from './satellitesUpdate.js';

export { ISS_OVERLAY_SOURCE_ID, ISS_OVERLAY_SOURCE_OPTIONS } from './satellitesConstants.js';
export { satellitesNeedContinuousRender } from './satellitesDense.js';
export { createIssOverlayEntry, getNextIssPass } from './satellitesIss.js';
export { computeOrbitPath, getSatelliteOrbitTrack, orbitFrameModelMatrix, orbitalPeriodSeconds, parseTLE, propagatePosition } from './satellitesOrbit.js';
export { applySatellitePointFocusDeemphasis, satelliteCatalogModeChanged, satelliteVisualsVisible } from './satellitesStyle.js';
export { _addCoreCatalogEntryForTest, _applyPendingSatelliteTrackingRestoreForTest, _catalogGroupForTest, _clearDenseCatalogStateForTest, _clearSatelliteLabelLifecycleForTest, _forceNextPropagationForTest, _pendingSatelliteTrackingRestoreForTest, _removeSatelliteTrackingCandidateForTest, _runSatellitePreRenderForTest, _setCameraForTest, _setDenseCatalogStateForTest, _setSatelliteLabelLifecycleStateForTest, _setSatelliteTrackingRefreshOutcomeForTest, _setTrackedSatelliteRefreshStateForTest, _trackIssForTest, _trackedFrameCartesianForTest } from './satellitesTestHooks.js';

export { findSatelliteOrbitTrackInTle, orbitTrackFromRecord, scoreSatelliteNameMatch };

const satellitesLayer = {
  ...LAYER_METADATA.satellites,
  updateInterval: 0, // We use preRender for real-time updates, not interval polling
  refreshInterval: 5 * 60 * 1000, // Catalog data refresh; propagation remains preRender-owned.

  init: initSatellitesLayer,

  enable: enableSatellitesLayer,

  disable: disableSatellitesLayer,

  update: updateSatellitesLayer,

  destroy: destroySatellitesLayer,

  getDetectableObjects: getSatellitesDetectableObjects,

  /**
   * Find a satellite by exact NORAD id (numeric string) or case-insensitive
   * name substring. Position is freshly propagated via SGP4.
   * @param {string|number} query NORAD id or partial name.
   * @returns {{ noradId: number, name: string, position: Cesium.Cartesian3, latitude: number, longitude: number, altitudeM: number }|null}
   */
  findByQuery: findSatellitesByQuery,

  /**
   * Get positions of currently rendered satellites from per-point state
   * (no SGP4 re-propagation).
   * @param {number} [maxCount=300] Maximum entries to return.
   * @returns {Array<{ id: number, label: string, position: Cesium.Cartesian3, latitude: number, longitude: number, altitudeM: number }>}
   */
  getAllPositions: getSatellitesAllPositions,

  /**
   * Track a satellite by NORAD id (camera follow + orbit path + highlight),
   * same path as clicking its point.
   * @param {string|number} noradId NORAD catalog number.
   * @returns {boolean} True if tracking started.
   */
  trackById: trackSatelliteById,

  /**
   * Resolve a shared Follow target only after the applicable CelesTrak
   * catalog has settled. A partial catalog can prove presence, never absence.
   */
  async resolveTrackingRestoreTarget(noradId, {
    signal = null,
    origin = 'share-restore',
  } = {}) {
    if (signal?.aborted) return { status: 'cancelled', reason: String(signal.reason || 'aborted') };
    const id = _normalizeTrackedNorad(noradId);
    if (id === null) return { status: 'missing', reason: 'invalid-target' };
    const outcome = S._lastTrackingRefreshOutcome;
    const found = () => S._catalog.has(id) && S._points.has(id);
    const follow = () => {
      if (signal?.aborted) return { status: 'cancelled', reason: String(signal.reason || 'aborted') };
      return this.trackById(id, { origin })
        ? { status: 'found', refreshEpoch: outcome.epoch }
        : { status: 'source-unavailable', reason: 'target-not-renderable', refreshEpoch: outcome.epoch };
    };

    if (found()) return follow();
    if (outcome.status !== 'accepted' && outcome.status !== 'partial') {
      return {
        status: 'source-unavailable',
        reason: 'CelesTrak catalog unavailable',
        refreshEpoch: outcome.epoch,
      };
    }

    if (S._params.catalog === 'dense') {
      const dense = await (S._denseLoadPromise || Promise.resolve({ status: 'source-unavailable' }));
      if (signal?.aborted) return { status: 'cancelled', reason: String(signal.reason || 'aborted') };
      if (S._lastTrackingRefreshOutcome.epoch !== outcome.epoch) {
        return { status: 'superseded', reason: 'newer-catalog-refresh' };
      }
      if (found()) return follow();
      if (dense?.status !== 'ready') {
        return {
          status: 'source-unavailable',
          reason: dense?.reason || 'dense catalog unavailable',
          refreshEpoch: outcome.epoch,
        };
      }
    }

    if (outcome.status === 'partial') {
      return {
        status: 'source-unavailable',
        reason: 'partial CelesTrak catalog cannot prove absence',
        refreshEpoch: outcome.epoch,
        failedGroups: [...outcome.failedGroups],
      };
    }
    return {
      status: 'missing',
      reason: 'target-absent-from-catalog',
      refreshEpoch: outcome.epoch,
    };
  },

  /**
   * Stop tracking the currently tracked satellite (no-op if none).
   * @returns {boolean} Always true.
   */
  stopTracking: stopSatellitesTracking,

  cancelPendingTrackingRestore: cancelSatellitesPendingTrackingRestore,

  /**
   * Get info about the currently tracked satellite.
   * @returns {{ noradId: number, name: string, latitude: number, longitude: number, altitudeM: number }|null}
   */
  getTrackedInfo: getSatellitesTrackedInfo,

  /**
   * Runtime params (DataLayerManager.setLayerParams path).
   * catalog: 'core' (default, ~840 sats) | 'dense' (adds the Starlink shell
   * as points-only extras on a relaxed propagation budget).
   * @param {{ catalog?: 'core'|'dense', showPoints?: boolean, showOrbits?: boolean, selectedSatTrackingId?: number|null }} [params]
   */
  setParams: setSatellitesParams,

  /** @returns {{ catalog: string }} Current runtime params. */
  getParams() {
    return {
      catalog: S._params.catalog,
      showPoints: S._params.showPoints,
      showOrbits: S._params.showOrbits,
      selectedSatTrackingId: S._trackedNorad,
    };
  },

  /**
   * Layer-row sub-controls (DataLayerManager row-controls contract): the DENSE
   * catalog chip plus a class legend so the point colors are learnable without
   * a new panel.
   *
   * The chip is stateless — it declares the params to apply and the manager
   * owns the write, so the Space Missions snapshot/restore path (which drives
   * the same `catalog` param) stays the single source of truth and the chip
   * always renders whatever the layer actually has.
   *
   * The chip reports the dense LOAD state, not the catalog param: the param
   * flips synchronously while the Starlink shell takes seconds to arrive and
   * frequently 502s, so ACTIVE means "dense points are on screen" and nothing
   * less. The legend tally is cached against the catalog revision.
   * @returns {{ chips: Array<object>, legend: Array<object> }} Row controls.
   */
  getRowControls: getSatellitesRowControls,

  /**
   * Install the manager's "row controls changed" callback. The dense load is
   * asynchronous, so completion and failure have to push a re-render — nothing
   * else would repaint this row before the 5-minute catalog refresh.
   * @param {(() => void)|null} listener Callback, or null to detach.
   */
  setRowControlsListener: setSatellitesRowControlsListener,

  getStats: getSatellitesStats,
};

export default satellitesLayer;
