// Projection plane creation/placement and its test hooks.

import * as Cesium from 'cesium';
import { CCTV_PROJECTION_OVERLAY_SOURCE_ID, CCTV_PROJECTION_OVERLAY_SOURCE_OPTIONS, PLANE_OUTLINE_COLOR } from './cctvConstants.js';
import { computeFrustumGeometry, frustumCartesians, planeOrientationFor } from './cctvGeometry.js';
import { groundAltFor } from './cctvGround.js';
import { drawProjectionFrame, refreshProjectionTextures } from './cctvProjectionFrames.js';
import { createProjectionProxyVideo, destroyProjectionRuntime } from './cctvProjectionRuntime.js';
import { S } from './cctvState.js';

/**
 * Build the protected label associated with one active monitor plane.
 * @param {{cameraId: string, name: string, position: Cesium.Cartesian3|Function}} input
 * @returns {Object} Shared-host presentation entry.
 */
export function createCctvProjectionOverlayEntry({ cameraId, name, position }) {
  return {
    id: String(cameraId),
    position,
    variant: 'selected',
    selected: true,
    protected: true,
    paintLane: 'selected',
    collisionGroup: 'ambient-card',
    priority: Number.MAX_SAFE_INTEGER - 1,
    title: String(name || cameraId || 'CAMERA'),
    details: [],
    accent: '#6be8ff',
    interactive: false,
    gapPx: 6,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/**
 * Re-derives the monitor plane entity's placement (position, orientation,
 * dimensions) + label from the record's current frustum geometry, so the plane
 * always caps the wireframe exactly (corner rays terminate on its corners).
 * No-op when the record has no plane runtime (idle neighbors have no plane).
 * @param {Object} record - Camera record.
 */
export function updatePlanePlacement(record) {
  const runtime = record?.projection;
  if (!runtime?.planeEntity) return;
  const geometry = record.frustumGeometry
    || computeFrustumGeometry(record.camera, groundAltFor(record), record.probeClampRangeM);
  const positions = record.frustumPositions || frustumCartesians(geometry);
  runtime.planeEntity.position = positions.capCenter;
  runtime.planeEntity.orientation = planeOrientationFor(record.camera, positions.capCenter);
  if (runtime.planeEntity.plane) {
    runtime.planeEntity.plane.dimensions = new Cesium.Cartesian2(
      geometry.halfW * 2,
      geometry.halfH * 2
    );
  }
  if (runtime.labelPosition) {
    Cesium.Cartesian3.clone(positions.label, runtime.labelPosition);
  }
}

/**
 * Clear the active monitor-plane label source and ownership marker.
 */
export function clearProjectionOverlay() {
  S._cctvOverlayHost.clearSource(CCTV_PROJECTION_OVERLAY_SOURCE_ID);
  S._cctvOverlayHost.setVisible(CCTV_PROJECTION_OVERLAY_SOURCE_ID, false);
  S._projectionOverlayOwnerId = null;
}

/**
 * Shows/hides the monitor plane and its associated shared-host label.
 * @param {Object} runtime - Projection runtime.
 * @param {boolean} visible
 */
export function setPlaneVisible(runtime, visible) {
  if (!runtime) return;
  if (runtime.planeEntity) runtime.planeEntity.show = !!visible;
  if (visible && runtime.overlayEntry && runtime.cameraId) {
    if (S._projectionOverlayOwnerId !== runtime.cameraId) {
      S._cctvOverlayHost.setEntries(
        CCTV_PROJECTION_OVERLAY_SOURCE_ID,
        [runtime.overlayEntry],
        CCTV_PROJECTION_OVERLAY_SOURCE_OPTIONS,
      );
      S._cctvOverlayHost.setVisible(CCTV_PROJECTION_OVERLAY_SOURCE_ID, true);
      S._projectionOverlayOwnerId = runtime.cameraId;
    }
  } else if (S._projectionOverlayOwnerId === runtime.cameraId) {
    clearProjectionOverlay();
  }
}

/** Create the native monitor plane plus its cached host-label presentation. */
export function createProjectionPlane(record, runtime, geometry, positions) {
  runtime.labelPosition ||= new Cesium.Cartesian3();
  Cesium.Cartesian3.clone(positions.label, runtime.labelPosition);
  runtime.cameraId = String(record.camera.id);
  runtime.overlayEntry = createCctvProjectionOverlayEntry({
    cameraId: runtime.cameraId,
    name: record.camera.name,
    position: () => runtime.labelPosition,
  });
  runtime.planeEntity = S._viewer.entities.add({
    id: `cctv-${record.camera.id}-plane`,
    properties: { cctvCameraId: record.camera.id },
    show: false,
    position: positions.capCenter,
    orientation: planeOrientationFor(record.camera, positions.capCenter),
    plane: {
      plane: new Cesium.Plane(Cesium.Cartesian3.UNIT_Z, 0.0),
      dimensions: new Cesium.Cartesian2(geometry.halfW * 2, geometry.halfH * 2),
      material: runtime.planeMaterial,
      outline: true,
      outlineColor: PLANE_OUTLINE_COLOR,
    },
  });
  return runtime.planeEntity;
}

/**
 * Create the production monitor-plane/host-label pair without media setup.
 * @param {Object} viewer Cesium viewer seam.
 * @param {Object} record CCTV runtime record.
 * @returns {Object} Projection runtime.
 */
export function _createCctvProjectionPlaneForTest(viewer, record) {
  S._viewer = viewer;
  const geometry = record.frustumGeometry
    || computeFrustumGeometry(record.camera, groundAltFor(record), record.probeClampRangeM);
  const positions = record.frustumPositions || frustumCartesians(geometry);
  record.frustumGeometry = geometry;
  record.frustumPositions = positions;
  const runtime = {
    cameraId: String(record.camera.id),
    planeEntity: null,
    labelPosition: new Cesium.Cartesian3(),
    overlayEntry: null,
    planeMaterial: new Cesium.ColorMaterialProperty(Cesium.Color.WHITE),
  };
  createProjectionPlane(record, runtime, geometry, positions);
  record.projection = runtime;
  return runtime;
}

/**
 * Exercise the production geometry-to-plane-and-label cache update.
 * @param {Object} record CCTV runtime record.
 */
export function _updateCctvProjectionPlaneForTest(record) {
  updatePlanePlacement(record);
}

/**
 * Test-only seam for drawProjectionFrame (canvas paint of the current video
 * or image source — see its comments for why video mode never binds the
 * plane material to the HTMLVideoElement, 2026-09-22 fix).
 * @param {Object} record - Camera record with an initialized projection runtime.
 * @returns {void}
 */
export function _drawProjectionFrameForTest(record) {
  drawProjectionFrame(record);
}

/**
 * Test-only seam for refreshProjectionTextures. Image mode still swaps its
 * double buffer on a throttle; video mode is a no-op whenever a proxy video
 * exists (2026-09-28 fix) and only falls back to the double-buffer swap when
 * captureStream is unavailable — see its docstring for the full breakdown.
 * @param {Object} record - Camera record with an initialized projection runtime.
 * @returns {void}
 */
export function _refreshProjectionTexturesForTest(record) {
  refreshProjectionTextures(record);
}

/**
 * Test-only seam for createProjectionProxyVideo (2026-09-28 fix): creates
 * the hidden video-mode proxy <video> bound to `runtime.canvas.captureStream()`
 * and, on success, sets `runtime.proxyVideo`/`runtime.mirrorStream`.
 * @param {Object} runtime - Projection runtime (mode === 'video').
 * @returns {HTMLVideoElement|null} The proxy video, or null if unsupported.
 */
export function _createProjectionProxyVideoForTest(runtime) {
  return createProjectionProxyVideo(runtime);
}

/**
 * Test-only seam for destroyProjectionRuntime's teardown (hls.js detach,
 * proxy video/mirrorStream stop, plane entity removal).
 * @param {Object} runtime - Projection runtime to destroy.
 * @returns {void}
 */
export function _destroyProjectionRuntimeForTest(runtime) {
  destroyProjectionRuntime(runtime);
}
