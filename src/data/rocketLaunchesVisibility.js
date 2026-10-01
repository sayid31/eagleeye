// Moved out of rocketLaunches.js (rocketLaunchesVisibility).

import * as Cesium from 'cesium';
import { LAUNCH_PAD_ZONE_MAX_CAMERA_DISTANCE_M, LAUNCH_PAD_ZONE_MAX_CAMERA_HEIGHT_M } from './rocketLaunchesConstants.js';
import { entityLaunchId, refreshSelectedMissionOverlayText } from './rocketLaunchesOverlay.js';
import { updateMissionTelemetry } from './rocketLaunchesPanel.js';
import { hideReplayVehicleOverlay, updateReplayVehicleOverlay } from './rocketLaunchesReplayVehicle.js';
import { S, _declutterOccluder, _declutterTime } from './rocketLaunchesState.js';

/**
 * Decide whether the selected launch-pad zone belongs in the current view.
 * Both altitude and direct camera range are bounded so an oblique close-up can
 * show the effect without leaking it into regional or globe views.
 * @param {object} input Visibility inputs.
 * @param {boolean} input.layerActive Whether Space Missions is active.
 * @param {string|null} input.selectedLaunchId Selected mission identifier.
 * @param {string} input.launchId Candidate mission identifier.
 * @param {number} input.cameraHeightM Camera height above the ellipsoid.
 * @param {number} input.cameraDistanceM Direct camera range to the launch pad.
 * @returns {boolean}
 */
export function launchPadZoneVisible({
  layerActive,
  selectedLaunchId,
  launchId,
  cameraHeightM,
  cameraDistanceM,
}) {
  return Boolean(
    layerActive
    && selectedLaunchId
    && selectedLaunchId === launchId
    && Number.isFinite(cameraHeightM)
    && cameraHeightM <= LAUNCH_PAD_ZONE_MAX_CAMERA_HEIGHT_M
    && Number.isFinite(cameraDistanceM)
    && cameraDistanceM <= LAUNCH_PAD_ZONE_MAX_CAMERA_DISTANCE_M,
  );
}

/**
 * Resolve whether a surface mission anchor is safely on the camera-facing
 * side of Earth. The small positive limb margin prevents labels anchored just
 * beyond the horizon from leaking through the hidden Cesium globe.
 * @param {Cesium.Cartesian3} cameraPosition Camera world position.
 * @param {Cesium.Cartesian3} markerPosition Mission anchor world position.
 * @param {number} [limbMargin] Additional normalized horizon clearance.
 * @returns {boolean} Whether the marker belongs on the visible hemisphere.
 */
export function missionAnchorHorizonVisible(cameraPosition, markerPosition, limbMargin = 0.012) {
  if (!cameraPosition || !markerPosition) return false;
  const cameraMagnitude = Cesium.Cartesian3.magnitude(cameraPosition);
  if (!Number.isFinite(cameraMagnitude) || cameraMagnitude <= Cesium.Ellipsoid.WGS84.maximumRadius) {
    return false;
  }
  const cameraDirection = Cesium.Cartesian3.normalize(
    cameraPosition,
    new Cesium.Cartesian3(),
  );
  const markerDirection = Cesium.Cartesian3.normalize(
    markerPosition,
    new Cesium.Cartesian3(),
  );
  const limbThreshold = Cesium.Ellipsoid.WGS84.maximumRadius / cameraMagnitude;
  return Cesium.Cartesian3.dot(cameraDirection, markerDirection)
    > limbThreshold + limbMargin;
}

/**
 * Resolve launch-anchor visibility for overview and selected-mission views.
 * @param {Cesium.Cartesian3} cameraPosition Camera world position.
 * @param {Cesium.Cartesian3} markerPosition Mission anchor world position.
 * @param {string} markerId Mission represented by this anchor.
 * @param {string|null} selectedLaunchId Explicitly selected mission.
 * @returns {boolean} Whether the launch anchor should render.
 */
export function missionAnchorVisible(
  cameraPosition,
  markerPosition,
  markerId,
  selectedLaunchId = null,
) {
  if (selectedLaunchId && markerId !== selectedLaunchId) return false;
  return missionAnchorHorizonVisible(cameraPosition, markerPosition);
}

function setGraphicVisibility(graphic, visible, time) {
  if (!graphic) return;
  const next = Boolean(visible);
  const current = graphic.show?.getValue?.(time);
  if (current !== next) graphic.show = next;
}

export function updateMissionFrame() {
  if (!S._enabled || !S._viewer || !S._dataSource?.show) {
    hideReplayVehicleOverlay();
    return;
  }
  updateMissionTelemetry();
  const time = Cesium.JulianDate.now(_declutterTime);
  _declutterOccluder.cameraPosition = S._viewer.scene.camera.positionWC;
  updateReplayVehicleOverlay(_declutterOccluder);
  refreshSelectedMissionOverlayText();
  for (const entity of S._dataSource.entities.values) {
    if (!entity.show) continue;
    if (!entity.position) continue;
    const id = entityLaunchId(entity);
    if (!id) continue;
    const position = entity.position.getValue(time);
    let horizonVisible = Boolean(position && _declutterOccluder.isPointVisible(position));
    const launchAnchor = entity.id.startsWith('rocket-launch:');
    if (launchAnchor) {
      horizonVisible = missionAnchorVisible(
        S._viewer.scene.camera.positionWC,
        position,
        id,
        S._selectedLaunchId,
      );
      // Keep entity.show reserved for mission-selection isolation. Horizon
      // state is applied to the individual graphics below so a rear-side
      // anchor remains eligible for reevaluation as the camera moves.
    }
    if (entity.point) {
      setGraphicVisibility(entity.point, horizonVisible, time);
    }
    if (launchAnchor && entity.billboard) {
      setGraphicVisibility(
        entity.billboard,
        horizonVisible && id === S._hoveredRosterLaunchId,
        time,
      );
    }
  }
}
