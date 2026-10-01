// Moved out of gevActions.js (gevActionsCamera).

import * as Cesium from 'cesium';
import { getNextIssPass } from '../data/satellites.js';
import { isPickedWorldPosition } from '../data/scenePick.js';
import { viewTargetCache } from './gevActionsConstants.js';
import { compassDir } from './gevActionsNormalize.js';

/**
 * Voice scene playback control. Playback is fire-and-forget: startScene
 * sequences shots for minutes and must not block the realtime tool loop.
 */
export function controlScene(sceneDirector, args = {}) {
  if (!sceneDirector) {
    return { ok: false, action: 'control_scene', error: 'Scene director unavailable' };
  }
  const sceneAction = String(args.action || '').toLowerCase();

  if (sceneAction === 'list') {
    return { ok: true, action: 'control_scene', scenes: sceneDirector.listScenes(), ...sceneDirector.getPlaybackStatus() };
  }
  if (sceneAction === 'status') {
    return { ok: true, action: 'control_scene', ...sceneDirector.getPlaybackStatus() };
  }
  if (sceneAction === 'stop') {
    sceneDirector.stopScene('Stopped by voice');
    return { ok: true, action: 'control_scene', running: false };
  }
  if (sceneAction === 'next') {
    sceneDirector.runNextScene();
    return { ok: true, action: 'control_scene', advanced: true };
  }
  if (sceneAction === 'play') {
    if (sceneDirector.running) {
      return { ok: false, action: 'control_scene', error: 'A scene is already running — stop it first' };
    }
    const scene = args.sceneId
      ? sceneDirector.findSceneByQuery(args.sceneId)
      : (sceneDirector.listScenes()[0] || null);
    if (!scene) {
      return { ok: false, action: 'control_scene', error: `No scene matched "${args.sceneId || ''}"`, scenes: sceneDirector.listScenes() };
    }
    void sceneDirector.startScene(scene.id, { single: true });
    return { ok: true, action: 'control_scene', playing: scene.title, shots: scene.shots };
  }
  throw new Error(`Unknown scene action: ${args.action || 'missing'}`);
}

export function installViewTargetPrewarm(viewer) {
  if (viewer.__gevViewTargetPrewarmInstalled) return;
  viewer.__gevViewTargetPrewarmInstalled = true;
  let timer = null;
  let reportedPrewarmFailure = false;
  viewer.camera.moveEnd.addEventListener(() => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      // Belt and braces. Validating the pick is the fix; this catch exists
      // because an idle callback is an UNCAUGHT context — nothing above it can
      // handle a surprise from the scene graph, and a red console error on a
      // plain camera flight is worse than a cold cache. Reported once per
      // viewer so a repeating cause cannot spam the console.
      const warm = () => {
        try {
          getViewTargetCartographic(viewer);
        } catch (error) {
          if (reportedPrewarmFailure) return;
          reportedPrewarmFailure = true;
          console.debug('[Voice] view-target prewarm skipped:', error?.message || error);
        }
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warm, { timeout: 500 });
      } else {
        warm();
      }
    }, 120);
  });
}

export function adjustCameraZoom(viewer, args) {
  const direction = String(args.direction || '').toLowerCase();
  if (direction !== 'in' && direction !== 'out') {
    throw new Error('adjust_camera_zoom direction must be "in" or "out"');
  }

  const amount = String(args.amount || 'little').toLowerCase();
  const fraction = {
    little: 0.25,
    medium: 0.55,
    lot: 1.0,
  }[amount];
  if (!fraction) throw new Error(`Unknown zoom amount: ${args.amount}`);

  const camera = viewer.camera;
  const beforePosition = Cesium.Cartesian3.clone(camera.positionWC);
  const beforeHeightM = camera.positionCartographic.height;
  const target = getViewTargetCartesian(viewer);
  const targetDistanceM = target
    ? Cesium.Cartesian3.distance(beforePosition, target)
    : Math.max(100, beforeHeightM);
  const minimumDistanceM = direction === 'in' ? 20 : 50;
  const movementM = Math.max(minimumDistanceM, targetDistanceM * fraction);

  camera.cancelFlight();
  if (direction === 'out') {
    camera.zoomOut(movementM);
  } else {
    const safeMovementM = Math.min(movementM, Math.max(0, targetDistanceM - 25));
    if (safeMovementM <= 0) {
      return {
        ok: false,
        action: 'adjust_camera_zoom',
        direction,
        amount,
        error: 'Camera is already at the minimum target distance',
      };
    }
    camera.zoomIn(safeMovementM);
  }
  viewer.scene.requestRender();

  const afterPosition = camera.positionWC;
  const movedM = Cesium.Cartesian3.distance(beforePosition, afterPosition);
  const afterHeightM = camera.positionCartographic.height;
  const moved = movedM >= 0.5;
  return {
    ok: moved,
    action: 'adjust_camera_zoom',
    direction,
    amount,
    movementRequestedM: Math.round(movementM),
    movementActualM: Math.round(movedM),
    beforeHeightM: Math.round(beforeHeightM),
    afterHeightM: Math.round(afterHeightM),
    error: moved ? null : 'Cesium camera position did not change',
  };
}

export function nextIssPass(viewer, args) {
  let latDeg = Number.isFinite(args.latitude) ? args.latitude : null;
  let lonDeg = Number.isFinite(args.longitude) ? args.longitude : null;
  if (latDeg == null || lonDeg == null) {
    const carto = viewer?.camera?.positionCartographic;
    if (!carto) throw new Error('Camera position unavailable');
    latDeg = Cesium.Math.toDegrees(carto.latitude);
    lonDeg = Cesium.Math.toDegrees(carto.longitude);
  }
  const minElevDeg = Number.isFinite(args.minElevationDeg) ? args.minElevationDeg : 10;
  const result = getNextIssPass({ latDeg, lonDeg, minElevDeg });
  if (result.status === 'no-tle') {
    return {
      ok: false,
      action: 'next_iss_pass',
      error: 'ISS orbital elements not loaded yet — enable the satellites layer once, then ask again.',
    };
  }
  if (result.status === 'none') {
    return {
      ok: false,
      action: 'next_iss_pass',
      error: `No ISS pass above ${minElevDeg}° in the next 24 hours for this location.`,
    };
  }
  const { pass } = result;
  return {
    ok: true,
    action: 'next_iss_pass',
    observer: { latitude: latDeg, longitude: lonDeg },
    riseIso: new Date(pass.riseMs).toISOString(),
    minutesFromNow: Math.round((pass.riseMs - Date.now()) / 60000),
    durationMin: Math.max(1, Math.round((pass.setMs - pass.riseMs) / 60000)),
    peakElevationDeg: Math.round(pass.maxElevDeg),
    riseDirection: compassDir(pass.riseAzDeg),
  };
}

// Exported for gevGeocodeContext.js's nearbyKnownLandmarks (moved there) —
// centerMatchesSubject above stays in this file and keeps its own call site,
// same split-import shape as controlRadio's normalizeLocationId.
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => Cesium.Math.toRadians(value);
  const radiusKm = 6371.0088;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Exported for gevGeocodeContext.js's getBasemapLabelContext/getEntityContext
// helpers (moved there) — installViewTargetPrewarm and getEntityContext below
// stay in this file and keep their own call sites, same split-import shape.
export function getViewTargetCartographic(viewer) {
  const signature = cameraViewSignature(viewer);
  const cached = viewTargetCache.get(viewer);
  if (cached?.signature === signature && performance.now() - cached.cachedAt < 2500) {
    return cached.target;
  }
  const position = getViewTargetCartesian(viewer);
  // `fromCartesian` still returns undefined for a point too near the ellipsoid
  // center to project; normalize that to the same "no target" null the callers
  // already handle for a missed pick.
  const target = position ? (Cesium.Cartographic.fromCartesian(position) || null) : null;
  viewTargetCache.set(viewer, {
    signature,
    target,
    cachedAt: performance.now(),
  });
  return target;
}

function cameraViewSignature(viewer) {
  const camera = viewer.camera;
  const cartographic = camera.positionCartographic;
  return [
    Cesium.Math.toDegrees(cartographic.latitude).toFixed(5),
    Cesium.Math.toDegrees(cartographic.longitude).toFixed(5),
    Math.round(cartographic.height / 2),
    camera.heading.toFixed(3),
    camera.pitch.toFixed(3),
  ].join(':');
}

/**
 * World position under the center of the viewport, or null when the view has no
 * target. Each stage of the cascade is validated before it is accepted: a depth
 * pick over empty sky can return a NaN or center-of-the-earth Cartesian, and
 * converting one of those throws deep inside Cesium. A degenerate pick is a
 * MISSED pick, so it falls through to the next stage rather than poisoning
 * every caller downstream.
 */
export function getViewTargetCartesian(viewer) {
  const scene = viewer.scene;
  const canvas = scene.canvas;
  const width = canvas.clientWidth || canvas.width || 0;
  const height = canvas.clientHeight || canvas.height || 0;
  const center = new Cesium.Cartesian2(width / 2, height / 2);
  let position = null;

  if (scene.pickPositionSupported && typeof scene.pickPosition === 'function') {
    try {
      position = scene.pickPosition(center);
    } catch {
      position = null;
    }
  }

  if (!isPickedWorldPosition(position)
    && viewer.camera && typeof viewer.camera.pickEllipsoid === 'function') {
    try {
      position = viewer.camera.pickEllipsoid(center, Cesium.Ellipsoid.WGS84);
    } catch {
      position = null;
    }
  }

  if (!isPickedWorldPosition(position)
    && viewer.camera && typeof viewer.camera.getPickRay === 'function') {
    try {
      const ray = viewer.camera.getPickRay(center);
      position = scene.globe?.pick(ray, scene) || null;
    } catch {
      position = null;
    }
  }

  return isPickedWorldPosition(position) ? position : null;
}

export function approximateCoordinateDistanceSq(latA, lonA, latB, lonB) {
  const latDelta = latB - latA;
  const lonDelta = (lonB - lonA) * Math.cos(Cesium.Math.toRadians((latA + latB) / 2));
  return latDelta * latDelta + lonDelta * lonDelta;
}

export function polygonCenter(entity, now) {
  const hierarchy = entity.polygon?.hierarchy?.getValue?.(now);
  const positions = hierarchy?.positions;
  if (!positions?.length) return null;
  return Cesium.BoundingSphere.fromPoints(positions).center;
}
