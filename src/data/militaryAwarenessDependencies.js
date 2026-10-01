// Moved out of militaryAwareness.js (militaryAwarenessDependencies).

import { awarenessRefreshDecision, contextTargetFlyToAllowed } from './militaryAwarenessPredicates.js';
import { releaseContinuousRender } from '../renderGovernor.js';
import flightsLayer from './flights.js';
import militaryFlightsLayer from './militaryFlights.js';
import * as Cesium from 'cesium';
import aisLiveVesselsLayer from './aisLiveVessels.js';
import { announceNavigationAuthority } from '../navigationPolicy.js';
import { AIRCRAFT_DEPENDENCIES, DEPENDENCIES, VESSEL_FOCUS_RADIUS_M, state } from './militaryAwarenessConstants.js';
import { currentTrackedFlightSubject } from './militaryAwarenessNavigation.js';
import { cancelDirectionOverlayUpdate, scheduleDirectionOverlayUpdate } from './militaryAwarenessOverlay.js';
import { cameraMotionSignature, refreshSelectedSubject, selectSubject, syncAwarenessRenderHold } from './militaryAwarenessSubject.js';

export function attachRuntimeListeners() {
  if (state.runtimeListenersAttached || !state.viewer) return;
  window.addEventListener('gev:awareness-subject-selected', state.subjectListener);
  window.addEventListener('gev:entity-selected', state.contextListener);
  window.addEventListener('gev:entity-selection-cleared', state.clearListener);
  window.addEventListener('gev:awareness-subject-cleared', state.subjectClearListener);
  state.preRenderRemover = state.viewer.scene.preRender.addEventListener(() => {
    if (!state.enabled) return;
    const now = Date.now();
    // "Did the camera move" uses the SAME quantized pose signature the fleet
    // rotation pass gates on (iconOrientation.cameraPoseSignature) rather than
    // camera.changed, whose granularity is globally degraded by other layers
    // mutating camera.percentageChanged.
    const poseSig = cameraMotionSignature(state.viewer.camera);
    if (poseSig !== state.lastCameraPoseSig) {
      state.lastCameraPoseSig = poseSig;
      state.lastCameraPoseChangeMs = now;
    }
    const decision = awarenessRefreshDecision({
      nowMs: now,
      lastRefreshMs: state.lastSubjectRefreshMs,
      lastPoseChangeMs: state.lastCameraPoseChangeMs,
      wasMoving: state.cameraMoving,
    });
    state.cameraMoving = decision.moving;
    syncAwarenessRenderHold();
    if (!decision.refresh) return;
    state.lastSubjectRefreshMs = now;
    if (state.subject && ['flights', 'military', 'ais-live-vessels'].includes(state.subject.layerId)) {
      refreshSelectedSubject();
    } else if (!state.passive && state.autoFocusRetryPending) {
      state.autoFocusRetryPending = false;
      focusAttentionTarget();
    } else {
      scheduleDirectionOverlayUpdate();
    }
  });
  state.runtimeListenersAttached = true;
}

export function detachRuntimeListeners() {
  if (state.runtimeListenersAttached) {
    window.removeEventListener('gev:awareness-subject-selected', state.subjectListener);
    window.removeEventListener('gev:entity-selected', state.contextListener);
    window.removeEventListener('gev:entity-selection-cleared', state.clearListener);
    window.removeEventListener('gev:awareness-subject-cleared', state.subjectClearListener);
  }
  state.preRenderRemover?.();
  state.preRenderRemover = null;
  state.lastCameraPoseSig = '';
  state.lastCameraPoseChangeMs = 0;
  state.cameraMoving = false;
  // No frames will arrive to run the per-frame release once the listener is
  // gone, so drop the hold here.
  releaseContinuousRender('military-awareness');
  cancelDirectionOverlayUpdate();
  state.runtimeListenersAttached = false;
}

/**
 * Release any aircraft-owned follow camera before a non-aircraft context
 * selection takes ownership. Both layers are safe no-ops when idle and release
 * Cesium tracking in place, so the subsequent vessel/site framing starts from
 * the current view without the previous aircraft continuing to drag it.
 */
export function releaseAircraftTracking() {
  flightsLayer.stopTracking?.();
  militaryFlightsLayer.stopTracking?.();
}

function refreshAfterDeferredDependency(activationId) {
  if (!state.enabled || state.passive || activationId !== state.activationId) return;
  if (state.subject) {
    refreshSelectedSubject(true);
    return;
  }
  if (state.autoFocusRetryPending) {
    state.autoFocusRetryPending = !focusAttentionTarget();
  }
}

async function enableDependencies(activationId = state.activationId) {
  const aircraftPending = [];
  for (const layerId of DEPENDENCIES) {
    if (!state.enabled) return;
    if (!state.dataManager) continue;
    const alreadyEnabled = state.dataManager.isEffectivelyEnabled?.(layerId)
      ?? state.dataManager.isEnabled(layerId);
    if (alreadyEnabled) continue;
    state.ownedDependencies.add(layerId);
    // Each layer serializes its own lifecycle internally. Start them together
    // so a slow or unavailable live feed cannot prevent the remaining context
    // sources from turning on.
    let pending;
    try {
      // Register the ON intent synchronously. If Contacts is turned OFF in the
      // same turn, DataLayerManager then sees OFF as the newest intent and a
      // stale deferred ON cannot resurrect a released dependency.
      // restoreThrottle bounds the actual lifecycle work via the SAME shared
      // cross-layer concurrency gate as page-load restore and Context-mode
      // isolation — so a Contacts entry racing an in-flight bulk restore
      // stays globally bounded (<=4 concurrent lifecycles across every
      // source), not just locally bounded to 4 within this loop alone.
      pending = Promise.resolve(state.dataManager.setEnabled(layerId, true, {
        restoreThrottle: (task) => state.dataManager.runThroughRestoreQueue(task),
      }));
    } catch (error) {
      pending = Promise.reject(error);
    }
    if (AIRCRAFT_DEPENDENCIES.includes(layerId)) {
      aircraftPending.push(pending);
    } else {
      // Vessels and mapped installations enrich an already usable aircraft
      // context. Their settlement must never hold the Contacts transaction or
      // Cockpit gate open, and the activation token prevents a late result
      // from repainting or refocusing a newer/closed session.
      pending.then(
        () => refreshAfterDeferredDependency(activationId),
        () => refreshAfterDeferredDependency(activationId),
      );
    }
  }
  await Promise.allSettled(aircraftPending);
}

export function releaseOwnedDependencies(releaseActivationId) {
  const owned = [...state.ownedDependencies];
  state.ownedDependencies.clear();
  if (!state.dataManager || !owned.length) return Promise.resolve();
  // Same shared cross-layer concurrency gate as enableDependencies() above.
  return Promise.allSettled(owned.map((layerId) => state.dataManager.setEnabled(layerId, false, {
    restoreThrottle: (task) => state.dataManager.runThroughRestoreQueue(task),
  })))
    .then(() => {
      if (state.enabled && state.activationId !== releaseActivationId) {
        return enableDependencies(state.activationId);
      }
      return null;
    });
}

export function activateOperationalContext() {
  const activationId = ++state.activationId;
  state.autoFocusRetryPending = false;
  const initialTrackedSubject = currentTrackedFlightSubject();
  if (initialTrackedSubject) selectSubject(initialTrackedSubject);
  return enableDependencies(activationId).then(() => {
    if (!state.enabled || state.passive || activationId !== state.activationId) return;
    const trackedSubject = currentTrackedFlightSubject();
    if (trackedSubject) {
      selectSubject(trackedSubject);
      return;
    }
    if (state.subject) {
      selectSubject(state.subject);
      return;
    }
    if (state.autoFocusAttempted) return;
    state.autoFocusRetryPending = !focusAttentionTarget();
  }).catch((error) => console.warn('[Global Context] dependency enable failed', error));
}

/**
 * Pick the observed candidate closest to the current view. This is intentionally
 * a navigation preference, not a risk, capability, or affiliation calculation.
 * @param {Array<{position: Cesium.Cartesian3}>} candidates Observed candidates.
 * @returns {Object|null} The best currently observable candidate.
 */
function closestToCurrentView(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const cameraPosition = state.viewer?.camera?.positionWC;
  if (!cameraPosition) return candidates.find((candidate) => candidate?.position) || null;

  let closest = null;
  let closestDistance = Infinity;
  for (const candidate of candidates) {
    if (!candidate?.position) continue;
    const distance = Cesium.Cartesian3.distance(cameraPosition, candidate.position);
    if (Number.isFinite(distance) && distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

/**
 * Focus a single observed, context-priority target after activation. Civilian
 * and military aircraft compete in one nearest-to-view pool; military is
 * concatenated first so exact distance ties resolve to military under the
 * strict comparison. An AIS vessel is only a fallback and is never inferred
 * to be military. There is deliberately no distance cap.
 * @returns {boolean} Whether a target was selected and framed.
 */
function focusAttentionTarget() {
  if (!state.enabled || state.subject || !state.viewer || state.autoFocusAttempted) return false;

  const nearestFlight = closestToCurrentView([
    ...militaryFlightsLayer.getAllPositions(800)
      .map((item) => ({ ...item, layerId: 'military' })),
    ...flightsLayer.getAllPositions(1000)
      .map((item) => ({ ...item, layerId: 'flights' })),
  ]);
  if (nearestFlight) {
    const layer = nearestFlight.layerId === 'military' ? militaryFlightsLayer : flightsLayer;
    if (layer.trackById(nearestFlight.id, { origin: 'programmatic' })) {
      state.autoFocusAttempted = true;
      return true;
    }
  }

  const vessel = closestToCurrentView(aisLiveVesselsLayer.getAllPositions(12000));
  if (!vessel || !aisLiveVesselsLayer.selectById(vessel.id)) return false;

  state.autoFocusAttempted = true;
  if (!contextTargetFlyToAllowed('ais-live-vessels')) return true;

  announceNavigationAuthority('context-vessel-autofocus', {
    cancelPendingSelection: false,
  });
  state.viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(vessel.position, VESSEL_FOCUS_RADIUS_M),
    { duration: 1.6 },
  );
  return true;
}
