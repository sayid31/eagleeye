// Moved out of radio.js (radioSelection).

import { markerPosition, radioCategoryColor, radioSelectionBracketSvg, radioStationCategoryId, rankRadioStationsForRequest, stationMatchesRadioCategory } from './radioTunerMath.js';
import { radioEntityHorizonVisible } from './radioOverlayEntries.js';
import { horizonOccluder } from './iconOrientation.js';
import * as Cesium from 'cesium';
import { warmGroundFloor } from './groundFloor.js';
import { beginRadioCameraNavigation, cancelActiveRadioCameraFlight, invalidateRadioCameraNavigation, radioCameraNavigationAllowed, radioCameraNavigationOwnsSelection, radioCameraState, rotateRadioStationIntoView } from './radioCamera.js';
import { RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M, RADIO_PREFIX, RADIO_TUNER_DIRECTORY_LIMIT, SELECTED_LIFT_M } from './radioConstants.js';
import { radioPresentationAllowed, scheduleRadioOverlayPublish, updateRenderVisibility } from './radioOverlay.js';
import { playSelectedRadio } from './radioPlayback.js';
import { emitState, rankedVisibleStations, resetRadioClusterOverlayIdentities, selectedPresentationStation, viewportRadioAnchor } from './radioSelectors.js';
import { S } from './radioState.js';
import { endRadioTuning } from './radioTuning.js';

export function updateSelectionEntity() {
  if (S._selectedEntity && S._viewer) S._viewer.entities.remove(S._selectedEntity);
  S._selectedEntity = null;
  const station = selectedPresentationStation();
  if (!radioPresentationAllowed() || !S._viewer || !station) {
    scheduleRadioOverlayPublish();
    return;
  }
  const selectionColor = radioCategoryColor(radioStationCategoryId(station));
  const bracketImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(radioSelectionBracketSvg(selectionColor))}`;
  const selectedPosition = markerPosition(station, SELECTED_LIFT_M);

  S._selectedEntity = S._viewer.entities.add({
    id: `${RADIO_PREFIX}selected:${station.id}`,
    position: selectedPosition,
    // Resolve horizon visibility at birth rather than inheriting Cesium's
    // default `true`. The shared pass that owns this flag is gated on camera
    // translation (radioOverlay.updateRenderVisibility + the 1 m epsilon in
    // radioCameraPositionChanged), so selecting a station while the camera is
    // stationary — voice command, tuner click, directory Next without rotate —
    // produced no scan at all, and a far-side selection drew its marker and
    // bracket through the globe until the camera next moved. Both parts use
    // disableDepthTestDistance: Infinity, so nothing else culls them.
    show: radioEntityHorizonVisible(
      S._viewer.camera ? horizonOccluder(S._viewer.camera) : null,
      selectedPosition,
    ),
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString(selectionColor),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
        0,
        RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
      ),
    },
    billboard: {
      image: bracketImage,
      width: 40,
      height: 40,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
        0,
        RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
      ),
      scaleByDistance: new Cesium.NearFarScalar(100_000, 1, 12_000_000, 0.72),
    },
  });
  scheduleRadioOverlayPublish();
}

function focusStation(station) {
  S._radioCameraNavigationGeneration += 1;
  if (!station || !radioCameraNavigationAllowed(S._viewer)) return false;
  cancelActiveRadioCameraFlight();
  S._viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(station.lon, station.lat, 85_000),
    duration: 1.1,
  });
  return true;
}

/** Select a station. Playback occurs only when autoplay is explicitly true. */
export function selectRadioStation(id, {
  autoplay = false,
  focus = false,
  origin = 'programmatic',
  attemptId = null,
  cameraNavigation = null,
} = {}) {
  if (!radioPresentationAllowed()) return false;
  const station = S._stationById.get(String(id));
  if (!station) return false;
  S._tuningUnavailableStationId = null;
  if (!radioCameraNavigationOwnsSelection(cameraNavigation, station)) {
    invalidateRadioCameraNavigation();
  }
  if (S._tuningActive || (S._tuningAwaitingStationId && S._tuningAwaitingStationId !== station.id)) endRadioTuning();
  S._cancelledTuningPresentationStation = null;
  S._selectedId = station.id;
  const generation = ++S._selectionGeneration;
  const sessionGeneration = S._sessionGeneration;
  updateSelectionEntity();
  warmGroundFloor([{ lat: station.lat, lon: station.lon }]);
  if (S._selectionTimer) clearTimeout(S._selectionTimer);
  S._selectionTimer = setTimeout(() => {
    S._selectionTimer = null;
    if (
      sessionGeneration === S._sessionGeneration
      && generation === S._selectionGeneration
      && S._selectedId === station.id
    ) updateSelectionEntity();
  }, 1300);
  if (focus) focusStation(station);
  emitState();
  if (autoplay) void playSelectedRadio({ origin, attemptId });
  return true;
}

/** Select the previous or next station and optionally retain a UI-owned band order. */
export function cycleRadioStation(direction = 1, {
  rotate = false,
  stationIds = null,
  autoplay = true,
  origin = 'programmatic',
} = {}) {
  if (!radioPresentationAllowed()) return false;
  const ranked = Array.isArray(stationIds) && stationIds.length
    ? stationIds
      .slice(0, RADIO_TUNER_DIRECTORY_LIMIT)
      .map((id) => S._stationById.get(String(id)))
      .filter((station) => station && stationMatchesRadioCategory(station, S._filter))
    : rankedVisibleStations();
  if (!ranked.length) return false;
  const current = ranked.findIndex((station) => station.id === S._selectedId);
  const nextIndex = current < 0
    ? 0
    : (current + (direction < 0 ? -1 : 1) + ranked.length) % ranked.length;
  S._playFallbackId = ranked.length > 1 ? ranked[(nextIndex + 1) % ranked.length].id : null;
  const rotationCameraState = rotate ? radioCameraState() : null;
  const rotationNavigation = rotate ? beginRadioCameraNavigation(rotationCameraState) : null;
  S._playFallbackFocus = rotate
    ? (fallbackStation) => {
      rotateRadioStationIntoView(fallbackStation, 0.65, rotationCameraState, rotationNavigation);
      return rotationNavigation;
    }
    : false;
  const station = ranked[nextIndex];
  if (rotate) rotateRadioStationIntoView(station, 0.65, rotationCameraState, rotationNavigation);
  return selectRadioStation(station.id, {
    autoplay,
    focus: false,
    origin,
    cameraNavigation: rotationNavigation,
  });
}

/** Select and optionally play the best station for a location/category request. */
export function selectRequestedRadioStation(criteria = {}, { autoplay = true, origin = 'programmatic' } = {}) {
  if (!radioPresentationAllowed()) return null;
  const requestedCategory = String(criteria.categoryId || 'all');
  const categoryId = S._categories.some((category) => category.id === requestedCategory)
    ? requestedCategory
    : 'all';
  setRadioFilter(categoryId);
  const ranked = rankRadioStationsForRequest(S._stations, {
    ...criteria,
    categoryId,
    anchor: criteria.anchor || viewportRadioAnchor(),
  });
  if (!ranked.length) return null;
  S._playFallbackId = ranked[1]?.id || null;
  S._playFallbackFocus = false;
  selectRadioStation(ranked[0].id, { autoplay, focus: false, origin });
  return ranked[0];
}

/** Change marker/list category without interrupting an active station. */
export function setRadioFilter(categoryId) {
  if (!radioPresentationAllowed()) return false;
  const valid = S._categories.some((category) => category.id === categoryId);
  const nextFilter = valid ? categoryId : 'all';
  const changed = nextFilter !== S._filter;
  if (changed && (S._tuningActive || S._tuningAwaitingStationId)) endRadioTuning();
  const clearsCancelledPresentation = Boolean(S._cancelledTuningPresentationStation);
  S._cancelledTuningPresentationStation = null;
  S._filter = nextFilter;
  if (clearsCancelledPresentation) updateSelectionEntity();
  if (changed) resetRadioClusterOverlayIdentities();
  updateRenderVisibility();
  if (changed && S._dataSource?.clustering?.enabled) {
    // Entity visibility changes do not invalidate Cesium's existing cluster
    // primitives. Toggle a public clustering input twice to mark the current
    // cluster set dirty without changing its effective configuration.
    const clusterPoints = S._dataSource.clustering.clusterPoints;
    S._dataSource.clustering.clusterPoints = !clusterPoints;
    S._dataSource.clustering.clusterPoints = clusterPoints;
    S._viewer?.scene?.requestRender();
  }
  scheduleRadioOverlayPublish();
  emitState();
  return true;
}
