// Moved out of aisLiveVessels.js (aisLiveVesselsReset).

import * as Cesium from 'cesium';
import { FOCUS_EVIDENCE_DEV, state } from './aisLiveVesselsConstants.js';
import { clearVesselInspection } from './aisLiveVesselsInteraction.js';
import { reconcileVessels } from './aisLiveVesselsRecords.js';
import { clearFirstConnectTimer } from './aisLiveVesselsSession.js';
import { S } from './aisLiveVesselsState.js';

/** Replace live AIS rows through the production reconciliation path (DEV only). */
export function _setFocusEvidenceVessels(rows = []) {
  if (!FOCUS_EVIDENCE_DEV || !state.viewer || !state.billboardCollection) {
    return { ok: false, count: 0 };
  }
  clearVesselInspection();
  reconcileVessels(state.viewer, Array.isArray(rows) ? rows : []);
  state.count = state.vesselRecords.length;
  state.loaded = true;
  state.error = null;
  state.stale = false;
  state.lastUpdate = Date.now();
  state.transportStatus = 'synthetic';
  state.lastMessageAt = null;
  state.rawRowCount = Array.isArray(rows) ? rows.length : 0;
  state.acceptedRowCount = state.count;
  return { ok: true, count: state.count };
}

/** JSON-safe vessel alpha/position snapshot for the evidence report. */
export function _focusEvidenceVesselSnapshot() {
  if (!FOCUS_EVIDENCE_DEV || !state.viewer) return [];
  return state.vesselRecords.map((record) => {
    const bb = record.billboard;
    const screen = bb?.position
      ? Cesium.SceneTransforms.worldToWindowCoordinates(state.viewer.scene, bb.position)
      : null;
    return {
      id: record.mmsi,
      show: bb?.show === true,
      alpha: bb?.color?.alpha ?? null,
      x: screen?.x ?? null,
      y: screen?.y ?? null,
    };
  });
}

export function resetState() {
  clearFirstConnectTimer();
  state.viewer = null;
  state.enabled = false;
  state.loading = false;
  state.loaded = false;
  state.stale = false;
  state.error = null;
  state.loadingLabel = '';
  state.lastUpdate = null;
  state.count = 0;
  state.newestPositionAt = null;
  state.transportStatus = null;
  state.nextAttemptAt = null;
  state.lastMessageAt = null;
  state.rawRowCount = 0;
  state.acceptedRowCount = 0;
  state.sessionId = ++S._aisSessionSequence;
  state.firstConnectPhase = 'idle';
  state.firstConnectStartedAt = null;
  state.firstConnectDeadline = null;
  state.firstConnectTimer = null;
  state.abort = null;
  state.billboardCollection = null;
  state.vesselRecords = [];
  state.vesselMap = new Map();
  state.unkeyedRecords = [];
  state.clickHandler = null;
  state.keyTarget = null;
  state.keydownHandler = null;
  state.trackedEntityRemover = null;
  state.interactionHandlerFactory = null;
  state.interactionKeyTarget = null;
  state.preRenderRemover = null;
  state.lastVisibilityUpdate = 0;
  state.lastFocusUpdate = 0;
  state.activeFocusCount = 0;
  state.activeLabelCount = 0;
  state.selectedRecord = null;
  state.trail = null;
  state.trailPositions = [];
  state.trailMmsi = null;
  state.trailBackfillToken = 0;
}
