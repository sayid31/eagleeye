// Moved out of radio.js (radioCamera).

import { GLOBE_ENTER_CLEARANCE_PX, earthDiscScreenRadius, getKeyholeGeometry, isFullGlobeInsideKeyhole, projectEarthDiscToViewport } from '../celestialRing.js';
import { radioGlobeNeedsRecentering, radioGlobeRecenterHeight, radioStationCameraPlan } from './radioTunerMath.js';
import * as Cesium from 'cesium';
import { S, _radioEarthScreenCenter, _radioEarthToCenter } from './radioState.js';

export function radioCameraState(camera = S._viewer?.camera) {
  if (!camera) return null;
  return {
    height: camera.positionCartographic?.height,
    heading: camera.heading,
    pitch: camera.pitch,
    roll: camera.roll,
  };
}

/** Radio may move the globe only while no tracked entity owns the follow camera. */
export function radioCameraNavigationAllowed(viewer = S._viewer) {
  return Boolean(viewer?.camera) && !viewer.trackedEntity;
}

function radioGlobeRecenterPlan(viewer = S._viewer) {
  const camera = viewer?.camera;
  const canvas = viewer?.scene?.canvas;
  const width = canvas?.clientWidth || canvas?.width;
  const height = canvas?.clientHeight || canvas?.height;
  const cartographic = camera?.positionCartographic;
  if (!camera || !cartographic || !(width > 0) || !(height > 0)) return null;
  const geometry = projectEarthDiscToViewport(
    viewer,
    width,
    height,
    _radioEarthScreenCenter,
    _radioEarthToCenter,
  );
  let fullGlobeCapable = false;
  if (geometry) {
    if (!radioGlobeNeedsRecentering(geometry)) return null;
    fullGlobeCapable = isFullGlobeInsideKeyhole({
      ...geometry,
      earthCenterX: geometry.keyholeCenterX,
      earthCenterY: geometry.keyholeCenterY,
    }, false);
  } else {
    const earthRadius = earthDiscScreenRadius(
      Cesium.Cartesian3.magnitude(camera.positionWC),
      height,
      camera.frustum?.fovy,
    );
    const facingEarthCenter = Cesium.Cartesian3.dot(
      camera.directionWC,
      _radioEarthToCenter,
    ) > 0;
    if (!earthRadius || facingEarthCenter) return null;
    const keyhole = getKeyholeGeometry(width, height);
    fullGlobeCapable = earthRadius + GLOBE_ENTER_CLEARANCE_PX <= keyhole.radius;
  }
  const recenterHeight = radioGlobeRecenterHeight(
    cartographic.height,
    fullGlobeCapable,
  );
  if (recenterHeight == null) return null;
  return {
    destination: Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      recenterHeight,
    ),
    cameraState: {
      ...radioCameraState(camera),
      height: recenterHeight,
      heading: 0,
      pitch: -Cesium.Math.PI_OVER_TWO,
      roll: 0,
    },
  };
}

function radioCameraNavigationIsCurrent(navigation) {
  return Boolean(
    navigation
    && navigation.generation === S._radioCameraNavigationGeneration
    && S._enabled
    && radioCameraNavigationAllowed(S._viewer)
  );
}

export function cancelActiveRadioCameraFlight() {
  if (!S._activeRadioCameraFlight || !radioCameraNavigationAllowed(S._viewer)) return;
  S._activeRadioCameraFlight = null;
  S._viewer.camera.cancelFlight();
}

export function invalidateRadioCameraNavigation() {
  S._radioCameraNavigationGeneration += 1;
  cancelActiveRadioCameraFlight();
  S._activeRadioCameraFlight = null;
}

export function radioCameraNavigationOwnsSelection(navigation, station) {
  return Boolean(
    navigation
    && station
    && navigation.generation === S._radioCameraNavigationGeneration
    && navigation.target?.id === station.id
  );
}

function startRadioCameraFlight(navigation, options, onComplete) {
  if (!radioCameraNavigationIsCurrent(navigation)) return false;
  const token = ++S._radioCameraFlightSequence;
  S._activeRadioCameraFlight = { generation: navigation.generation, token };
  const finish = (completed) => {
    if (S._activeRadioCameraFlight?.token === token) S._activeRadioCameraFlight = null;
    if (completed && radioCameraNavigationIsCurrent(navigation)) onComplete?.();
  };
  S._viewer.camera.flyTo({
    ...options,
    complete: () => finish(true),
    cancel: () => finish(false),
  });
  return true;
}

function focusRadioNavigationTarget(navigation) {
  if (!radioCameraNavigationIsCurrent(navigation) || !navigation.target) return false;
  const plan = radioStationCameraPlan(navigation.target, navigation.cameraState);
  if (!plan) return false;
  navigation.phase = 'focusing';
  return startRadioCameraFlight(navigation, {
    destination: Cesium.Cartesian3.fromDegrees(plan.lon, plan.lat, plan.height),
    orientation: { heading: plan.heading, pitch: plan.pitch, roll: plan.roll },
    duration: navigation.duration,
  }, () => {
    navigation.phase = 'settled';
  });
}

export function beginRadioCameraNavigation(cameraState = null) {
  const generation = ++S._radioCameraNavigationGeneration;
  if (!radioCameraNavigationAllowed(S._viewer) || !S._enabled) return null;
  cancelActiveRadioCameraFlight();
  const recenterPlan = radioGlobeRecenterPlan(S._viewer);
  return {
    generation,
    phase: 'idle',
    recentered: false,
    recenterPlan,
    cameraState: recenterPlan?.cameraState || cameraState || radioCameraState(),
    target: null,
    duration: 0.35,
  };
}

export function rotateRadioStationIntoView(
  station,
  duration = 0.35,
  cameraState = null,
  navigation = null,
) {
  const activeNavigation = navigation || beginRadioCameraNavigation(cameraState);
  if (!station || !radioCameraNavigationIsCurrent(activeNavigation)) return false;
  activeNavigation.target = station;
  activeNavigation.duration = duration;
  if (activeNavigation.phase === 'recentering') return true;
  if (activeNavigation.phase === 'focusing') cancelActiveRadioCameraFlight();
  if (activeNavigation.recenterPlan && !activeNavigation.recentered) {
    activeNavigation.phase = 'recentering';
    const recenterDuration = Math.min(0.9, Math.max(0.65, duration));
    return startRadioCameraFlight(activeNavigation, {
      destination: activeNavigation.recenterPlan.destination,
      orientation: {
        heading: activeNavigation.cameraState.heading,
        pitch: activeNavigation.cameraState.pitch,
        roll: activeNavigation.cameraState.roll,
      },
      duration: recenterDuration,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    }, () => {
      activeNavigation.recentered = true;
      activeNavigation.phase = 'idle';
      focusRadioNavigationTarget(activeNavigation);
    });
  }
  return focusRadioNavigationTarget(activeNavigation);
}
