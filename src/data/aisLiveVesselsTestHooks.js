// Moved out of aisLiveVessels.js (aisLiveVesselsTestHooks).

import aisLiveVesselsLayer from './aisLiveVessels.js';
import { DEFAULT_AIS_RUNTIME, DEFAULT_VESSEL_OVERLAY_HOST, state } from './aisLiveVesselsConstants.js';
import { bindVesselInteraction } from './aisLiveVesselsInteraction.js';
import { reconcileVessels } from './aisLiveVesselsRecords.js';
import { resetState } from './aisLiveVesselsReset.js';
import { applyAisFeedSnapshot, beginAisSession, clearFirstConnectTimer, loadLivePositions } from './aisLiveVesselsSession.js';
import { S } from './aisLiveVesselsState.js';
import { updateClusteredLabels } from './aisLiveVesselsVisibility.js';

/**
 * Bind the production interaction callbacks to mockable viewer/handler
 * surfaces. Test-only seam; behavior is shared with installInteraction().
 * @param {Object} viewer - Viewer-like object with scene.pick().
 * @param {Object} handler - Handler-like object with setInputAction().
 * @param {Object} keyTarget - EventTarget-like object with add/removeEventListener().
 * @returns {void}
 */
export function _bindVesselInteractionForTest(viewer, handler, keyTarget) {
  bindVesselInteraction(viewer, handler, keyTarget);
}

/**
 * Prime the minimum live state needed by interaction/lifecycle wire tests.
 * @param {Object} [options={}] - Test state values.
 * @returns {void}
 */
export function _setVesselStateForTest(options = {}) {
  resetState();
  const records = Array.isArray(options.records) ? options.records : [];
  state.viewer = options.viewer || null;
  state.enabled = options.enabled !== false;
  state.loaded = options.loaded === true;
  state.loading = options.loading === true;
  state.stale = options.stale === true;
  state.error = options.error || null;
  state.lastUpdate = options.lastUpdate ?? null;
  state.vesselRecords = records;
  state.count = records.length;
  state.vesselMap = new Map(
    records.filter((record) => record?.mmsi).map((record) => [record.mmsi, record])
  );
  state.selectedRecord = options.selectedRecord || null;
  state.billboardCollection = options.billboardCollection || { remove() {} };
  state.trail = options.trail || null;
  state.trailMmsi = options.trailMmsi || null;
  state.trailPositions = Array.isArray(options.trailPositions) ? [...options.trailPositions] : [];
  state.transportStatus = options.transportStatus || null;
  state.lastMessageAt = options.lastMessageAt ?? null;
  state.rawRowCount = Number.isFinite(options.rawRowCount) ? options.rawRowCount : 0;
  state.acceptedRowCount = Number.isFinite(options.acceptedRowCount) ? options.acceptedRowCount : records.length;
  state.firstConnectPhase = options.firstConnectPhase || 'idle';
  state.firstConnectStartedAt = options.firstConnectStartedAt ?? null;
  state.firstConnectDeadline = options.firstConnectDeadline ?? null;
  state.interactionHandlerFactory = options.interactionHandlerFactory || null;
  state.interactionKeyTarget = options.interactionKeyTarget || null;
}

/** Inject a host recorder for lifecycle/contract tests; null restores production. */
export function _setVesselOverlayHostForTest(host = null) {
  S._vesselOverlayHost = host || DEFAULT_VESSEL_OVERLAY_HOST;
}

/** Exercise the production selector/publisher through a test-owned state. */
export function _updateVesselCardsForTest(records = []) {
  updateClusteredLabels(records);
}

/**
 * Reconcile AIS rows through the production lifecycle. Test-only seam.
 * @param {Object} viewer - Viewer-like object.
 * @param {Array<Object>} rows - Raw AIS rows.
 * @returns {void}
 */
export function _reconcileVesselsForTest(viewer, rows) {
  reconcileVessels(viewer, rows);
}

/** Apply one server snapshot through the production pre-reconcile health gate. */
export function _applyAisFeedSnapshotForTest(viewer, payload) {
  return applyAisFeedSnapshot(viewer, payload);
}

/** Exercise the request-owned live loader with a test-controlled fetch. */
export function _loadLivePositionsForTest(viewer) {
  return loadLivePositions(viewer);
}

/** Start the production first-connect grace state without installing UI. */
export function _beginAisSessionForTest() {
  beginAisSession();
}

/** Inject a deterministic clock/scheduler; null restores production runtime. */
export function _setAisRuntimeForTest(runtime = null) {
  clearFirstConnectTimer();
  S._aisRuntime = runtime
    ? {
      now: runtime.now,
      setTimeout: runtime.setTimeout,
      clearTimeout: runtime.clearTimeout,
    }
    : DEFAULT_AIS_RUNTIME;
}

/** Read feed-health fields without exposing mutable production state. */
export function _getVesselFeedStateForTest() {
  const stats = aisLiveVesselsLayer.getStats();
  return {
    count: state.count,
    loaded: state.loaded,
    loading: stats.loading,
    loadingLabel: stats.loadingLabel,
    stale: state.stale,
    error: state.error,
    status: stats.status,
    lastUpdate: state.lastUpdate,
    transportStatus: state.transportStatus,
    lastMessageAt: state.lastMessageAt,
    rawRowCount: state.rawRowCount,
    acceptedRowCount: state.acceptedRowCount,
    selectedMmsi: state.selectedRecord?.mmsi || null,
    trailMmsi: state.trailMmsi,
    trailPositionCount: state.trailPositions.length,
    sessionId: state.sessionId,
    firstConnectPhase: state.firstConnectPhase,
    firstConnectStartedAt: state.firstConnectStartedAt,
    firstConnectDeadline: state.firstConnectDeadline,
  };
}

/**
 * Read lifecycle ownership state without exposing the mutable state object.
 * Test-only seam.
 * @returns {{trailMmsi: string|null, trailPositionCount: number, vesselCount: number}}
 */
export function _getVesselStateForTest() {
  return {
    trailMmsi: state.trailMmsi,
    trailPositionCount: state.trailPositions.length,
    vesselCount: state.vesselMap.size,
  };
}
