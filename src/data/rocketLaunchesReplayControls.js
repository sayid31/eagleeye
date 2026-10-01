// Moved out of rocketLaunches.js (rocketLaunchesReplayControls).

import * as Cesium from 'cesium';
import { MISSION_GLOBE_VIEW_RANGE_M, missionZoomPitch } from './rocketReplayCamera.js';
import { normalizeReplaySpeed, replayStartAfterPause } from './rocketOrbitMath.js';
import { S, _animationStarts, _replayTracks } from './rocketLaunchesState.js';

export function stopMissionZoomAnchor() {
  if (S._missionZoomAnchorRemover) S._missionZoomAnchorRemover();
  S._missionZoomAnchorRemover = null;
  S._missionZoomAnchorId = null;
  if (S._viewer?.camera && !S._replayCameraLaunchId) {
    S._viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
}

export function startMissionZoomAnchor(launch, initialRange) {
  if (!S._viewer || !launch || S._replayCameraLaunchId) return;
  stopMissionZoomAnchor();
  const target = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  const range = Math.max(2000, Number(initialRange) || MISSION_GLOBE_VIEW_RANGE_M);
  S._missionZoomAnchorId = launch.id;
  S._viewer.camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(0, missionZoomPitch(range), range),
  );
}

export function syncReplayButton() {
  const button = S._missionPanel?.querySelector('[data-mission-replay]');
  const transport = S._missionPanel?.querySelector('[data-mission-replay-transport]');
  const speedControl = S._missionPanel?.querySelector('.mission-replay-speed-control');
  if (!button) return;
  const active = Boolean(S._replayCameraLaunchId && S._replayCameraLaunchId === S._selectedLaunchId);
  const replayAvailable = Boolean(S._selectedLaunchId && _replayTracks.has(S._selectedLaunchId));
  if (speedControl) speedControl.hidden = !replayAvailable;
  button.hidden = active || !replayAvailable;
  button.disabled = !replayAvailable;
  button.textContent = 'REPLAY ASCENT';
  button.classList.remove('active');
  button.setAttribute('aria-pressed', String(active));
  button.title = 'Replay the estimated ascent with a following camera';
  if (transport) {
    transport.hidden = !active;
    transport.classList.toggle('is-paused', active && S._replayPaused);
    const toggleButton = transport.querySelector('[data-mission-replay-toggle]');
    if (toggleButton) {
      toggleButton.disabled = !active;
      toggleButton.textContent = S._replayPaused ? '▶' : 'Ⅱ';
      toggleButton.setAttribute('aria-label', S._replayPaused ? 'Resume replay' : 'Pause replay');
      toggleButton.title = S._replayPaused ? 'Resume replay' : 'Pause replay';
    }
  }
}

export function syncReplayCountdownButton(state) {
  const transport = S._missionPanel?.querySelector('[data-mission-replay-transport]');
  if (!transport || !S._replayCameraLaunchId) return;
  const phase = state.countdownActive
    ? `T minus ${state.countdownSeconds}`
    : state.preCountdownActive
      ? 'Preparing launch site'
    : state.elapsedSinceStart < 1
      ? 'Liftoff'
      : state.ascending ? 'Ascent replay' : 'Orbit replay';
  transport.setAttribute('aria-label', `${phase}${S._replayPaused ? ', paused' : ''}`);
}

export function syncReplaySpeedControl() {
  const input = S._missionPanel?.querySelector('[data-mission-replay-speed]');
  const output = S._missionPanel?.querySelector('[data-mission-replay-speed-output]');
  if (input) {
    input.value = String(S._replaySpeed);
    const progress = ((S._replaySpeed - REPLAY_SPEED_MIN) / (REPLAY_SPEED_MAX - REPLAY_SPEED_MIN)) * 100;
    input.style.setProperty('--replay-speed-progress', `${progress}%`);
  }
  if (output) output.textContent = `${S._replaySpeed.toFixed(S._replaySpeed % 1 ? 2 : 0)}×`;
}

export function setReplaySpeed(value) {
  const nextSpeed = normalizeReplaySpeed(value);
  const previousSpeed = S._replaySpeed;
  if (nextSpeed === previousSpeed) {
    syncReplaySpeedControl();
    return;
  }
  const now = S._replayPaused && Number.isFinite(S._replayPausedAtMs)
    ? S._replayPausedAtMs
    : Date.now();
  for (const [launchId, startedAt] of _animationStarts) {
    if (!Number.isFinite(startedAt)) continue;
    const elapsedMissionMs = (now - startedAt) * previousSpeed;
    _animationStarts.set(launchId, now - elapsedMissionMs / nextSpeed);
  }
  S._replaySpeed = nextSpeed;
  syncReplaySpeedControl();
}

export function replayClockNow(launchId) {
  if (
    S._replayPaused
    && S._replayCameraLaunchId === launchId
    && Number.isFinite(S._replayPausedAtMs)
  ) {
    return S._replayPausedAtMs;
  }
  return Date.now();
}

export function pauseMissionReplay() {
  if (!S._replayCameraLaunchId || S._replayPaused) return false;
  S._replayPausedAtMs = Date.now();
  S._replayPaused = true;
  syncReplayButton();
  return true;
}

export function resumeMissionReplay() {
  if (!S._replayCameraLaunchId || !S._replayPaused || !Number.isFinite(S._replayPausedAtMs)) {
    return false;
  }
  const resumedAt = Date.now();
  const startedAt = _animationStarts.get(S._replayCameraLaunchId);
  if (Number.isFinite(startedAt)) {
    _animationStarts.set(
      S._replayCameraLaunchId,
      replayStartAfterPause(startedAt, S._replayPausedAtMs, resumedAt),
    );
  }
  S._replayPaused = false;
  S._replayPausedAtMs = null;
  syncReplayButton();
  return true;
}
