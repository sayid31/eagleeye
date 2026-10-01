// Moved out of radio.js (radioPlayback).

import { clampRadioVolume, scheduleVolumeFrame, volumeClock } from './radioOverlayEntries.js';
import { normalizeRadioFilter } from './layerState.js';
import { cancelRadioVolumeTransition, clearRadioTuningNoise, installAudio, syncTuningNoiseGain } from './radioAudio.js';
import { RADIO_VOICE_PLAYBACK_TIMEOUT_MS, VOICE_RESTORE_DELAY_MS, VOICE_RESTORE_DURATION_MS } from './radioConstants.js';
import { radioPresentationAllowed, scheduleRadioOverlayPublish, updateRenderVisibility } from './radioOverlay.js';
import { selectRadioStation, updateSelectionEntity } from './radioSelection.js';
import { emitPlaybackControl, emitState, getRadioUIState, rankedVisibleStations, resetRadioClusterOverlayIdentities, selectedStation, subscribeToRadio } from './radioSelectors.js';
import { S } from './radioState.js';
import { endRadioTuning, recordDirectoryClick, tryRadioFallback } from './radioTuning.js';

/** Play the selected broadcaster stream after an explicit user action. */
export async function playSelectedRadio({ origin = 'programmatic', attemptId = null } = {}) {
  const station = selectedStation();
  if (!radioPresentationAllowed() || !station?.streamUrl) return false;
  if (S._tuningActive) endRadioTuning();
  // A media event carries no reliable attempt identity. Give every explicit
  // play/resume/replacement its own element so queued events from the retired
  // attempt remain bound to the discarded element and cannot mutate this one.
  installAudio({ replace: true });
  if (!S._audio) return false;

  const generation = ++S._playGeneration;
  const ownedAttemptId = attemptId || `radio-play-${++S._playAttemptSequence}`;
  S._activePlaybackAttempt = {
    id: ownedAttemptId,
    origin,
    stationId: station.id,
    streamUrl: station.streamUrl,
    generation,
  };
  if (S._playFallbackId) {
    S._playFallbackOrigin = origin;
    S._playFallbackAttemptId = ownedAttemptId;
  }
  S._audioError = null;
  S._audioState = 'loading';
  if (S._audioStationId !== station.id || S._audio.src !== station.streamUrl) {
    S._audio.pause();
    S._audio.src = station.streamUrl;
    S._audioStationId = station.id;
  }
  emitState();

  try {
    const playback = S._audio.play();
    if (playback?.then) await playback;
    if (
      generation !== S._playGeneration
      || S._audioStationId !== station.id
      || S._activePlaybackAttempt?.id !== ownedAttemptId
    ) return false;
    S._audioState = 'playing';
    if (S._tuningAwaitingStationId === station.id) clearRadioTuningNoise({ emit: false });
    S._playFallbackId = null;
    S._playFallbackFocus = null;
    S._playFallbackOrigin = 'programmatic';
    S._playFallbackAttemptId = null;
    recordDirectoryClick(station.id);
    emitState();
    if (origin === 'user') emitPlaybackControl('play', origin, ownedAttemptId);
    return true;
  } catch (error) {
    if (generation !== S._playGeneration || S._activePlaybackAttempt?.id !== ownedAttemptId) return false;
    if (tryRadioFallback(station.id, origin, ownedAttemptId)) return false;
    S._audioState = 'error';
    S._audioError = error?.name === 'NotAllowedError'
      ? 'Playback requires a direct click or tap.'
      : 'Broadcaster stream could not be started.';
    emitState();
    return false;
  }
}

/**
 * Wait for confirmed Radio playback while voice owns a hard mute.
 * A fallback station may replace the first stream during this wait, so the
 * state subscription—not the first play() promise—is authoritative.
 */
export function confirmRadioPlayback({
  startPlayback,
  subscribe,
  getState,
  timeoutMs = RADIO_VOICE_PLAYBACK_TIMEOUT_MS,
} = {}) {
  if (typeof startPlayback !== 'function' || typeof subscribe !== 'function' || typeof getState !== 'function') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    let unsubscribe = () => {};
    let timer = null;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      resolve(Boolean(ok));
    };
    const inspect = (state) => {
      if (!started || !state) return;
      if (!state.voiceDucked && ['loading', 'buffering', 'playing'].includes(state.audioState)) {
        finish(false);
        return;
      }
      if (state.audioState === 'playing' && state.playingStationId && state.voiceDucked) {
        finish(true);
      } else if (state.audioState === 'error') {
        finish(false);
      }
    };
    unsubscribe = subscribe(inspect);
    started = true;
    timer = setTimeout(() => finish(false), Math.max(1, Number(timeoutMs) || RADIO_VOICE_PLAYBACK_TIMEOUT_MS));
    Promise.resolve()
      .then(startPlayback)
      .then((playStarted) => {
        const state = getState();
        inspect(state);
        if (!playStarted && !['loading', 'buffering', 'playing'].includes(state?.audioState)) finish(false);
      })
      .catch(() => finish(false));
  });
}

/** Start and verify a prepared station without ever making it audible under voice. */
export function playPreparedRadioForVoice(options = {}) {
  if (!S._voiceDucked) return Promise.resolve(false);
  return confirmRadioPlayback({
    startPlayback: () => playSelectedRadio({ origin: 'voice', attemptId: options.attemptId }),
    subscribe: subscribeToRadio,
    getState: getRadioUIState,
    timeoutMs: options.timeoutMs,
  });
}

/** Stop the shared stream and release its network resource. */
export function stopRadioPlayback({ origin = 'programmatic', attemptId = null } = {}) {
  if (attemptId && S._activePlaybackAttempt?.id !== attemptId) return false;
  const stoppedAttemptId = S._activePlaybackAttempt?.id || null;
  endRadioTuning();
  S._playGeneration += 1;
  S._playFallbackId = null;
  S._playFallbackFocus = null;
  S._playFallbackOrigin = 'programmatic';
  S._playFallbackAttemptId = null;
  S._activePlaybackAttempt = null;
  if (S._audio) {
    S._audio.pause();
    S._audio.removeAttribute('src');
    S._audio.load();
  }
  S._audioStationId = null;
  S._audioState = 'stopped';
  S._audioError = null;
  emitState();
  if (origin === 'user' || origin === 'voice') {
    emitPlaybackControl('stop', origin, stoppedAttemptId);
  }
  return true;
}

/** Pause or resume the selected stream. Resuming is still click initiated. */
export function toggleRadioPlayback({ origin = 'programmatic' } = {}) {
  if (['loading', 'playing', 'buffering'].includes(S._audioState)) {
    return Promise.resolve(pauseRadioPlayback({ origin }));
  }
  if (!radioPresentationAllowed()) return Promise.resolve(false);
  if (!S._selectedId) {
    const ranked = rankedVisibleStations();
    if (!ranked.length) return Promise.resolve(false);
    S._playFallbackId = ranked[1]?.id || null;
    S._playFallbackFocus = false;
    selectRadioStation(ranked[0].id, { autoplay: false, focus: false });
  }
  return playSelectedRadio({ origin });
}

/** Pause Radio without toggling a stopped or already-paused stream back on. */
export function pauseRadioPlayback({ origin = 'programmatic' } = {}) {
  if (!['loading', 'playing', 'buffering'].includes(S._audioState)) return false;
  const pausedAttemptId = S._activePlaybackAttempt?.id || null;
  if (S._tuningAwaitingStationId && !S._tuningActive) endRadioTuning();
  S._playGeneration += 1;
  S._playFallbackId = null;
  S._playFallbackFocus = null;
  S._playFallbackOrigin = 'programmatic';
  S._playFallbackAttemptId = null;
  S._activePlaybackAttempt = null;
  S._audio?.pause();
  S._audioState = 'paused';
  emitState();
  if (origin === 'user' || origin === 'voice') {
    emitPlaybackControl('pause', origin, pausedAttemptId);
  }
  return true;
}

/** Set shared audio volume, clamped to [0, 1]. */
export function setRadioVolume(value) {
  if (!radioPresentationAllowed()) return false;
  const volume = clampRadioVolume(value);
  S._userVolume = volume;
  installAudio();
  if (!S._voiceDucked) {
    cancelRadioVolumeTransition();
    S._voiceRestoring = false;
    if (S._audio) S._audio.volume = volume;
  }
  syncTuningNoiseGain();
  emitState();
  return true;
}

/** Durable Radio preferences; this surface never creates or plays audio. */
export function setRadioParams(params = {}) {
  const nextFilter = Object.hasOwn(params, 'filter')
    ? normalizeRadioFilter(params.filter)
    : null;
  if (Object.hasOwn(params, 'filter') && !nextFilter) return false;
  const numericVolume = Object.hasOwn(params, 'volume') ? Number(params.volume) : null;
  if (Object.hasOwn(params, 'volume') && !Number.isFinite(numericVolume)) return false;
  const nextVolume = numericVolume === null ? null : clampRadioVolume(numericVolume);

  let changed = false;
  let filterChanged = false;
  let clearedCancelledPresentation = false;
  if (nextFilter !== null) {
    filterChanged = nextFilter !== S._filter;
    if (filterChanged && (S._tuningActive || S._tuningAwaitingStationId)) endRadioTuning();
    clearedCancelledPresentation = Boolean(S._cancelledTuningPresentationStation);
    S._cancelledTuningPresentationStation = null;
    S._filter = nextFilter;
    if (clearedCancelledPresentation) updateSelectionEntity();
    if (filterChanged) resetRadioClusterOverlayIdentities();
    changed ||= filterChanged || clearedCancelledPresentation;
  }
  if (nextVolume !== null && nextVolume !== S._userVolume) {
    S._userVolume = nextVolume;
    if (S._audio && !S._voiceDucked) {
      cancelRadioVolumeTransition();
      S._voiceRestoring = false;
      S._audio.volume = nextVolume;
    }
    syncTuningNoiseGain();
    changed = true;
  }
  if (changed && radioPresentationAllowed()) {
    updateRenderVisibility();
    if (filterChanged && S._dataSource?.clustering?.enabled) {
      const clusterPoints = S._dataSource.clustering.clusterPoints;
      S._dataSource.clustering.clusterPoints = !clusterPoints;
      S._dataSource.clustering.clusterPoints = clusterPoints;
      S._viewer?.scene?.requestRender();
    }
    scheduleRadioOverlayPublish();
  }
  emitState();
  return true;
}

export function getRadioParams() {
  return { filter: S._filter, volume: S._userVolume };
}

/**
 * Mute Radio during a live voice turn, then gently restore the user-owned
 * volume after voice returns to standby. Repeated state sync is idempotent.
 */
export function setRadioVoiceDucking(ducked, {
  restoreDelayMs = VOICE_RESTORE_DELAY_MS,
  restoreDurationMs = VOICE_RESTORE_DURATION_MS,
} = {}) {
  const shouldDuck = Boolean(ducked);
  if (shouldDuck === S._voiceDucked && (shouldDuck || S._voiceRestoring)) return;
  if (!shouldDuck && !S._voiceDucked && !S._voiceRestoring
      && (!S._audio || Math.abs(S._audio.volume - S._userVolume) < 0.001)) return;

  cancelRadioVolumeTransition();
  S._voiceDucked = shouldDuck;
  S._voiceRestoring = false;

  if (shouldDuck) {
    if (S._audio) S._audio.volume = 0;
    syncTuningNoiseGain();
    emitState();
    return;
  }
  if (!S._audio) {
    syncTuningNoiseGain();
    S._voiceRestoring = false;
    emitState();
    return;
  }

  const generation = S._volumeTransitionGeneration;
  syncTuningNoiseGain();
  S._voiceRestoring = true;
  emitState();
  const beginRestore = () => {
    S._voiceRestoreTimer = null;
    if (generation !== S._volumeTransitionGeneration || S._voiceDucked || !S._audio) return;
    const startedAt = volumeClock();
    const initialVolume = S._audio.volume;
    const duration = Math.max(0, Number(restoreDurationMs) || 0);
    const step = (now) => {
      if (generation !== S._volumeTransitionGeneration || S._voiceDucked || !S._audio) return;
      const progress = duration === 0 ? 1 : Math.min(1, Math.max(0, (now - startedAt) / duration));
      const eased = progress * progress * (3 - 2 * progress);
      S._audio.volume = clampRadioVolume(initialVolume + (S._userVolume - initialVolume) * eased);
      if (progress < 1) {
        S._volumeFadeFrame = scheduleVolumeFrame(step);
        return;
      }
      S._volumeFadeFrame = null;
      S._voiceRestoring = false;
      emitState();
    };
    S._volumeFadeFrame = scheduleVolumeFrame(step);
  };
  const delay = Math.max(0, Number(restoreDelayMs) || 0);
  if (delay > 0) S._voiceRestoreTimer = setTimeout(beginRestore, delay);
  else beginRestore();
}
