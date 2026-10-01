// Moved out of militaryAwareness.js (militaryAwarenessOverlay).

import { awarenessRefreshIntervalMs } from './militaryAwarenessPredicates.js';
import { celestialScreenAngle, getKeyholeGeometry } from '../celestialRing.js';
import * as Cesium from 'cesium';
import { AWARENESS_RADIUS_M, formatAwarenessDistance, formatAwarenessLabel } from './militaryAwarenessEngine.js';
import { bearingBetweenCoordinates } from '../cockpitMath.js';
import { governorRequestRender } from '../renderGovernor.js';
import { AWARENESS_PAGE_SIZE, CONTEXT_RIM_HEIGHT_M, DIRECTION_SCRATCH, SUBJECT_CARTOGRAPHIC_SCRATCH, TARGET_CARTOGRAPHIC_SCRATCH, state } from './militaryAwarenessConstants.js';

function ensureDirectionOverlay() {
  if (state.directionRoot || !state.viewer) return state.directionRoot;
  const root = document.createElement('div');
  root.id = 'military-awareness-direction-overlay';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');

  const compass = document.createElement('div');
  compass.className = 'military-awareness-compass-ring';
  const cardinals = [
    ['N', 0], ['E', 90], ['S', 180], ['W', 270],
  ];
  state.compassLabels = cardinals.map(([label, bearing]) => {
    const element = document.createElement('span');
    element.className = `military-awareness-compass-label cardinal-${label.toLowerCase()}`;
    element.textContent = label;
    element.dataset.bearing = String(bearing);
    root.appendChild(element);
    return element;
  });
  const heading = document.createElement('span');
  heading.className = 'military-awareness-compass-heading';
  root.append(compass, heading);

  state.directionMarkers = Array.from({ length: 3 }, () => {
    const marker = document.createElement('div');
    marker.className = 'military-awareness-direction-marker';
    const arrow = document.createElement('span');
    arrow.className = 'military-awareness-direction-arrow';
    arrow.textContent = '➜';
    const label = document.createElement('span');
    label.className = 'military-awareness-direction-label';
    marker.append(arrow, label);
    marker._arrow = arrow;
    marker._label = label;
    marker._lastAngle = 0;
    root.appendChild(marker);
    return marker;
  });

  state.compassRing = compass;
  state.compassHeading = heading;
  state.viewer.container.appendChild(root);
  state.directionRoot = root;
  return root;
}

export function scheduleDirectionOverlayUpdate(force = false) {
  if (state.directionFrame !== null || !state.enabled) return;
  const now = Date.now();
  if (!force && now - state.lastDirectionUpdateMs < awarenessRefreshIntervalMs(state.cameraMoving)) return;
  state.directionFrame = window.requestAnimationFrame(() => {
    state.directionFrame = null;
    state.lastDirectionUpdateMs = Date.now();
    updateDirectionOverlay();
  });
}

export function cancelDirectionOverlayUpdate() {
  if (state.directionFrame !== null) window.cancelAnimationFrame(state.directionFrame);
  state.directionFrame = null;
  state.lastDirectionUpdateMs = 0;
}

function updateDirectionOverlay() {
  const root = ensureDirectionOverlay();
  if (!root || !state.enabled || !state.subject?.position || !state.results) {
    if (root) root.hidden = true;
    return;
  }

  const canvas = state.viewer.scene.canvas;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  const geometry = getKeyholeGeometry(width, height);
  if (!(geometry.radius > 0)) {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  // Keep the compass comfortably inside the shader keyhole so its cardinals
  // remain visible around the subject instead of hiding under edge panels.
  const compassRadius = Math.max(120, Math.min(geometry.radius - 48, geometry.radius * 0.66));
  state.compassRing.style.left = `${geometry.centerX - compassRadius}px`;
  state.compassRing.style.top = `${geometry.centerY - compassRadius}px`;
  state.compassRing.style.width = `${compassRadius * 2}px`;
  state.compassRing.style.height = `${compassRadius * 2}px`;

  const cameraHeading = state.viewer.camera.heading || 0;
  const headingDeg = (Math.round(Cesium.Math.toDegrees(cameraHeading)) + 360) % 360;
  state.compassRing.style.setProperty('--compass-rotation', `${-headingDeg}deg`);
  state.compassHeading.textContent = `HDG ${String(headingDeg).padStart(3, '0')}°`;
  state.compassHeading.style.left = `${geometry.centerX}px`;
  state.compassHeading.style.top = `${geometry.centerY - compassRadius + 39}px`;
  for (const label of state.compassLabels) {
    const bearing = Cesium.Math.toRadians(Number(label.dataset.bearing));
    const angle = bearing - cameraHeading - Cesium.Math.PI_OVER_TWO;
    const labelRadius = compassRadius - 17;
    label.style.left = `${geometry.centerX + Math.cos(angle) * labelRadius}px`;
    label.style.top = `${geometry.centerY + Math.sin(angle) * labelRadius}px`;
  }

  const directionalCohort = state.results.cohorts.find((cohort) => cohort.id === state.subject.layerId)
    || state.results.cohorts.find((cohort) => cohort.id === 'military');
  const page = state.cohortPages.get(directionalCohort?.id) || 0;
  const military = directionalCohort?.summary.nearest.slice(page, page + AWARENESS_PAGE_SIZE) || [];
  for (let index = 0; index < state.directionMarkers.length; index++) {
    const marker = state.directionMarkers[index];
    const item = military[index];
    if (!item?.position) {
      marker.hidden = true;
      continue;
    }
    const direction = Cesium.Cartesian3.subtract(item.position, state.subject.position, DIRECTION_SCRATCH[index]);
    if (Cesium.Cartesian3.magnitudeSquared(direction) < 1) {
      marker.hidden = true;
      continue;
    }
    Cesium.Cartesian3.normalize(direction, direction);
    const projection = celestialScreenAngle(
      Cesium.Cartesian3.dot(direction, state.viewer.camera.rightWC),
      Cesium.Cartesian3.dot(direction, state.viewer.camera.upWC),
      marker._lastAngle,
    );
    if (projection.stable) marker._lastAngle = projection.angle;
    // Every detected contact shares the compass rim. Keeping the bearing
    // markers on one radius makes them read as compass contacts rather than
    // unconstrained labels floating over the map.
    const markerRadius = compassRadius;
    marker.style.left = `${geometry.centerX + Math.cos(projection.angle) * markerRadius}px`;
    marker.style.top = `${geometry.centerY + Math.sin(projection.angle) * markerRadius}px`;
    marker.style.opacity = String(projection.opacity);
    marker._arrow.style.transform = `translate(-50%, -50%) rotate(${projection.angle}rad)`;
    marker._label.style.transform = `translate(-50%, -50%) translate(${-Math.cos(projection.angle) * 56}px, ${-Math.sin(projection.angle) * 56}px)`;
    const label = formatAwarenessLabel(item);
    const subjectCartographic = Cesium.Cartographic.fromCartesian(state.subject.position, undefined, SUBJECT_CARTOGRAPHIC_SCRATCH);
    const targetCartographic = Cesium.Cartographic.fromCartesian(item.position, undefined, TARGET_CARTOGRAPHIC_SCRATCH[index]);
    const bearing = subjectCartographic && targetCartographic
      ? bearingBetweenCoordinates(
        Cesium.Math.toDegrees(subjectCartographic.latitude),
        Cesium.Math.toDegrees(subjectCartographic.longitude),
        Cesium.Math.toDegrees(targetCartographic.latitude),
        Cesium.Math.toDegrees(targetCartographic.longitude),
      )
      : null;
    const bearingText = Number.isFinite(bearing) ? `BRG ${String(Math.round(bearing)).padStart(3, '0')}°` : 'BRG —';
    const courseText = Number.isFinite(item.track) ? ` · CRS ${String(Math.round(item.track)).padStart(3, '0')}°` : '';
    marker._label.textContent = `${label} · ${formatAwarenessDistance(item.distanceM)}\n${bearingText}${courseText}`;
    marker.hidden = false;
  }
}

export function clearVisual() {
  if (state.visual?.entities && state.viewer) {
    for (const entity of state.visual.entities) state.viewer.entities.remove(entity);
    // Idle mode renders only on request; a removed ring must not linger.
    governorRequestRender('awareness-visual');
  }
  state.visual = null;
}

export function renderVisual(subject) {
  if (!state.viewer || !subject?.position) return;
  const cartographic = Cesium.Cartographic.fromCartesian(subject.position);
  if (!cartographic) return;
  const groundCenter = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0);
  const key = `${subject.layerId}:${subject.id}`;
  if (state.visual?.key === key) {
    // Large ellipse geometry is more reliable as a ConstantPositionProperty.
    // Move it only after a meaningful displacement so live tracking does not
    // churn ten large geometries for sub-pixel motion every 750 ms.
    if (Cesium.Cartesian3.distance(state.visual.center, groundCenter) >= 250) {
      for (const entity of state.visual.entities) entity.position.setValue(groundCenter);
      Cesium.Cartesian3.clone(groundCenter, state.visual.center);
      // Content actually changed — buy exactly one frame instead of holding.
      governorRequestRender('awareness-visual');
    }
    return;
  }
  clearVisual();

  const entities = [];

  entities.push(state.viewer.entities.add({
    position: groundCenter,
    ellipse: {
      semiMajorAxis: AWARENESS_RADIUS_M,
      semiMinorAxis: AWARENESS_RADIUS_M,
      fill: false,
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#62b5ff').withAlpha(0.72),
      height: CONTEXT_RIM_HEIGHT_M,
    },
  }));

  state.visual = { key, entities, center: Cesium.Cartesian3.clone(groundCenter) };
  governorRequestRender('awareness-visual');
}
