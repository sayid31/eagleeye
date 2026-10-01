import { approximateOrbitPath, buildMissionPaths, normalizeReplaySpeed, orbitProgressAtTime, reconstructedAscentPath, replayAscentDurationSeconds, replayStartAfterPause, replayState, samplePath } from './rocketOrbitMath.js';
import { REPLAY_ORBIT_PULLBACK_FRACTION, cameraHeadingForPath, missionZoomPitch, replayCameraView, replayChaseCameraHeading, replayInitialCameraHeading, replayOrbitCameraPose, replayOrbitCameraTarget, replayOrbitFrameSphere, replayOrbitGlobeAnchor, replayOrbitGlobeRange, smoothReplayCameraHeading } from './rocketReplayCamera.js';
import * as Cesium from 'cesium';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { LAYER_METADATA } from './layerMetadata.js';
import { REPLAY_COUNTDOWN_DURATION_SEC, REPLAY_INITIAL_RANGE_M, REPLAY_ORBIT_DURATION_SEC, REPLAY_TILE_SETTLE_DELAY_SEC } from './rocketLaunchesConstants.js';
import { focusFullGlobe, setSelectedMission } from './rocketLaunchesFocus.js';
import { attachRocketLaunchesDataManager, destroyRocketLaunchesLayer, disableRocketLaunchesLayer, getRocketLaunchesStats, initRocketLaunchesLayer, releaseRocketLaunchesCameraOwnership } from './rocketLaunchesLifecycle.js';
import { syncMissionOrbitPrimitiveVisibility } from './rocketLaunchesOrbit.js';
import { syncMissionOverlayEntries } from './rocketLaunchesOverlay.js';
import { releaseAircraftTracking } from './rocketLaunchesPolicy.js';
import { stopMissionZoomAnchor, syncReplayButton, syncReplayCountdownButton } from './rocketLaunchesReplayControls.js';
import { S, _animationStarts, _replayTracks } from './rocketLaunchesState.js';
import { captureSatelliteDependency, updateRocketLaunchesLayer } from './rocketLaunchesUpdate.js';

export { LAUNCH_PAD_ZONE_RADIUS_M, ROCKET_MISSION_AMBIENT_OVERLAY_COHORT_LIMIT, ROCKET_MISSION_AMBIENT_OVERLAY_COLLISION_CAPACITY, ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID, ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID, ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_OPTIONS } from './rocketLaunchesConstants.js';
export { compactLaunchSiteName, formatMissionEventTime, missionDataCompleteness, missionHoverPreviewRange, missionRosterEntries, normalizeRocketLaunches, parseMissionDurationSeconds } from './rocketLaunchesNormalize.js';
export { createRocketMissionElementOverlayEntry, createRocketMissionMarkerOverlayEntry, missionMarkerColor, selectRocketMissionMarkerOverlayCohort } from './rocketLaunchesOverlay.js';
export { launchStatusAllowsOrbit, missionPathPresentation, releaseAircraftTracking, satelliteParamsAfterSpaceMissions, satelliteParamsForSpaceMissions, shouldRetryAfterActiveTle } from './rocketLaunchesPolicy.js';
export { replayOverlayMode, replayVehicleScreenRotation, smoothReplayWindowPosition } from './rocketLaunchesReplayVehicle.js';
export { _setRocketMissionOverlayHostForTest, _setSelectedRocketMissionForTest, _startMissionReplayForTest, _stopMissionReplayForTest } from './rocketLaunchesTestHooks.js';
export { launchPadZoneVisible, missionAnchorHorizonVisible, missionAnchorVisible } from './rocketLaunchesVisibility.js';

export {
  approximateOrbitPath,
  buildMissionPaths,
  normalizeReplaySpeed,
  orbitProgressAtTime,
  reconstructedAscentPath,
  replayAscentDurationSeconds,
  replayStartAfterPause,
  replayState,
  samplePath,
} from './rocketOrbitMath.js';

export {
  cameraHeadingForPath,
  missionZoomPitch,
  replayCameraView,
  replayChaseCameraHeading,
  replayInitialCameraHeading,
  replayOrbitCameraPose,
  replayOrbitCameraTarget,
  replayOrbitFrameSphere,
  replayOrbitGlobeAnchor,
  replayOrbitGlobeRange,
  smoothReplayCameraHeading,
} from './rocketReplayCamera.js';

export function stopMissionReplay() {
  const stoppedLaunchId = S._replayCameraLaunchId;
  S._replayCameraToken++;
  if (S._replayCameraRemover) S._replayCameraRemover();
  S._replayCameraRemover = null;
  S._viewer?.camera?.cancelFlight();
  if (S._viewer?.camera) S._viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  S._replayCameraLaunchId = null;
  S._replayPaused = false;
  S._replayPausedAtMs = null;
  if (stoppedLaunchId) _animationStarts.set(stoppedLaunchId, Date.now());
  // Own hold (perf wave 3) — every stopMissionReplay() call site (11 of them:
  // re-click same launch, TLE refresh, mission-data update, layer disable/
  // destroy, camera-ownership release, panel cancel button, …) funnels through
  // this one function, so releasing here covers every teardown path. Safe to
  // call even when replay was never held (releaseContinuousRender is a no-op
  // on an owner id that isn't currently held).
  releaseContinuousRender('rocket-replay');
  syncReplayButton();
  syncMissionOverlayEntries();
}

export function startMissionReplay(launchId) {
  const launch = S._launches.find((item) => item.id === launchId);
  const track = _replayTracks.get(launchId);
  if (!S._viewer || !launch || !track) return false;
  if (S._replayCameraLaunchId === launchId) {
    stopMissionReplay();
    return false;
  }

  stopMissionZoomAnchor();
  stopMissionReplay();
  S._replayCameraLaunchId = launchId;
  S._replayPaused = false;
  S._replayPausedAtMs = null;
  // Own hold (perf wave 3) — mission replay is a discrete, explicit opt-in
  // mode (same shape as cctv.js's 'cctv-adjust' calibration-mode hold): the
  // preUpdate listener below mutates the chase camera every frame, which
  // request-on-demand rendering would otherwise never notice. Scoped to only
  // the replay's own lifetime, not the whole 'rocket-launches' layer — that
  // hold (above, in enable()/disable()) is unchanged by this carve-out.
  holdContinuousRender('rocket-replay');
  const token = ++S._replayCameraToken;
  const ascentDurationSec = track.ascentDurationSec;
  // Start broadside to the ascent/orbit direction so the launch profile is
  // visible. The chase heading then eases toward the path tangent after the
  // camera is established.
  const initialHeading = replayInitialCameraHeading(track.ascentPath);
  track.lastCameraHeading = initialHeading;
  syncReplayButton();
  syncMissionOverlayEntries();
  releaseAircraftTracking(S._dataManager);
  S._viewer.trackedEntity = undefined;
  S._viewer.camera.cancelFlight();
  _animationStarts.set(
    launchId,
    Date.now() + (REPLAY_TILE_SETTLE_DELAY_SEC + REPLAY_COUNTDOWN_DURATION_SEC) * 1000,
  );
  let cameraReady = false;
  let lastCameraUpdateMs = null;

  // Move the chase camera before scene traversal. Mutating it in preRender
  // makes Cesium discover a new view after 3D-tile refinement, which can cause
  // a self-sustaining refinement loop and visible stutter during slow replay.
  S._replayCameraRemover = S._viewer.scene.preUpdate.addEventListener(() => {
    if (token !== S._replayCameraToken || S._replayCameraLaunchId !== launchId) return;
    const state = track.beginReplayFrame();
    syncReplayCountdownButton(state);
    if (!cameraReady) return;
    const path = state.ascending
      ? track.ascentPath
      : track.animatedOrbitPath;
    const position = samplePath(path, state.phaseProgress);
    if (!position) return;
    const pathHeading = cameraHeadingForPath(
      path,
      state.phaseProgress,
      track.lastCameraHeading,
    );
    const orbitBlend = !state.ascending
      ? Cesium.Math.clamp(
        (Number(state.phaseProgress) || 0) / REPLAY_ORBIT_PULLBACK_FRACTION,
        0,
        1,
      )
      : 0;
    const desiredHeading = replayChaseCameraHeading(pathHeading, orbitBlend);
    if (state.ascending) track.orbitCameraWorldFrame = false;
    const nowMs = performance.now();
    const frameDurationMs = Number.isFinite(lastCameraUpdateMs)
      ? Cesium.Math.clamp(nowMs - lastCameraUpdateMs, 4, 50)
      : 1000 / 60;
    lastCameraUpdateMs = nowMs;
    track.lastCameraHeading = smoothReplayCameraHeading(
      track.lastCameraHeading,
      desiredHeading,
      Cesium.Math.toRadians(2) * frameDurationMs / (1000 / 60),
    );
    const cartographic = Cesium.Ellipsoid.WGS84.cartesianToCartographic(position);
    const altitude = Math.max(0, cartographic?.height || 0);
    const cameraView = replayCameraView(state, altitude);
    const defaultOrbitTarget = !state.ascending
      ? replayOrbitGlobeAnchor(position, orbitBlend)
      : position;
    const cameraTarget = !state.ascending
      ? replayOrbitCameraTarget(
        defaultOrbitTarget,
        track.orbitFrameSphere?.center,
        orbitBlend,
      )
      : defaultOrbitTarget;
    const cameraRange = !state.ascending
      ? replayOrbitGlobeRange(
        cameraView.range,
        altitude,
        orbitBlend,
        track.orbitFrameSphere?.radius,
      )
      : cameraView.range;
    if (state.ascending) {
      S._viewer.camera.lookAt(
        cameraTarget,
        new Cesium.HeadingPitchRange(
          track.lastCameraHeading,
          cameraView.pitch,
          cameraRange,
        ),
      );
    } else {
      const tangentStep = Math.max(0.002, 0.8 / Math.max(2, path.length - 1));
      const tangentProgress = Math.min(1, state.phaseProgress + tangentStep);
      const tangentPosition = samplePath(
        path,
        tangentProgress > state.phaseProgress
          ? tangentProgress
          : Math.max(0, state.phaseProgress - tangentStep),
      );
      const orbitPose = replayOrbitCameraPose(
        position,
        tangentPosition,
        cameraTarget,
        cameraRange,
        cameraView.pitch,
      );
      if (orbitPose) {
        if (!track.orbitCameraWorldFrame) {
          S._viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          track.orbitCameraWorldFrame = true;
        }
        S._viewer.camera.setView({
          destination: orbitPose.destination,
          orientation: {
            direction: orbitPose.direction,
            up: orbitPose.up,
          },
        });
      }
    }
    if (state.elapsedSinceStart >= ascentDurationSec
      + REPLAY_ORBIT_DURATION_SEC) {
      stopMissionReplay();
    }
  });

  S._viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(track.ascentPath[0], 0),
    {
      offset: new Cesium.HeadingPitchRange(
        initialHeading,
        Cesium.Math.toRadians(-20),
        REPLAY_INITIAL_RANGE_M,
      ),
      duration: 1.4,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: () => {
        cameraReady = true;
      },
      cancel: () => {
        if (token === S._replayCameraToken && S._replayCameraLaunchId === launchId) stopMissionReplay();
      },
    },
  );
  return true;
}

const rocketLaunchesLayer = {
  ...LAYER_METADATA['rocket-launches'],
  updateInterval: 300000,

  init: initRocketLaunchesLayer,

  async enable() {
    S._enabled = true;
    holdContinuousRender('rocket-launches'); // per-frame animator (perf wave 2)
    S._lifecycleToken++;
    S._postTleRetryCount = 0;
    try {
      await this._enableBody();
    } catch (error) {
      // Enable is a transaction: a failed dependency must not leave mission
      // UI/datasource visible or the satellite snapshot retained (a retained
      // snapshot makes the next enable skip dependency capture entirely).
      try {
        await this.disable();
      } catch (cleanupError) {
        console.warn('[Missions] enable rollback failed:', cleanupError);
      }
      throw error;
    }
  },
  async _enableBody() {
    S._updateDirty = false;
    if (S._dataSource) S._dataSource.show = true;
    syncMissionOrbitPrimitiveVisibility();
    focusFullGlobe(S._viewer);
    document.getElementById('cockpit-context')?.setAttribute('hidden', '');
    if (S._selectedLaunchId) setSelectedMission(S._selectedLaunchId, S._explicitSelection);
    else setSelectedMission(null, false);
    await captureSatelliteDependency();
  },
  disable: disableRocketLaunchesLayer,

  update: updateRocketLaunchesLayer,

  /** Release only Space Mission camera ownership, preserving layer and selection state. */
  releaseCameraOwnership: releaseRocketLaunchesCameraOwnership,

  destroy: destroyRocketLaunchesLayer,

  getStats: getRocketLaunchesStats,
  attachDataManager: attachRocketLaunchesDataManager,
};

export default rocketLaunchesLayer;
