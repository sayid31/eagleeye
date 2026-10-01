// Moved out of rocketLaunches.js (rocketLaunchesLaunchPad).

import * as Cesium from 'cesium';
import { LAUNCH_PAD_ZONE_RADIUS_M } from './rocketLaunchesConstants.js';
import { updateMissionOrbitPrimitiveFrames } from './rocketLaunchesOrbit.js';
import { S, _missionRingDate } from './rocketLaunchesState.js';
import { launchPadZoneVisible } from './rocketLaunchesVisibility.js';

export function hideLaunchPadZone() {
  if (S._launchPadZonePrimitive) S._launchPadZonePrimitive.show = false;
}

function removeLaunchPadZonePrimitive() {
  if (S._launchPadZonePrimitive && S._viewer?.scene?.primitives) {
    S._viewer.scene.primitives.remove(S._launchPadZonePrimitive);
  }
  S._launchPadZonePrimitive = null;
  S._launchPadZoneLaunchId = null;
}

function createLaunchPadZonePrimitive(launch) {
  removeLaunchPadZonePrimitive();
  const material = new Cesium.Material({
    fabric: {
      type: 'GevLaunchPadZone',
      uniforms: {
        color: Cesium.Color.fromCssColorString('#22e6e6'),
        fillAlpha: 0.105,
        rimAlpha: 0.72,
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);
          vec2 centered = (materialInput.st - vec2(0.5)) * 2.0;
          float radius = length(centered);
          float inside = 1.0 - smoothstep(0.985, 1.0, radius);
          float rim = smoothstep(0.952, 0.985, radius) * inside;
          material.diffuse = color.rgb;
          material.emission = color.rgb * rim * 0.35;
          material.alpha = color.a * inside * mix(fillAlpha, rimAlpha, rim);
          return material;
        }`,
    },
  });
  const geometry = new Cesium.EllipseGeometry({
    center: Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat),
    semiMajorAxis: LAUNCH_PAD_ZONE_RADIUS_M,
    semiMinorAxis: LAUNCH_PAD_ZONE_RADIUS_M,
    granularity: Cesium.Math.toRadians(0.08),
    vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
  });
  S._launchPadZonePrimitive = S._viewer.scene.primitives.add(new Cesium.GroundPrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry,
      id: `rocket-pad-zone:${launch.id}`,
    }),
    appearance: new Cesium.MaterialAppearance({
      material,
      translucent: true,
      closed: false,
      faceForward: true,
      flat: true,
      // Keep the zone classified onto the photoreal surface, but bias only its
      // rasterized depth toward the camera. This avoids coplanar fragments
      // being intermittently buried by the launch-pad mesh at oblique angles
      // without adding a world-space height that would make the ring float.
      renderState: {
        depthTest: {
          enabled: true,
        },
        depthMask: false,
        polygonOffset: {
          enabled: true,
          factor: -1,
          units: -4,
        },
        blending: Cesium.BlendingState.ALPHA_BLEND,
      },
    }),
    classificationType: Cesium.ClassificationType.BOTH,
    asynchronous: true,
    show: true,
  }));
  S._launchPadZoneLaunchId = launch.id;
}

export function initLaunchPadZonePrimitive() {
  if (!S._viewer || S._launchPadZoneRemover) return;
  S._launchPadZoneRemover = S._viewer.scene.preRender.addEventListener(() => {
    if (!S._enabled || !S._dataSource?.show) {
      hideLaunchPadZone();
      return;
    }
    const nowMs = Date.now();
    if (nowMs - S._lastMissionRingRotationMs >= 1000) {
      _missionRingDate.setTime(nowMs);
      updateMissionOrbitPrimitiveFrames(_missionRingDate);
      S._lastMissionRingRotationMs = nowMs;
    }
    const launch = S._launches.find((item) => item.id === S._selectedLaunchId);
    const camera = S._viewer?.camera;
    if (!launch || !camera) {
      hideLaunchPadZone();
      return;
    }
    const launchPosition = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
    const visible = launchPadZoneVisible({
      layerActive: Boolean(S._dataSource?.show),
      selectedLaunchId: S._selectedLaunchId,
      launchId: launch.id,
      cameraHeightM: camera.positionCartographic?.height,
      cameraDistanceM: Cesium.Cartesian3.distance(camera.positionWC, launchPosition),
    });
    if (!visible) {
      hideLaunchPadZone();
      return;
    }
    if (S._launchPadZoneLaunchId !== launch.id) createLaunchPadZonePrimitive(launch);
    S._launchPadZonePrimitive.show = true;
  });
}

export function destroyLaunchPadZonePrimitive() {
  if (S._launchPadZoneRemover) S._launchPadZoneRemover();
  S._launchPadZoneRemover = null;
  removeLaunchPadZonePrimitive();
}
