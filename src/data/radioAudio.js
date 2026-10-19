// Moved out of radio.js (radioAudio).

import { radioTuningStaticShouldPlay } from './radioTunerMath.js';
import { invalidateRadioCameraNavigation } from './radioCamera.js';
import { EMPTY_ACCEPTED_CATALOG_SNAPSHOT, RADIO_TUNER_STATIC_MAX_GAIN } from './radioConstants.js';
import { updateSelectionEntity } from './radioSelection.js';
import { emitState } from './radioSelectors.js';
import { S } from './radioState.js';
import { tryRadioFallback } from './radioTuning.js';

export function cancelRadioVolumeTransition() {
  S._volumeTransitionGeneration += 1;
  if (S._voiceRestoreTimer) clearTimeout(S._voiceRestoreTimer);
  S._voiceRestoreTimer = null;
  if (S._volumeFadeFrame) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(S._volumeFadeFrame);
    else clearTimeout(S._volumeFadeFrame);
  }
  S._volumeFadeFrame = null;
}

function audioEventBelongsToActiveAttempt(audio) {
  const attempt = S._activePlaybackAttempt;
  return S._audio === audio
    && Boolean(attempt)
    && attempt.generation === S._playGeneration
    && attempt.stationId === S._audioStationId;
}

export function installAudio({ replace = false } = {}) {
  if (S._audio && !replace) return;
  if (typeof Audio === 'undefined') return;
  const previousAudio = S._audio;
  S._audio = null;
  if (previousAudio) {
    try { previousAudio.pause(); } catch { /* already stopped */ }
    try { previousAudio.removeAttribute('src'); } catch { /* no source */ }
    try { previousAudio.load(); } catch { /* detached media */ }
  }
  const audio = new Audio();
  S._audio = audio;
  audio.preload = 'none';
  audio.volume = S._voiceDucked ? 0 : S._userVolume;
  audio.addEventListener('playing', () => {
    if (S._audio !== audio) return;
    if (!audioEventBelongsToActiveAttempt(audio)) return;
    if (!['loading', 'buffering', 'playing'].includes(S._audioState)) return;
    S._audioState = 'playing';
    S._audioError = null;
    if (S._tuningAwaitingStationId === S._audioStationId) clearRadioTuningNoise({ emit: false });
    emitState();
  });
  audio.addEventListener('pause', () => {
    if (S._audio !== audio) return;
    if (S._audioState === 'stopped' || S._audioState === 'loading') return;
    S._audioState = 'paused';
    emitState();
  });
  audio.addEventListener('waiting', () => {
    if (S._audio !== audio) return;
    if (!audioEventBelongsToActiveAttempt(audio)) return;
    if (!['loading', 'buffering', 'playing'].includes(S._audioState)) return;
    S._audioState = 'buffering';
    emitState();
  });
  audio.addEventListener('error', () => {
    if (S._audio !== audio) return;
    if (!audioEventBelongsToActiveAttempt(audio)) return;
    if (!['loading', 'buffering', 'playing'].includes(S._audioState)) return;
    const failedId = S._audioStationId;
    const attempt = S._activePlaybackAttempt;
    if (tryRadioFallback(failedId, attempt?.origin, attempt?.id)) return;
    S._audioState = 'error';
    S._audioError = 'Aliran penyiar tidak tersedia atau diblokir oleh peramban.';
    emitState();
  });
}

function stopTuningNoiseSource() {
  if (S._tuningNoiseSource) {
    try { S._tuningNoiseSource.stop(); } catch { /* already stopped */ }
    try { S._tuningNoiseSource.disconnect(); } catch { /* already disconnected */ }
  }
  try { S._tuningNoiseFilter?.disconnect(); } catch { /* already disconnected */ }
  try { S._tuningNoiseGain?.disconnect(); } catch { /* already disconnected */ }
  S._tuningNoiseSource = null;
  S._tuningNoiseFilter = null;
  S._tuningNoiseGain = null;
}

export function syncTuningNoiseGain() {
  if (!S._tuningNoiseContext || !S._tuningNoiseGain) return;
  const audible = radioTuningStaticShouldPlay({
    tuningActive: S._tuningActive,
    tuningStatic: S._tuningStatic,
    awaitingStationId: S._tuningAwaitingStationId,
    voiceDucked: S._voiceDucked,
  });
  const target = audible
    ? Math.min(RADIO_TUNER_STATIC_MAX_GAIN, S._userVolume * 0.03)
    : 0;
  const now = S._tuningNoiseContext.currentTime;
  S._tuningNoiseGain.gain.cancelScheduledValues(now);
  S._tuningNoiseGain.gain.setValueAtTime(S._tuningNoiseGain.gain.value, now);
  S._tuningNoiseGain.gain.linearRampToValueAtTime(target, now + 0.025);
}

export function installTuningNoise() {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return false;
  if (!S._tuningNoiseContext) S._tuningNoiseContext = new AudioContextClass();
  const resumed = S._tuningNoiseContext.resume?.();
  if (resumed?.catch) void resumed.catch(() => {});
  if (S._tuningNoiseSource) return true;

  const frameCount = Math.max(1, Math.floor(S._tuningNoiseContext.sampleRate * 0.75));
  const buffer = S._tuningNoiseContext.createBuffer(1, frameCount, S._tuningNoiseContext.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;

  S._tuningNoiseSource = S._tuningNoiseContext.createBufferSource();
  S._tuningNoiseFilter = S._tuningNoiseContext.createBiquadFilter();
  S._tuningNoiseGain = S._tuningNoiseContext.createGain();
  S._tuningNoiseSource.buffer = buffer;
  S._tuningNoiseSource.loop = true;
  S._tuningNoiseFilter.type = 'bandpass';
  S._tuningNoiseFilter.frequency.value = 1_650;
  S._tuningNoiseFilter.Q.value = 0.55;
  S._tuningNoiseGain.gain.value = 0;
  S._tuningNoiseSource.connect(S._tuningNoiseFilter);
  S._tuningNoiseFilter.connect(S._tuningNoiseGain);
  S._tuningNoiseGain.connect(S._tuningNoiseContext.destination);
  S._tuningNoiseSource.start();
  return true;
}

export function clearRadioTuningNoise({ emit = true, restoredStation = null } = {}) {
  if (S._tuningCameraNavigation) invalidateRadioCameraNavigation();
  S._tuningActive = false;
  S._tuningStatic = false;
  S._tuningAwaitingStationId = null;
  S._tuningPreviewId = null;
  S._tuningStartStationId = null;
  S._tuningResolutionSnapshot = EMPTY_ACCEPTED_CATALOG_SNAPSHOT;
  S._tuningStationById = new Map();
  S._tuningCameraNavigation = null;
  S._cancelledTuningPresentationStation = restoredStation;
  updateSelectionEntity();
  syncTuningNoiseGain();
  stopTuningNoiseSource();
  const suspended = S._tuningNoiseContext?.suspend?.();
  if (suspended?.catch) void suspended.catch(() => {});
  if (emit) emitState();
}
