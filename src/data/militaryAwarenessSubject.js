// Moved out of militaryAwareness.js (militaryAwarenessSubject).

import { awarenessRefreshRequired, awarenessResultsAreLive, historySubjectSnapshot, isFlightLayer } from './militaryAwarenessPredicates.js';
import * as Cesium from 'cesium';
import flightsLayer from './flights.js';
import militaryFlightsLayer from './militaryFlights.js';
import aisLiveVesselsLayer from './aisLiveVessels.js';
import { cameraPoseSignature } from './iconOrientation.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { AWARENESS_PAGE_SIZE, SUBJECT_PRESENCE, state } from './militaryAwarenessConstants.js';
import { historySourceItem, subjectKey } from './militaryAwarenessNavigation.js';
import { clearVisual, renderVisual, scheduleDirectionOverlayUpdate } from './militaryAwarenessOverlay.js';
import { hidePanel, renderResults, startAwarenessPageRotation, stopAwarenessPageRotation } from './militaryAwarenessPanel.js';
import { collectSourceStates, evaluateSubject, sourceRevision } from './militaryAwarenessSources.js';

export function selectSubject(subject) {
  if (!state.enabled || !subject?.position) return;
  startAwarenessPageRotation();
  const key = subjectKey(subject);
  state.navigationVisited.add(key);
  const suppressHistory = state.suppressedHistoryKey === key;
  state.pendingSelectionKey = null;
  state.suppressedHistoryKey = null;
  if (!suppressHistory) {
    const current = state.navigationHistory[state.navigationIndex];
    if (subjectKey(current) !== key) {
      state.navigationHistory.splice(state.navigationIndex + 1);
      state.navigationHistory.push({
        ...historySubjectSnapshot(subject, historySourceItem(subject)),
        position: Cesium.Cartesian3.clone(subject.position),
      });
      state.navigationIndex = state.navigationHistory.length - 1;
    }
  }
  state.subject = subject;
  // A newly chosen contact starts present; the next refresh re-decides.
  state.subjectMissing = false;
  refreshSelectedSubject(true);
}

/**
 * Resolve the currently displayed position for a selected live subject. Flight
 * tracking owns the motion callback, so awareness consumes its cached display
 * position instead of creating a second tracker or extrapolation path.
 * @param {{layerId: string, id: string, position: Cesium.Cartesian3}} subject Current subject.
 * @param {object} [options] Position materialization controls.
 * @param {boolean} [options.allowCollectionMaterialization=true] Whether a layer-wide fallback may run.
 * @returns {Cesium.Cartesian3|null} A cloned live position when one is available.
 */
function resolveSubjectPosition(subject, { allowCollectionMaterialization = true } = {}) {
  if (!subject?.position) return null;
  if (subject.layerId === 'flights' || subject.layerId === 'military') {
    const trackedPosition = state.viewer?.trackedEntity?.gevDisplayPosition?.();
    if (trackedPosition) {
      return {
        position: Cesium.Cartesian3.clone(trackedPosition),
        // Only the follow camera's own contact proves presence this way; a
        // different tracked entity says nothing about this subject.
        presence: String(state.viewer?.trackedEntity?.gevTrackedId || '') === subjectKey(subject)
          ? SUBJECT_PRESENCE.LIVE
          : SUBJECT_PRESENCE.UNCHECKED,
      };
    }
    // Cockpit already materializes its tracked position on a fixed 20 Hz loop.
    // If that frame-owned cache is temporarily unavailable, keep the last
    // awareness position instead of allocating/scanning up to 1,000 contacts.
    if (!allowCollectionMaterialization) {
      return { position: Cesium.Cartesian3.clone(subject.position), presence: SUBJECT_PRESENCE.UNCHECKED };
    }
    const layer = subject.layerId === 'flights' ? flightsLayer : militaryFlightsLayer;
    return collectionSubjectPosition(subject, layer.getAllPositions(1000), layer);
  }
  if (subject.layerId === 'ais-live-vessels') {
    if (!allowCollectionMaterialization) {
      return { position: Cesium.Cartesian3.clone(subject.position), presence: SUBJECT_PRESENCE.UNCHECKED };
    }
    return collectionSubjectPosition(
      subject,
      aisLiveVesselsLayer.getAllPositions(12000),
      aisLiveVesselsLayer,
    );
  }
  // Mapped installations come from static geometry, not a live feed: there is
  // nothing to be culled from.
  return { position: Cesium.Cartesian3.clone(subject.position), presence: SUBJECT_PRESENCE.LIVE };
}

/**
 * Locate a subject inside its layer's live collection, keeping the last known
 * position when it is gone.
 *
 * Presence comes from the layer's O(1) `hasContact`, never from the rows:
 * `getAllPositions` stops at its cap and the flights layer routinely carries
 * ~11k contacts against a 1,000-row cap, so "not in the rows" is not "gone".
 * The rows are only consulted for a fresher position — a contact past the cap
 * keeps its last known position while still reading as present.
 * @param {{id: string, position: Cesium.Cartesian3}} subject Current subject.
 * @param {Array<{id: string, position: Cesium.Cartesian3}>} rows Live collection rows.
 * @param {{hasContact?: function}} layer The owning source layer.
 * @returns {{position: Cesium.Cartesian3, presence: string}} Position plus presence verdict.
 */
function collectionSubjectPosition(subject, rows, layer) {
  const collection = Array.isArray(rows) ? rows : [];
  const current = collection.find((item) => String(item.id) === String(subject.id));
  // null/undefined means the layer cannot answer (disabled or not yet loaded).
  const known = layer?.hasContact?.(subject.id);
  const presence = known === true
    ? SUBJECT_PRESENCE.LIVE
    : (known === false ? SUBJECT_PRESENCE.MISSING : SUBJECT_PRESENCE.UNCHECKED);
  return {
    position: current?.position
      ? Cesium.Cartesian3.clone(current.position)
      : Cesium.Cartesian3.clone(subject.position),
    presence,
  };
}

/**
 * Re-resolve a live subject's DISPLAY label from the layer that owns it.
 *
 * The subject snapshot is captured once at selection time, but a contact's
 * label INPUTS can arrive later: adsbdb enrichment supplies a registration
 * seconds after a callsign-less aircraft is selected, so every other surface
 * swapped `ae1fa4` → `N123AB` while the cached Context subject kept the hex.
 * The owning layer's tracked-subject accessor already applies the layer's
 * label convention (callsign → registration → icao24), so ask it rather than
 * re-deriving the chain here.
 *
 * Identity (`subject.id`) is NEVER re-derived — only the rendered string.
 * @param {{layerId: string, id: string, label: string}} subject Current subject.
 * @returns {string} The current label, or the cached one when the owning layer
 *   has no tracked subject (e.g. a cross-layer handoff is in flight).
 */
function resolveSubjectLabel(subject) {
  if (!isFlightLayer(subject?.layerId)) return subject?.label;
  const layer = subject.layerId === 'flights' ? flightsLayer : militaryFlightsLayer;
  const tracked = layer.getTrackedSubject?.();
  if (tracked?.label && String(tracked.id) === String(subject.id)) return tracked.label;
  return subject.label;
}

/** Refresh proximity counts/distances against the subject's current live position. */
export function refreshSelectedSubject(force = false) {
  if (!state.enabled || !state.subject) return;
  const sources = collectSourceStates();
  const nextSourceRevision = sourceRevision(sources);
  const sourceRevisionChanged = nextSourceRevision !== state.sourceRevision;
  const resolved = resolveSubjectPosition(state.subject, {
    allowCollectionMaterialization: !document.body?.classList?.contains('cockpit-mode') || sourceRevisionChanged,
  });
  if (!resolved) return;
  const { position, presence } = resolved;
  // UNCHECKED leaves the verdict alone: this tick simply did not look.
  if (presence === SUBJECT_PRESENCE.LIVE) state.subjectMissing = false;
  else if (presence === SUBJECT_PRESENCE.MISSING) state.subjectMissing = true;
  const nextLabel = resolveSubjectLabel(state.subject);
  const labelChanged = nextLabel !== state.subject.label;
  state.subject = { ...state.subject, position, label: nextLabel };
  const movementM = state.lastEvaluatedPosition
    ? Cesium.Cartesian3.distance(state.lastEvaluatedPosition, position)
    : Infinity;
  if (!awarenessRefreshRequired({
    force,
    hasResults: Boolean(state.results),
    movementM,
    sourceRevisionChanged,
  })) {
    state.results.subject = state.subject;
    renderVisual(state.subject);
    // The panel markup embeds `subject.label`, so a label that changed while
    // the contact was stationary (async enrichment answering after selection)
    // is render-worthy ON ITS OWN. Without this the standalone Context panel
    // kept the ICAO hex until unrelated movement, a source-revision bump, or
    // page rotation happened to repaint it. Gated on an ACTUAL change so the
    // common no-op refresh (every 750 ms) still costs no repaint.
    if (labelChanged) renderResults();
    scheduleDirectionOverlayUpdate(force);
    return;
  }
  state.results = evaluateSubject(state.subject, sources);
  state.sourceRevision = nextSourceRevision;
  state.lastEvaluatedPosition = Cesium.Cartesian3.clone(position, state.lastEvaluatedPosition);
  for (const cohort of state.results.cohorts) {
    const maxPage = Math.max(0, Math.floor(Math.max(0, cohort.summary.nearest.length - 1) / AWARENESS_PAGE_SIZE) * AWARENESS_PAGE_SIZE);
    state.cohortPages.set(cohort.id, Math.min(state.cohortPages.get(cohort.id) || 0, maxPage));
  }
  renderVisual(state.subject);
  renderResults();
  scheduleDirectionOverlayUpdate(force);
}

export function subjectFromContext(record) {
  if (!record || !['ais-live-vessels', 'military-installations'].includes(record.layerId)) return null;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    layerId: record.layerId,
    id: record.properties?.mmsi || record.id,
    label: record.label || record.id,
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
  };
}

/**
 * Record that the current subject left its feed on its own.
 *
 * The subject, its cohort results and its navigation history all survive: the
 * Contact panel keeps rendering them behind a CONTACT LOST cue, and PREVIOUS /
 * NEXT stay operable so the operator can step off. Nulling the subject here
 * instead would take the panel — and those controls — off screen.
 */
export function markSubjectEvicted() {
  if (!state.subject) return;
  state.subjectMissing = true;
}

export function clearAwarenessSubject() {
  state.autoFocusRetryPending = false;
  state.subject = null;
  state.subjectMissing = false;
  state.results = null;
  state.navigationHistory = [];
  state.navigationVisited.clear();
  state.navigationIndex = -1;
  state.suppressedHistoryKey = null;
  state.pendingSelectionKey = null;
  state.lastEvaluatedPosition = null;
  state.sourceRevision = '';
  state.cohortPages.clear();
  stopAwarenessPageRotation();
  clearVisual();
  hidePanel();
}

/**
 * Quantized camera-pose signature, or '' when the camera cannot report a full
 * pose yet. An unknown pose reads as PARKED, so a camera that is still coming
 * up can never be mistaken for continuous movement.
 * @param {Cesium.Camera|null|undefined} camera
 * @returns {string}
 */
export function cameraMotionSignature(camera) {
  if (!camera?.positionWC || !Number.isFinite(camera.heading)) return '';
  return cameraPoseSignature(camera);
}

/**
 * Whether Contacts genuinely has per-frame work right now.
 *
 * The direction arrows are screen-projected against the camera basis, so they
 * must be redrawn every frame while the view MOVES. Parked, or with no live
 * cohort to point at — nothing selected, every feed empty, every feed failed —
 * there is nothing to animate and Contacts must not be the reason the whole
 * scene keeps repainting.
 * @param {object} [snapshot] Explicit state, for tests.
 * @returns {boolean}
 */
export function awarenessNeedsContinuousRender({
  cameraMoving = state.cameraMoving,
  hasSubject = Boolean(state.subject),
  hasLiveResults = awarenessResultsAreLive(state.results),
} = {}) {
  return Boolean(cameraMoving && hasSubject && hasLiveResults);
}

/**
 * Take or drop the continuous-render hold to match the current need. Idempotent
 * (the governor is identity-keyed), and self-healing: the release decision is
 * made on a frame the hold itself guaranteed, so a hold can never strand the
 * scene in continuous mode.
 * @returns {void}
 */
export function syncAwarenessRenderHold() {
  if (state.enabled && awarenessNeedsContinuousRender()) holdContinuousRender('military-awareness');
  else releaseContinuousRender('military-awareness');
}
