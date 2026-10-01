import { classifyAisFeedSnapshot, deriveAisFeedError } from './aisFeedClassify.js';
import { mapAnalystRecord, reduceVesselSelection, vesselDatumHeightM } from './aisVesselRecords.js';
import { buildSelectedVesselCard, buildVesselCard, cardScreenSeparated } from './aisVesselCards.js';
import { LAYER_METADATA } from './layerMetadata.js';
import { FOCUS_EVIDENCE_DEV, REFRESH_MS } from './aisLiveVesselsConstants.js';
import { destroyAisLayer, disableAisLayer, enableAisLayer, getAisStats, initAisLayer, updateAisLayer } from './aisLiveVesselsLifecycle.js';
import { aisHasContact, clearAisSelection, findAisByQuery, getAisAllPositions, getAisAnalystRecords, getAisDetectableObjects, getAisNearby, getAisSelectedInfo, selectAisById } from './aisLiveVesselsQuery.js';
import { _focusEvidenceVesselSnapshot, _setFocusEvidenceVessels } from './aisLiveVesselsReset.js';

export { AIS_FIRST_CONNECT_GRACE_MS } from './aisLiveVesselsConstants.js';
export { _applyAisFeedSnapshotForTest, _beginAisSessionForTest, _bindVesselInteractionForTest, _getVesselFeedStateForTest, _getVesselStateForTest, _loadLivePositionsForTest, _reconcileVesselsForTest, _setAisRuntimeForTest, _setVesselOverlayHostForTest, _setVesselStateForTest, _updateVesselCardsForTest } from './aisLiveVesselsTestHooks.js';
export { aisNeedsContinuousRender, applyVesselFocusDeemphasis } from './aisLiveVesselsVisibility.js';

// Re-exported for this module's own test suite and any external caller that
// still imports these from aisLiveVessels.js rather than their new home.
export {
  deriveAisFeedError,
  classifyAisFeedSnapshot,
  mapAnalystRecord,
  vesselDatumHeightM,
  reduceVesselSelection,
  buildVesselCard,
  buildSelectedVesselCard,
  cardScreenSeparated,
};

const aisLiveVesselsLayer = {
  ...LAYER_METADATA['ais-live-vessels'],
  updateInterval: REFRESH_MS,
  statsRefreshInterval: 1000,

  init: initAisLayer,

  enable: enableAisLayer,

  disable: disableAisLayer,

  update: updateAisLayer,

  destroy: destroyAisLayer,

  /**
   * Find a vessel by exact MMSI or case-insensitive name substring.
   * @param {string|number} query MMSI or partial vessel name.
   * @returns {{ mmsi: string, name: string, position: Cesium.Cartesian3, latitude: number, longitude: number, speedKt: number|null, course: number|null, type: string }|null}
   */
  findByQuery: findAisByQuery,

  /**
   * Get vessels within a range of a point, sorted nearest-first.
   * @param {Cesium.Cartesian3} centerCartesian Center of the search.
   * @param {number} rangeM Max distance in meters (non-finite = unbounded).
   * @param {number} [maxCount=25] Maximum entries to return.
   * @returns {Array<{ mmsi: string, name: string, position: Cesium.Cartesian3, distanceM: number }>}
   */
  getNearby: getAisNearby,

  /**
   * Get positions of all currently loaded vessels.
   * @param {number} [maxCount=800] Maximum entries to return.
   * @returns {Array<{ id: string, label: string, position: Cesium.Cartesian3, latitude: number, longitude: number }>}
   */
  /**
   * Whether this layer still carries a vessel, in O(1).
   *
   * Mirror of `flights.hasContact`: presence consumers must not infer absence
   * from the capped `getAllPositions` rows. `vesselMap` is MMSI-keyed.
   * A disabled layer keeps its records, so it must decline rather than answer
   * from data the user can no longer see.
   * @param {string} mmsi Vessel identifier.
   * @returns {boolean|null} Presence, or null when the layer is disabled or
   *   holds no data and therefore cannot answer.
   */
  hasContact: aisHasContact,

  getAllPositions: getAisAllPositions,

  /**
   * Snapshot the layer's in-memory vessel records as plain JSON-safe
   * objects for the analyst query engine. On-demand only (called at most
   * once per spoken query) — zero per-frame cost, no listeners, no caching.
   * Returns [] while the layer is disabled or empty.
   * @param {number} [maxCount=2000] - Maximum records to return (truncation).
   * @returns {Array<Object>} See mapAnalystRecord for the record shape.
   */
  getAnalystRecords: getAisAnalystRecords,

  /**
   * Select a vessel by MMSI via the same path as a map click
   * (highlight + HUD update).
   * @param {string|number} mmsi Vessel MMSI.
   * @returns {boolean} True if a matching vessel was selected.
   */
  selectById: selectAisById,

  /**
   * Clear the current vessel selection and reset the HUD readout.
   * @returns {boolean} Always true.
   */
  clearSelection: clearAisSelection,

  /**
   * Get info about the currently selected vessel.
   * @returns {{ mmsi: string, name: string, latitude: number, longitude: number, speedKt: number|null, course: number|null, type: string }|null}
   */
  getSelectedInfo: getAisSelectedInfo,

  /**
   * Return a subset of vessels for the universal detection overlay.
   * Deterministic stride sampling distributes selections evenly across the
   * current record list while honoring the overlay's per-layer budget.
   * @param {Object} [options={}] - Options from the detection system.
   * @param {number} [options.maxCount] - Maximum objects to return (defaults to all).
   * @param {number} [options.seed] - Seed offset for stride sampling.
   * @returns {Array<{position: Cesium.Cartesian3, id: string, type: string, skipLabel: boolean}>}
   */
  getDetectableObjects: getAisDetectableObjects,

  ...(FOCUS_EVIDENCE_DEV ? {
    __focusEvidence: Object.freeze({
      setVessels: _setFocusEvidenceVessels,
      snapshot: _focusEvidenceVesselSnapshot,
    }),
  } : {}),

  getStats: getAisStats,
};

export default aisLiveVesselsLayer;
