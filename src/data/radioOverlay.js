// Moved out of radio.js (radioOverlay).

import { createRadioClusterOverlayEntry, createRadioSelectedOverlayEntry, createRadioSingletonOverlayEntry, emptyRadioOverlayDiagnostics, radioCameraPositionChanged, radioEntityHorizonVisible, radioSingletonLabelLimit, reconcileRadioClusterCandidates, selectRadioClusterCandidates, selectRadioSingletonCandidates } from './radioOverlayEntries.js';
import { clearOverlaySource, setOverlayEntries, setOverlaySourceVisible } from '../overlays/worldOverlay.js';
import { buildRadioCategories, filterRadioStations, markerPosition, radioCategoryColor, radioClusterBadgeText, radioClusterCategoryId, radioStationCategoryId, radioStationIdFromPick, stationMatchesRadioCategory } from './radioTunerMath.js';
import * as Cesium from 'cesium';
import { horizonOccluder } from './iconOrientation.js';
import { governorRequestRender } from '../renderGovernor.js';
import { isOwnedByOtherLayer, registerPickOwner, resolvePickId, unregisterPickOwner } from './pickRegistry.js';
import { DEFAULT_RADIO_FILTER, HORIZON_TICK_MS, RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M, RADIO_OVERLAY_COHORT_LIMIT, RADIO_OVERLAY_SOURCE_ID, RADIO_OVERLAY_SOURCE_OPTIONS, RADIO_PICK_OFFSETS, RADIO_PREFIX, SELECTED_LIFT_M } from './radioConstants.js';
import { stopRadioPlayback } from './radioPlayback.js';
import { selectRadioStation, updateSelectionEntity } from './radioSelection.js';
import { resetRadioClusterOverlayIdentities, selectedPresentationStation } from './radioSelectors.js';
import { S } from './radioState.js';

function clusterPointCollection() {
  return S._dataSource?.clustering?._clusterPointCollection || null;
}

function publishRadioOverlayEntries() {
  S._overlayPublishTimer = null;
  if (!radioPresentationAllowed()) {
    resetRadioClusterOverlayIdentities();
    S._overlayDiagnostics = emptyRadioOverlayDiagnostics();
    clearOverlaySource(RADIO_OVERLAY_SOURCE_ID);
    setOverlaySourceVisible(RADIO_OVERLAY_SOURCE_ID, false);
    return;
  }

  const entries = [];
  const station = selectedPresentationStation();
  if (station) {
    const selectedEntry = createRadioSelectedOverlayEntry(
      station,
      markerPosition(station, SELECTED_LIFT_M),
    );
    if (selectedEntry) entries.push(selectedEntry);
  }

  const clusterCandidates = [];
  const clusteredStationIds = new Set();
  const points = clusterPointCollection();
  for (let index = 0; index < (points?.length || 0); index += 1) {
    const point = points.get(index);
    if (!point?.show || !point.position || !Array.isArray(point.id) || point.id.length < 3) continue;
    const stationIds = point.id
      .map((entity) => String(entity?.id || '').slice(RADIO_PREFIX.length))
      .filter((id) => {
        const station = S._stationById.get(id);
        return station && stationMatchesRadioCategory(station, S._filter);
      })
      .sort();
    if (stationIds.length < 3) continue;
    for (const stationId of stationIds) clusteredStationIds.add(stationId);
    const clusteredStations = stationIds.map((id) => S._stationById.get(id));
    const category = radioClusterCategoryId(clusteredStations, S._filter);
    clusterCandidates.push({
      id: `${stationIds[0]}:${stationIds.at(-1)}:${stationIds.length}`,
      stationIds,
      point,
      text: radioClusterBadgeText(category, stationIds.length),
      accent: radioCategoryColor(category),
      stationCount: stationIds.length,
    });
  }
  const selectedClusterCandidates = selectRadioClusterCandidates(clusterCandidates);
  S._clusterOverlayIdentities = reconcileRadioClusterCandidates(
    selectedClusterCandidates,
    S._clusterOverlayIdentities,
    () => `stable:${++S._clusterOverlayIdentitySequence}`,
  );
  for (const candidate of S._clusterOverlayIdentities) {
    const clusterEntry = createRadioClusterOverlayEntry({
      ...candidate,
      position: () => candidate.point.position,
    });
    if (clusterEntry) entries.push(clusterEntry);
  }

  const cameraPosition = S._viewer?.camera?.positionWC;
  const singletonAllowance = Math.min(
    radioSingletonLabelLimit(S._viewer?.camera?.positionCartographic?.height),
    Math.max(0, RADIO_OVERLAY_COHORT_LIMIT - selectedClusterCandidates.length),
  );
  const singletonCandidates = selectRadioSingletonCandidates(
    [...S._renderById.values()]
      .filter((record) => (
        record.entity?.show
        && record.station?.id !== station?.id
        && !clusteredStationIds.has(record.station?.id)
      ))
      .map((record) => ({
        ...record,
        distanceM: cameraPosition
          ? Cesium.Cartesian3.distance(cameraPosition, record.position)
          : Number.POSITIVE_INFINITY,
      })),
    singletonAllowance,
  );
  for (let index = 0; index < singletonCandidates.length; index += 1) {
    const candidate = singletonCandidates[index];
    const singletonEntry = createRadioSingletonOverlayEntry({
      station: candidate.station,
      position: candidate.position,
      // Cluster priorities begin at three. Keep clusters authoritative while
      // retaining nearest-first singleton ordering inside the ambient lane.
      priority: 2 - (index / Math.max(1, singletonCandidates.length + 1)),
    });
    if (singletonEntry) entries.push(singletonEntry);
  }

  setOverlayEntries(RADIO_OVERLAY_SOURCE_ID, entries, RADIO_OVERLAY_SOURCE_OPTIONS);
  setOverlaySourceVisible(RADIO_OVERLAY_SOURCE_ID, true);
  S._overlayDiagnostics = {
    entryCount: entries.length,
    selectedCount: entries.filter((entry) => entry.selected).length,
    singletonTexts: entries.filter((entry) => entry.id.startsWith('station:')).map((entry) => entry.title),
    singletonIds: entries.filter((entry) => entry.id.startsWith('station:')).map((entry) => entry.id),
    clusterTexts: entries.filter((entry) => entry.id.startsWith('cluster:')).map((entry) => entry.title),
    clusterIds: entries.filter((entry) => entry.id.startsWith('cluster:')).map((entry) => entry.id),
    clusterMemberships: S._clusterOverlayIdentities.map((candidate) => ({
      membershipId: candidate.membershipId,
      entryId: `cluster:${candidate.id}`,
    })),
  };
}

export function scheduleRadioOverlayPublish() {
  if (S._overlayPublishTimer) clearTimeout(S._overlayPublishTimer);
  const sessionGeneration = S._sessionGeneration;
  S._overlayPublishTimer = setTimeout(() => {
    if (sessionGeneration === S._sessionGeneration) publishRadioOverlayEntries();
  }, 0);
}

export function updateRenderVisibility({ force = true } = {}) {
  if (!S._viewer || !S._dataSource) return;
  const cameraPosition = S._viewer.camera?.positionWC;
  if (!force && !radioCameraPositionChanged(S._lastHorizonCameraPosition, cameraPosition)) return;
  S._lastHorizonCameraPosition = cameraPosition
    ? { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z }
    : null;
  S._horizonScanCount += 1;
  const occluder = horizonOccluder(S._viewer.camera);
  let visibilityChanged = false;
  for (const [id, record] of S._renderById) {
    const matches = stationMatchesRadioCategory(record.station, S._filter);
    const visible = matches && occluder.isPointVisible(record.position);
    if (record.entity.show !== visible) visibilityChanged = true;
    record.entity.show = visible;
  }
  if (S._selectedEntity) {
    const position = S._selectedEntity.position?.getValue?.(Cesium.JulianDate.now());
    const selectedVisible = radioEntityHorizonVisible(occluder, position);
    if (S._selectedEntity.show !== selectedVisible) visibilityChanged = true;
    S._selectedEntity.show = selectedVisible;
  }
  scheduleRadioOverlayPublish();
  // The horizon timer can commit AFTER the camera settles and the governor
  // parks the scene — a changed show flag needs one frame. (perf wave 2 fix)
  if (visibilityChanged) governorRequestRender('radio-horizon');
}

/** Retain refresh identities only while every represented station still exists. */
export function retainRadioClusterIdentitiesForStations(previous, stations) {
  const stationIds = new Set((stations || []).map((station) => String(station?.id || '')).filter(Boolean));
  return (previous || []).filter((candidate) => (
    Array.isArray(candidate?.stationIds)
    && candidate.stationIds.length > 0
    && candidate.stationIds.every((stationId) => stationIds.has(String(stationId)))
  ));
}

export function reconcileStations(stations) {
  if (!S._tuningActive) S._cancelledTuningPresentationStation = null;
  S._clusterOverlayIdentities = retainRadioClusterIdentitiesForStations(
    S._clusterOverlayIdentities,
    stations,
  );
  S._stations = Object.freeze([...stations]);
  S._stationById = new Map(stations.map((station) => [station.id, station]));
  S._categories = Object.freeze(buildRadioCategories(stations).map((category) => Object.freeze(category)));
  if (S._filter === DEFAULT_RADIO_FILTER && !filterRadioStations(stations, DEFAULT_RADIO_FILTER).length) {
    S._filter = 'all';
  }
  if (S._selectedId && !S._stationById.has(S._selectedId)) {
    if (S._audioStationId === S._selectedId) stopRadioPlayback();
    S._selectedId = null;
  }

  if (S._dataSource) S._dataSource.entities.removeAll();
  S._renderById.clear();
  for (const station of stations) {
    const position = markerPosition(station);
    const markerColor = radioCategoryColor(radioStationCategoryId(station));
    const entity = S._dataSource.entities.add({
      id: `${RADIO_PREFIX}${station.id}`,
      position,
      point: {
        pixelSize: 13,
        color: Cesium.Color.fromCssColorString(markerColor).withAlpha(0.86),
        outlineColor: Cesium.Color.fromCssColorString('#071b25'),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(100_000, 1.15, 12_000_000, 1),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          0,
          RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
        ),
      },
    });
    S._renderById.set(station.id, { station, entity, position });
  }
  updateSelectionEntity();
  updateRenderVisibility();
}

export function installClusterStyling() {
  if (!S._dataSource || S._removeClusterListener) return;
  const clustering = S._dataSource.clustering;
  clustering.enabled = true;
  clustering.pixelRange = 42;
  clustering.minimumClusterSize = 3;
  clustering.clusterPoints = true;
  clustering.clusterLabels = false;
  clustering.clusterBillboards = false;
  S._removeClusterListener = clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
    const clusteredStations = [];
    for (const entity of clusteredEntities) {
      const stationId = String(entity.id || '').slice(RADIO_PREFIX.length);
      const station = S._renderById.get(stationId)?.station;
      if (station) clusteredStations.push(station);
    }
    const clusterCategory = radioClusterCategoryId(clusteredStations, S._filter);
    const clusterColor = Cesium.Color.fromCssColorString(radioCategoryColor(clusterCategory));
    // Cesium assigns the entity-id array only to the generated cluster label.
    // Mirror it to the visible point so clicking either part of the callout
    // resolves the first station and remains a direct playback gesture.
    cluster.point.id = clusteredEntities;
    cluster.billboard.id = clusteredEntities;
    cluster.label.show = false;
    cluster.label.text = '';
    cluster.point.show = true;
    cluster.point.pixelSize = Math.min(26, 12 + Math.log2(clusteredEntities.length) * 1.6);
    cluster.point.color = clusterColor.withAlpha(0.9);
    cluster.point.outlineColor = Cesium.Color.BLACK;
    cluster.point.outlineWidth = 2;
    cluster.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    cluster.point.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(
      0,
      RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
    );
    scheduleRadioOverlayPublish();
  });
}

function pickedRadioStationAt(position) {
  const scene = S._viewer?.scene;
  if (!scene || !position) return null;

  const stationFromPick = (picked) => {
    const stationId = radioStationIdFromPick(picked);
    return stationId && S._stationById.has(stationId) ? stationId : null;
  };
  const primaryPick = scene.pick(position);
  const primaryStationId = stationFromPick(primaryPick);
  if (primaryStationId) return primaryStationId;
  const primaryId = resolvePickId(primaryPick);
  if (primaryId && isOwnedByOtherLayer('radio', primaryId)) return null;

  if (typeof scene.drillPick === 'function') {
    const drilled = scene.drillPick(position, 16) || [];
    for (const picked of drilled) {
      const stationId = stationFromPick(picked);
      if (stationId) return stationId;
    }
  }

  for (const [offsetX, offsetY] of RADIO_PICK_OFFSETS) {
    const offsetPosition = new Cesium.Cartesian2(position.x + offsetX, position.y + offsetY);
    const picked = scene.pick(offsetPosition);
    const pickedId = resolvePickId(picked);
    if (pickedId && isOwnedByOtherLayer('radio', pickedId)) continue;
    const stationId = stationFromPick(picked);
    if (stationId) return stationId;
  }
  return null;
}

export function radioPresentationAllowed() {
  if (!S._managerLifecyclePresentation) return S._enabled;
  return S._enabled
    && S._managerLifecyclePresentation.lifecycleState === 'enabled'
    && S._managerLifecyclePresentation.enabled
    && !S._managerLifecyclePresentation.uncertain;
}

export function syncRadioLifecyclePresentation() {
  const visible = radioPresentationAllowed();
  if (S._dataSource) S._dataSource.show = visible;
  setOverlaySourceVisible(RADIO_OVERLAY_SOURCE_ID, visible);
  if (visible) {
    installInteraction();
    updateSelectionEntity();
    updateRenderVisibility();
    scheduleRadioOverlayPublish();
  } else {
    removeInteraction();
    if (S._selectedEntity && S._viewer) S._viewer.entities.remove(S._selectedEntity);
    S._selectedEntity = null;
  }
}

function installInteraction() {
  if (!S._viewer || S._clickHandler) return;
  registerPickOwner('radio', (id) => id.startsWith(RADIO_PREFIX));
  S._clickHandler = new Cesium.ScreenSpaceEventHandler(S._viewer.scene.canvas);
  S._clickHandler.setInputAction((click) => {
    if (!radioPresentationAllowed()) return;
    const stationId = pickedRadioStationAt(click.position);
    if (!stationId) return;
    S._playFallbackId = null;
    S._playFallbackFocus = null;
    selectRadioStation(stationId, { autoplay: true, origin: 'user' });
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('gev:radio-selected', { detail: { stationId } }));
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  // Polling remains bounded during flights, but a stationary camera no longer
  // rewrites every station's visibility four times per second while voice and
  // audio processing share the main thread.
  S._horizonTimer = setInterval(() => updateRenderVisibility({ force: false }), HORIZON_TICK_MS);
}

export function removeInteraction() {
  unregisterPickOwner('radio');
  S._clickHandler?.destroy();
  S._clickHandler = null;
  if (S._horizonTimer) clearInterval(S._horizonTimer);
  S._horizonTimer = null;
}
