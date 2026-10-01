// Moved out of rocketLaunches.js (rocketLaunchesLifecycle).

import * as Cesium from 'cesium';
import { releaseContinuousRender } from '../renderGovernor.js';
import { stopMissionReplay } from './rocketLaunches.js';
import { focusMission, setSelectedMission } from './rocketLaunchesFocus.js';
import { destroyLaunchPadZonePrimitive, hideLaunchPadZone, initLaunchPadZonePrimitive } from './rocketLaunchesLaunchPad.js';
import { removeMissionOrbitPrimitives, syncMissionOrbitPrimitiveVisibility } from './rocketLaunchesOrbit.js';
import { clearMissionOverlaySources, entityLaunchId } from './rocketLaunchesOverlay.js';
import { clearMissionRosterHover, createMissionPanel, renderMissionPanel } from './rocketLaunchesPanel.js';
import { stopMissionZoomAnchor } from './rocketLaunchesReplayControls.js';
import { createReplayVehicleOverlay, destroyReplayVehicleOverlay, hideReplayVehicleOverlay } from './rocketLaunchesReplayVehicle.js';
import { S, _animationStarts, _missionOverlayRecords, _replayTracks, _satelliteTelemetry } from './rocketLaunchesState.js';
import { clearPostTleRetry, restoreSatelliteDependency } from './rocketLaunchesUpdate.js';
import { updateMissionFrame } from './rocketLaunchesVisibility.js';

export function initRocketLaunchesLayer(viewer) {
    S._viewer = viewer;
    S._enabled = false;
    createMissionPanel();
    createReplayVehicleOverlay();
    S._dataSource = new Cesium.CustomDataSource('rocket-launches');
    S._dataSource.show = false;
    viewer.dataSources.add(S._dataSource);
    S._count = 0;
    S._lastUpdate = null;
    S._lastError = null;
    S._orbitMatches = 0;
    clearMissionOverlaySources();
    S._clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    S._clickHandler.setInputAction((movement) => {
      if (!S._enabled || !S._dataSource?.show) return;
      const entity = viewer.scene.drillPick(movement.position, 12)
        .map((picked) => picked?.id)
        .find((candidate) => entityLaunchId(candidate));
      const launchId = entityLaunchId(entity);
      if (!launchId) return;
      setSelectedMission(launchId);
      focusMission(S._launches.find((launch) => launch.id === launchId));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    S._moveHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    S._moveHandler.setInputAction((movement) => {
      if (!S._enabled || !S._dataSource?.show) return;
      const missionEntity = viewer.scene.drillPick(movement.endPosition, 12)
        .map((picked) => picked?.id)
        .find((candidate) => entityLaunchId(candidate));
      viewer.scene.canvas.style.cursor = missionEntity ? 'pointer' : '';
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    // Apply horizon visibility before Cesium traverses and picks the scene.
    // A postRender write is one frame late and can remain visibly stale when
    // request-on-demand rendering stops after a globe camera move.
    S._declutterHandler = viewer.scene.preRender.addEventListener(updateMissionFrame);
    initLaunchPadZonePrimitive();
  }

export async function disableRocketLaunchesLayer() {
    S._enabled = false;
    releaseContinuousRender('rocket-launches');
    S._lifecycleToken++;
    S._updateDirty = false;
    clearPostTleRetry();
    clearMissionRosterHover();
    stopMissionReplay();
    stopMissionZoomAnchor();
    if (S._dataSource) S._dataSource.show = false;
    syncMissionOrbitPrimitiveVisibility();
    if (S._viewer?.scene?.canvas) S._viewer.scene.canvas.style.cursor = '';
    hideLaunchPadZone();
    hideReplayVehicleOverlay();
    S._selectedLaunchId = null;
    clearMissionOverlaySources();
    await restoreSatelliteDependency();
    renderMissionPanel();
  }

export function releaseRocketLaunchesCameraOwnership() {
    clearMissionRosterHover();
    stopMissionReplay();
    stopMissionZoomAnchor();
  }

export async function destroyRocketLaunchesLayer(viewer) {
    releaseContinuousRender('rocket-launches'); // direct-destroy path (perf wave 2 fix)
    S._enabled = false;
    S._lifecycleToken++;
    S._updateDirty = false;
    await restoreSatelliteDependency();
    clearMissionRosterHover();
    stopMissionReplay();
    stopMissionZoomAnchor();
    clearPostTleRetry();
    if (S._clickHandler) S._clickHandler.destroy();
    S._clickHandler = null;
    if (S._moveHandler) S._moveHandler.destroy();
    S._moveHandler = null;
    if (S._declutterHandler) S._declutterHandler();
    S._declutterHandler = null;
    destroyLaunchPadZonePrimitive();
    removeMissionOrbitPrimitives();
    clearMissionOverlaySources();
    destroyReplayVehicleOverlay();
    S._launches = [];
    _missionOverlayRecords.clear();
    _animationStarts.clear();
    _satelliteTelemetry.clear();
    _replayTracks.clear();
    S._missionPanel?.remove();
    S._missionPanel = null;
    if (S._missionRoster) {
      S._missionRoster.onclick = null;
      S._missionRoster.onmouseover = null;
      S._missionRoster.onfocusin = null;
      S._missionRoster.onmouseleave = null;
      S._missionRoster.onfocusout = null;
    }
    S._missionRoster = null;
    S._viewer = null;
    if (S._dataSource) viewer.dataSources.remove(S._dataSource, true);
    S._dataSource = null;
    S._count = 0;
    S._orbitMatches = 0;
    S._lastUpdate = null;
    S._activeTleText = null;
    S._activeTlePromise = null;
    S._activeTlePromiseToken = 0;
    S._renderedTleText = null;
    S._postTleRetryCount = 0;
    S._satelliteStateBeforeMission = null;
    S._satelliteActivationPromise = null;
    S._dataManager = null;
  }

export function getRocketLaunchesStats() { return { count: S._count, orbitMatches: S._orbitMatches, lastUpdate: S._lastUpdate, error: S._lastError }; }

export function attachRocketLaunchesDataManager(dataManager) { S._dataManager = dataManager; }
