// Moved out of radio.js (radioTuning).

import { buildRadioTunerBand, radioStationResolutionMatches } from './radioTunerMath.js';
import { clearRadioTuningNoise, installTuningNoise, syncTuningNoiseGain } from './radioAudio.js';
import { beginRadioCameraNavigation, invalidateRadioCameraNavigation, radioCameraState, rotateRadioStationIntoView } from './radioCamera.js';
import { EMPTY_ACCEPTED_CATALOG_SNAPSHOT, RADIO_TUNER_STATION_LIMIT } from './radioConstants.js';
import { radioPresentationAllowed } from './radioOverlay.js';
import { pauseRadioPlayback } from './radioPlayback.js';
import { selectRadioStation, updateSelectionEntity } from './radioSelection.js';
import { captureRadioTuningResolutionSnapshot, emitState, selectedStation, tuningResolutionStation, visibleStations } from './radioSelectors.js';
import { S } from './radioState.js';

/** Return the complete accepted filtered directory in stable catalog order. */
export function getRadioTunerStations(limit = RADIO_TUNER_STATION_LIMIT) {
  if (!radioPresentationAllowed() || !S._acceptedCatalogSnapshot.stations.length) return [];
  return buildRadioTunerBand(visibleStations(), selectedStation(), limit);
}

/** Begin a direct-manipulation tuning gesture and pause the current stream. */
export function beginRadioTuning() {
  if (!radioPresentationAllowed() || !visibleStations().length) return false;
  const snapshot = captureRadioTuningResolutionSnapshot();
  if (!Number.isSafeInteger(snapshot.generation) || !snapshot.stations.length) return false;
  S._tuningResolutionSnapshot = snapshot;
  S._tuningStationById = new Map(
    S._tuningResolutionSnapshot.stations.map((station) => [station.id, station]),
  );
  S._tuningUnavailableStationId = null;
  S._tuningActive = true;
  S._tuningStatic = false;
  S._tuningAwaitingStationId = null;
  S._cancelledTuningPresentationStation = null;
  S._tuningStartStationId = S._selectedId;
  S._tuningPreviewId = S._selectedId;
  installTuningNoise();
  pauseRadioPlayback({ origin: 'user' });
  syncTuningNoiseGain();
  emitState();
  return true;
}

/** Toggle low-volume synthesized static for tuner preview and stream handoff. */
export function setRadioTuningStatic(active) {
  if (!radioPresentationAllowed() || !S._tuningActive) return false;
  const next = Boolean(active);
  if (next === S._tuningStatic) return true;
  S._tuningStatic = next;
  syncTuningNoiseGain();
  emitState();
  return true;
}

/** Preview a tuner station bracket and camera orientation without starting audio. */
export function previewRadioTuningStation(id, { rotate = true } = {}) {
  if (!radioPresentationAllowed() || !S._tuningActive) return false;
  const station = tuningResolutionStation(id);
  const nextId = station?.id || null;
  const changed = nextId !== S._tuningPreviewId;
  S._tuningPreviewId = nextId;
  S._tuningStatic = !station;
  if (changed) {
    updateSelectionEntity();
    if (station && rotate) {
      const cameraState = radioCameraState();
      S._tuningCameraNavigation = beginRadioCameraNavigation(cameraState);
      rotateRadioStationIntoView(station, 0.35, cameraState, S._tuningCameraNavigation);
    }
    else if (rotate) {
      S._tuningCameraNavigation = null;
      invalidateRadioCameraNavigation();
    }
  }
  syncTuningNoiseGain();
  emitState();
  return Boolean(station);
}

/** Finish a tuning gesture and release its synthesized noise source. */
export function endRadioTuning() {
  if (!S._tuningActive && !S._tuningStatic && !S._tuningAwaitingStationId
      && !S._tuningNoiseSource && !S._cancelledTuningPresentationStation) return;
  clearRadioTuningNoise();
}

/** Cancel a tuning gesture and restore its frozen start marker for presentation only. */
export function cancelRadioTuning() {
  if (!S._tuningActive) return false;
  const restoredStation = tuningResolutionStation(S._tuningStartStationId);
  clearRadioTuningNoise({ restoredStation });
  return true;
}

/** Commit the exact frozen drag resolution or report that it is unavailable. */
export function commitRadioTuningStation(id, { origin = 'programmatic' } = {}) {
  const frozenStation = tuningResolutionStation(id);
  const currentStation = S._stationById.get(String(id)) || null;
  const generation = S._tuningResolutionSnapshot.generation;
  if (!radioPresentationAllowed() || !S._tuningActive || !frozenStation) {
    endRadioTuning();
    return Object.freeze({ ok: false, reason: 'not-tuning', stationId: String(id || ''), generation });
  }
  if (!radioStationResolutionMatches(frozenStation, currentStation)) {
    const stationId = frozenStation.id;
    // A failed exact release owns the visible outcome. Do not let the previous
    // selection—or changed metadata under the same ID—reappear between the
    // frozen preview and the unavailable state.
    S._selectedId = null;
    S._selectionGeneration += 1;
    clearRadioTuningNoise({ emit: false });
    S._tuningUnavailableStationId = stationId;
    emitState();
    return Object.freeze({ ok: false, reason: 'station-unavailable', stationId, generation });
  }
  S._tuningActive = false;
  S._tuningStatic = true;
  S._tuningAwaitingStationId = frozenStation.id;
  S._tuningPreviewId = null;
  S._tuningStartStationId = null;
  S._tuningUnavailableStationId = null;
  const cameraNavigation = S._tuningCameraNavigation;
  S._tuningCameraNavigation = null;
  S._tuningResolutionSnapshot = EMPTY_ACCEPTED_CATALOG_SNAPSHOT;
  S._tuningStationById = new Map();
  // An exact tuner release owns its frozen target. A fallback armed by an
  // earlier non-playing selection must never retarget this gesture if the
  // broadcaster fails after release.
  S._playFallbackId = null;
  S._playFallbackFocus = null;
  S._playFallbackOrigin = 'programmatic';
  S._playFallbackAttemptId = null;
  syncTuningNoiseGain();
  emitState();
  const selected = selectRadioStation(frozenStation.id, {
    autoplay: true,
    focus: false,
    origin,
    cameraNavigation,
  });
  return Object.freeze({
    ok: selected,
    reason: selected ? null : 'station-unavailable',
    stationId: frozenStation.id,
    generation,
  });
}

export function tryRadioFallback(
  failedId,
  origin = S._playFallbackOrigin || 'programmatic',
  attemptId = S._playFallbackAttemptId,
) {
  const fallbackId = S._playFallbackId;
  const fallbackStation = fallbackId ? S._stationById.get(fallbackId) : null;
  const fallbackFocusPolicy = S._playFallbackFocus;
  S._playFallbackId = null;
  S._playFallbackFocus = null;
  S._playFallbackOrigin = 'programmatic';
  S._playFallbackAttemptId = null;
  if (!fallbackStation || fallbackId === failedId || S._selectedId !== failedId) {
    return false;
  }
  const fallbackFocusResult = typeof fallbackFocusPolicy === 'function'
    ? fallbackFocusPolicy(fallbackStation)
    : fallbackFocusPolicy;
  const fallbackCameraNavigation = fallbackFocusResult
    && typeof fallbackFocusResult === 'object'
    ? fallbackFocusResult
    : null;
  const fallbackFocus = fallbackCameraNavigation ? false : Boolean(fallbackFocusResult);
  selectRadioStation(fallbackId, {
    autoplay: true,
    focus: fallbackFocus,
    origin: origin || 'programmatic',
    attemptId,
    cameraNavigation: fallbackCameraNavigation,
  });
  return true;
}

export function recordDirectoryClick(id) {
  fetch(`/api/radio/click/${encodeURIComponent(id)}`, { method: 'POST' }).catch(() => {});
}
