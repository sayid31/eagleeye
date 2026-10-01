// Moved out of rocketLaunches.js (rocketLaunchesFocus).

import * as Cesium from 'cesium';
import { getKeyholeGeometry } from '../celestialRing.js';
import { stopMissionReplay } from './rocketLaunches.js';
import { MISSION_FOCUS_RANGE_M } from './rocketLaunchesConstants.js';
import { syncMissionOrbitPrimitiveVisibility } from './rocketLaunchesOrbit.js';
import { entityLaunchId, syncMissionOverlayEntries } from './rocketLaunchesOverlay.js';
import { clearMissionRosterHover, renderMissionPanel } from './rocketLaunchesPanel.js';
import { startMissionZoomAnchor, stopMissionZoomAnchor } from './rocketLaunchesReplayControls.js';
import { S, _animationStarts } from './rocketLaunchesState.js';

export function focusFullGlobe(viewer, duration = 2.4) {
  const canvas = viewer?.scene?.canvas;
  const height = canvas?.clientHeight || canvas?.height;
  const width = canvas?.clientWidth || canvas?.width;
  const cartographic = viewer?.camera?.positionCartographic;
  const fovy = viewer?.camera?.frustum?.fovy;
  if (!(width > 0) || !(height > 0) || !cartographic || !Number.isFinite(fovy) || fovy <= 0 || fovy >= Math.PI) return;
  const earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
  const keyholeRadius = getKeyholeGeometry(width, height).radius;
  const targetScreenRadius = keyholeRadius * 0.61;
  const angularRadius = Math.atan((targetScreenRadius / (height * 0.5)) * Math.tan(fovy * 0.5));
  const distance = earthRadius / Math.max(Math.sin(angularRadius), 1e-4);
  const altitude = Math.max(earthRadius * 1.55, distance - earthRadius);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, altitude),
    orientation: { heading: viewer.camera.heading, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    duration,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });
}

export function setSelectedMission(launchId, isolate = true) {
  if (launchId) clearMissionRosterHover();
  if (S._replayCameraLaunchId && S._replayCameraLaunchId !== launchId) stopMissionReplay();
  if (S._missionZoomAnchorId && S._missionZoomAnchorId !== launchId) stopMissionZoomAnchor();
  S._selectedLaunchId = launchId;
  S._explicitSelection = Boolean(launchId && isolate);
  if (launchId) _animationStarts.set(launchId, Date.now());
  if (!launchId && S._viewer) {
    stopMissionZoomAnchor();
    S._viewer.selectedEntity = undefined;
  }
  if (!S._dataSource) return;
  for (const entity of S._dataSource.entities.values) {
    const relatedId = entityLaunchId(entity);
    entity.show = launchId
      ? relatedId === launchId
      : entity.id.startsWith('rocket-launch:');
  }
  syncMissionOrbitPrimitiveVisibility();
  syncMissionOverlayEntries();
  renderMissionPanel();
}

export function focusMission(launch) {
  if (!S._viewer || !launch) return;
  stopMissionZoomAnchor();
  S._viewer.selectedEntity = S._dataSource.entities.getById(`rocket-launch:${launch.id}`);
  const orbitEntity = S._dataSource.entities.getById(`rocket-orbit:${launch.id}`);
  const orbitPositions = orbitEntity?.polyline?.positions?.getValue(Cesium.JulianDate.now());
  const launchPosition = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  let range = 18000000;
  if (orbitPositions?.length > 1) {
    const canvas = S._viewer.scene.canvas;
    const fovy = S._viewer.camera.frustum?.fovy || Cesium.Math.toRadians(60);
    const aspect = Math.max(0.1, (canvas.clientWidth || canvas.width) / Math.max(1, canvas.clientHeight || canvas.height));
    const fovx = 2 * Math.atan(Math.tan(fovy * 0.5) * aspect);
    const paddedHalfAngle = Math.min(fovy, fovx) * 0.5 * 0.62;
    const orbitExtent = orbitPositions.reduce(
      (largest, point) => Math.max(largest, Cesium.Cartesian3.distance(launchPosition, point)),
      0,
    );
    range = Math.max(
      orbitExtent / Math.max(Math.sin(paddedHalfAngle), 0.1),
      18000000,
    );
  }
  const targetNormal = Cesium.Cartesian3.normalize(launchPosition, new Cesium.Cartesian3());
  const destination = Cesium.Cartesian3.add(
    launchPosition,
    Cesium.Cartesian3.multiplyByScalar(targetNormal, range, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const direction = Cesium.Cartesian3.negate(targetNormal, new Cesium.Cartesian3());
  let right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(right) < 1e-8) {
    right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Y, right);
  }
  Cesium.Cartesian3.normalize(right, right);
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  S._viewer.camera.flyTo({
    destination,
    orientation: { direction, up },
    duration: 1.1,
    complete: () => {
      if (S._selectedLaunchId === launch.id) startMissionZoomAnchor(launch, range);
    },
  });
}

export function focusLaunchSite(launch) {
  if (!S._viewer || !launch) return;
  stopMissionReplay();
  stopMissionZoomAnchor();
  const launchPosition = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  S._viewer.selectedEntity = S._dataSource.entities.getById(`rocket-launch:${launch.id}`);
  S._viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(launchPosition, 0),
    {
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-42),
        MISSION_FOCUS_RANGE_M,
      ),
      duration: 1.4,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: () => {
        if (S._selectedLaunchId === launch.id) {
          startMissionZoomAnchor(launch, MISSION_FOCUS_RANGE_M);
        }
      },
    },
  );
}
