// Moved out of rocketLaunches.js (rocketLaunchesReplayVehicle).

import * as Cesium from 'cesium';
import { samplePath } from './rocketOrbitMath.js';
import { compactLaunchSiteName, formatMissionEventTime, shortMissionLabel } from './rocketLaunchesNormalize.js';
import { S, _replayTracks } from './rocketLaunchesState.js';

/**
 * Resolve the one permitted screen-space replay overlay state.
 * @param {object} input Overlay state.
 * @param {boolean} input.replayActive Whether replay owns the camera.
 * @param {boolean} input.ascending Whether the replay marker is on ascent.
 * @param {boolean} input.countdownActive Whether the T-minus hold is active.
 * @returns {'countdown'|'ascent'|'orbit'|null}
 */
export function replayOverlayMode({
  replayActive,
  ascending,
  countdownActive,
  preCountdownActive = false,
}) {
  if (!replayActive) return null;
  if (preCountdownActive) return null;
  if (countdownActive) return 'countdown';
  return ascending ? 'ascent' : 'orbit';
}

/**
 * Rotate an upright screen-space rocket so its nose follows a projected path.
 * @param {{x: number, y: number}} from Current screen point.
 * @param {{x: number, y: number}} to Forward screen point.
 * @returns {number} Clockwise CSS rotation in radians.
 */
export function replayVehicleScreenRotation(from, to) {
  const dx = Number(to?.x) - Number(from?.x);
  const dy = Number(to?.y) - Number(from?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) return 0;
  return Math.atan2(dx, -dy);
}

/**
 * Reduce small screen-space reprojection jitter without allowing the marker
 * to lag behind a camera jump or a phase transition.
 * @param {{x:number,y:number}|null} previous Previous rendered position.
 * @param {{x:number,y:number}} next Current path projection.
 * @param {number} [alpha] Interpolation amount.
 * @param {number} [snapDistance] Maximum distance to smooth.
 * @returns {{x:number,y:number}}
 */
export function smoothReplayWindowPosition(
  previous,
  next,
  alpha = 0.55,
  snapDistance = 24,
) {
  if (!previous || !next) return next;
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  if (!Number.isFinite(distance) || distance > snapDistance) return next;
  const amount = Cesium.Math.clamp(Number(alpha) || 0, 0, 1);
  return {
    x: Cesium.Math.lerp(previous.x, next.x, amount),
    y: Cesium.Math.lerp(previous.y, next.y, amount),
  };
}

export function createReplayVehicleOverlay() {
  if (S._replayVehicleOverlay || typeof document === 'undefined') return;
  const host = document.getElementById('cesiumContainer') || document.body;
  S._replayVehicleOverlay = document.createElement('div');
  S._replayVehicleOverlay.className = 'mission-replay-vehicle-overlay';
  S._replayVehicleOverlay.hidden = true;
  S._replayVehicleOverlay.setAttribute('aria-hidden', 'true');
  S._replayVehicleOverlay.innerHTML = `
    <div class="mission-replay-flight-symbol">
      <svg class="mission-replay-rocket" viewBox="0 0 48 72" aria-hidden="true">
        <path class="mission-replay-rocket-body" d="M24 5C16 14 14 27 15 45L9 54L18 51L24 58L30 51L39 54L33 45C34 27 32 14 24 5Z"></path>
        <circle class="mission-replay-rocket-port" cx="24" cy="29" r="3.4"></circle>
      </svg>
      <svg class="mission-replay-thrust" viewBox="0 0 72 72" aria-hidden="true">
        <ellipse style="--thrust-index:0" cx="36" cy="7" rx="5" ry="1.8"></ellipse>
        <ellipse style="--thrust-index:1" cx="36" cy="15" rx="8" ry="2.4"></ellipse>
        <ellipse style="--thrust-index:2" cx="36" cy="24" rx="11" ry="3"></ellipse>
        <ellipse style="--thrust-index:3" cx="36" cy="35" rx="15" ry="3.8"></ellipse>
        <ellipse style="--thrust-index:4" cx="36" cy="48" rx="20" ry="4.7"></ellipse>
        <ellipse style="--thrust-index:5" cx="36" cy="63" rx="26" ry="5.8"></ellipse>
      </svg>
    </div>
    <div class="mission-replay-orbit-dot" aria-hidden="true"></div>
    <div class="mission-replay-overlay-callout">
      <strong data-replay-overlay-title></strong>
      <span data-replay-overlay-detail></span>
    </div>`;
  host.appendChild(S._replayVehicleOverlay);
}

export function hideReplayVehicleOverlay() {
  if (!S._replayVehicleOverlay) return;
  S._replayVehicleOverlay.hidden = true;
  S._replayVehicleOverlay.classList.remove('is-thrusting', 'is-paused');
}

export function destroyReplayVehicleOverlay() {
  S._replayVehicleOverlay?.remove();
  S._replayVehicleOverlay = null;
  S._replayVehicleOverlayText = '';
}

export function updateReplayVehicleOverlay(occluder) {
  if (!S._viewer || !S._replayVehicleOverlay || !S._selectedLaunchId) {
    hideReplayVehicleOverlay();
    return null;
  }
  const launch = S._launches.find((item) => item.id === S._selectedLaunchId);
  const track = _replayTracks.get(S._selectedLaunchId);
  if (!launch || !track) {
    hideReplayVehicleOverlay();
    return null;
  }
  const replayActive = S._replayCameraLaunchId === launch.id;
  const state = track.getReplayState();
  const mode = replayOverlayMode({
    replayActive,
    ascending: state.ascending,
    countdownActive: state.countdownActive,
    preCountdownActive: state.preCountdownActive,
  });
  if (!mode) {
    track.lastOverlayWindowPosition = null;
    track.lastOverlayMode = null;
    hideReplayVehicleOverlay();
    return null;
  }
  const path = state.ascending
    ? track.ascentPath
    : track.animatedOrbitPath;
  // Do not call scene.sampleHeight() from this post-render path. A selected
  // mission can remain visible from globe range, and a periodic remote height
  // probe forces Google Photorealistic 3D Tiles to reconsider its refinement
  // set even though the camera is stationary. That presented as a one-second
  // shrink/expand pulse across the globe. Replay follows its already-built,
  // surface-safe Cartesian path and therefore needs no runtime pad sampling.
  const position = samplePath(path, state.phaseProgress);
  if (!position || !occluder.isPointVisible(position)) {
    hideReplayVehicleOverlay();
    return null;
  }
  const windowPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
    S._viewer.scene,
    position,
  );
  if (!windowPosition) {
    hideReplayVehicleOverlay();
    return null;
  }
  const canvas = S._viewer.scene.canvas;
  if (
    windowPosition.x < -80
    || windowPosition.y < -100
    || windowPosition.x > canvas.clientWidth + 80
    || windowPosition.y > canvas.clientHeight + 100
  ) {
    hideReplayVehicleOverlay();
    return null;
  }
  // The replay camera already targets this same frame-cached world position.
  // Applying a second temporal filter here made the DOM vehicle trail the
  // camera until the snap threshold was crossed, producing a repeating
  // forward/back jump. Keep smoothing only for the non-tracked close-up pad
  // marker, where the user can move the camera independently.
  const renderedWindowPosition = !replayActive && track.lastOverlayMode === mode
    ? smoothReplayWindowPosition(track.lastOverlayWindowPosition, windowPosition)
    : windowPosition;
  track.lastOverlayWindowPosition = renderedWindowPosition;
  track.lastOverlayMode = mode;
  S._replayVehicleOverlay.hidden = false;
  S._replayVehicleOverlay.dataset.mode = mode;
  S._replayVehicleOverlay.classList.toggle(
    'is-thrusting',
    replayActive && state.ascending && !state.countdownActive,
  );
  S._replayVehicleOverlay.classList.toggle('is-paused', replayActive && S._replayPaused);
  S._replayVehicleOverlay.style.transform = `translate3d(${renderedWindowPosition.x}px, ${renderedWindowPosition.y}px, 0) translate(-50%, -50%)`;
  let vehicleRotation = 0;
  if (replayActive && !state.countdownActive) {
    const tangentStep = Math.max(0.002, 0.8 / Math.max(2, path.length - 1));
    const forwardProgress = Math.min(1, state.phaseProgress + tangentStep);
    const backwardProgress = Math.max(0, state.phaseProgress - tangentStep);
    const useForward = forwardProgress > state.phaseProgress;
    const tangentPosition = samplePath(
      path,
      useForward ? forwardProgress : backwardProgress,
    );
    const tangentWindowPosition = tangentPosition
      ? Cesium.SceneTransforms.worldToWindowCoordinates(S._viewer.scene, tangentPosition)
      : null;
    if (tangentWindowPosition) {
      const screenDelta = Math.hypot(
        tangentWindowPosition.x - windowPosition.x,
        tangentWindowPosition.y - windowPosition.y,
      );
      // When the path points almost directly into/out of the camera, its
      // screen projection has no trustworthy direction. Keep the last valid
      // path-facing pose instead of snapping the rocket to a camera-facing
      // upright orientation.
      if (screenDelta >= 2) {
        vehicleRotation = useForward
          ? replayVehicleScreenRotation(windowPosition, tangentWindowPosition)
          : replayVehicleScreenRotation(tangentWindowPosition, windowPosition);
        track.lastVehicleRotation = vehicleRotation;
      } else if (Number.isFinite(track.lastVehicleRotation)) {
        vehicleRotation = track.lastVehicleRotation;
      }
    }
  }
  S._replayVehicleOverlay.style.setProperty(
    '--mission-replay-rotation',
    `${Cesium.Math.toDegrees(vehicleRotation)}deg`,
  );

  const mission = shortMissionLabel(launch.name, 22).toUpperCase();
  const siteName = compactLaunchSiteName(launch.launchSite);
  const siteCallout = siteName
    ? `LOKASI PELUNCURAN · ${shortMissionLabel(siteName, 20).toUpperCase()}`
    : 'LOKASI PELUNCURAN';
  let title = mission;
  let detail = siteCallout;
  if (mode === 'countdown') {
    title = `T−${String(state.countdownSeconds).padStart(2, '0')} · ${mission}`;
    detail = `PELUNCURAN SIAGA\n${siteCallout}`;
  } else if (mode === 'ascent') {
    title = state.elapsedSinceStart < 1
      ? `LEPAS LANDAS · ${mission}`
      : `${launch.trajectory.length > 1 ? 'ULANGAN PENDAKIAN' : 'ESTIMASI PENDAKIAN'} · ${mission}`;
    detail = formatMissionEventTime(state.eventTime);
  } else if (mode === 'recovery') {
    title = `MASUK KEMBALI / PEMULIHAN TAHAP · ${mission}`;
    detail = formatMissionEventTime(state.eventTime);
  } else if (mode === 'orbit') {
    title = `ULANGAN ORBIT · ${mission}`;
    detail = formatMissionEventTime(state.eventTime);
  }
  if (S._replayPaused) title = `DIJEDA · ${title}`;
  const nextText = `${title}\n${detail}`;
  if (nextText !== S._replayVehicleOverlayText) {
    S._replayVehicleOverlayText = nextText;
    S._replayVehicleOverlay.querySelector('[data-replay-overlay-title]').textContent = title;
    S._replayVehicleOverlay.querySelector('[data-replay-overlay-detail]').textContent = detail;
  }
  return mode;
}
