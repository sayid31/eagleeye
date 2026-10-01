// Moved out of radio.js (radioSelectors).

import { filterRadioStations, radioViewIsGlobal, rankRadioStationsForViewport } from './radioTunerMath.js';
import * as Cesium from 'cesium';
import { radioPresentationAllowed } from './radioOverlay.js';
import { S, _listeners, _playbackControlListeners } from './radioState.js';

export function resetRadioClusterOverlayIdentities() {
  S._clusterOverlayIdentities = [];
}

export function selectedStation() {
  return S._selectedId ? S._stationById.get(S._selectedId) || null : null;
}

export function selectedPresentationStation() {
  if (S._tuningActive) return tuningResolutionStation(S._tuningPreviewId);
  return S._cancelledTuningPresentationStation || selectedStation();
}

export function visibleStations() {
  return filterRadioStations(S._stations, S._filter);
}

export function viewportRadioAnchor() {
  const camera = S._viewer?.camera;
  const scene = S._viewer?.scene;
  if (!camera) return null;
  const altitudeM = Number(camera.positionCartographic?.height);
  let cartographic = null;
  const canvas = scene?.canvas;
  if (canvas && typeof camera.pickEllipsoid === 'function') {
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const position = camera.pickEllipsoid(center, scene.globe?.ellipsoid || Cesium.Ellipsoid.WGS84);
    if (position) cartographic = Cesium.Cartographic.fromCartesian(position);
  }
  cartographic ||= camera.positionCartographic || null;
  if (!cartographic) return null;
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: Cesium.Math.toDegrees(cartographic.longitude),
    altitudeM,
    globalView: radioViewIsGlobal(altitudeM),
  };
}

export function rankedVisibleStations() {
  const anchor = viewportRadioAnchor();
  return rankRadioStationsForViewport(visibleStations(), anchor, {
    preferEnglish: Boolean(anchor?.globalView),
  });
}

export function captureRadioTuningResolutionSnapshot() {
  return S._acceptedCatalogSnapshot;
}

export function tuningResolutionStation(id) {
  return id ? S._tuningStationById.get(String(id)) || null : null;
}

/** Return an immutable snapshot consumed by the right-rail UI. */
export function getRadioUIState() {
  const visible = visibleStations();
  const selected = selectedStation();
  return Object.freeze({
    enabled: S._enabled,
    loading: S._loading,
    stale: S._stale,
    degraded: S._degraded,
    error: S._error,
    updatedAt: S._updatedAt,
    filter: S._filter,
    categories: S._categories,
    acceptedCatalogGeneration: S._acceptedCatalogSnapshot.generation,
    presentationActive: radioPresentationAllowed(),
    stationCount: S._stations.length,
    filteredCount: visible.length,
    selected,
    selectedIndex: selected ? visible.findIndex((station) => station.id === selected.id) : -1,
    audioState: S._audioState,
    audioError: S._audioError,
    playingStationId: S._audioStationId,
    volume: S._userVolume,
    effectiveVolume: S._audio?.volume ?? (S._voiceDucked ? 0 : S._userVolume),
    voiceDucked: S._voiceDucked,
    voiceRestoring: S._voiceRestoring,
    tuningActive: S._tuningActive,
    tuningStatic: S._tuningStatic,
    tuningAwaitingStationId: S._tuningAwaitingStationId,
    tuningPreviewStationId: S._tuningPreviewId,
    tuningRestoredStationId: S._cancelledTuningPresentationStation?.id || null,
    tuningCatalogGeneration: S._tuningResolutionSnapshot.generation,
    tuningUnavailableStationId: S._tuningUnavailableStationId,
  });
}

export function emitState() {
  const snapshot = getRadioUIState();
  for (const listener of _listeners) {
    try {
      listener(snapshot);
    } catch {
      // A broken consumer must not break playback or rendering.
    }
  }
}

/** Subscribe to radio state; the current state is delivered immediately. */
export function subscribeToRadio(listener) {
  if (typeof listener !== 'function') return () => {};
  _listeners.add(listener);
  listener(getRadioUIState());
  return () => _listeners.delete(listener);
}

/** Subscribe to explicit playback controls so voice handoffs cannot undo them. */
export function subscribeToRadioPlaybackControls(listener) {
  if (typeof listener !== 'function') return () => {};
  _playbackControlListeners.add(listener);
  return () => _playbackControlListeners.delete(listener);
}

export function emitPlaybackControl(action, origin, attemptId = S._activePlaybackAttempt?.id || null) {
  const event = { action, origin, attemptId };
  for (const listener of _playbackControlListeners) {
    try {
      listener(event);
    } catch {
      // Playback controls must remain usable if an observer fails.
    }
  }
}
