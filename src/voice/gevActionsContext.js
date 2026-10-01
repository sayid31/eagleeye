// Moved out of gevActions.js (gevActionsContext).

import * as Cesium from 'cesium';
import { collectAircraftProximityWindow } from '../data/militaryAwareness.js';
import { getContextStore, getSelectedEntityContext, isContextRecordActive } from '../data/contextStore.js';
import { getBasemapContext } from './gevGeocodeContext.js';
import { activeContactsWindow } from './gevActionsAnalyst.js';
import { approximateCoordinateDistanceSq, getViewTargetCartographic, haversineKm, polygonCenter } from './gevActionsCamera.js';
import { SUBJECT_CENTER_TOLERANCE_KM, VISIBLE_ENTITY_SHORTLIST } from './gevActionsConstants.js';
import { clampNumber, cleanText, layerTitle, normalizeLayerId, withContextModeVocabulary } from './gevActionsNormalize.js';
import { collectTrackedEntities } from './gevActionsTracking.js';

export function getCurrentViewState(viewer, styleManager, dataManager, sceneDirector = null) {
  const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
  return {
    ok: true,
    action: 'get_current_view_state',
    camera: {
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      heightM: cartographic.height,
    },
    style: styleManager.activeStyle || 'normal',
    context: typeof styleManager.getContextModeState === 'function'
      ? {
        ...withContextModeVocabulary(styleManager.getContextModeState()),
        // The numbers on the operator's Contacts panel, so a window/count
        // question can be answered from what they are looking at.
        ...(activeContactsWindow(dataManager) ? { contactsWindow: activeContactsWindow(dataManager) } : {}),
      }
      : null,
    cockpit: typeof styleManager.getCockpitState === 'function'
      ? styleManager.getCockpitState()
      : null,
    controls: typeof styleManager.getControlState === 'function' ? styleManager.getControlState() : null,
    scenePlayback: sceneDirector?.getPlaybackStatus?.() || null,
    tracked: collectTrackedEntities(dataManager),
    layers: dataManager.getAll().map((layer) => ({
      id: layer.id,
      name: layer.name,
      enabled: layer.enabled,
      count: layer.stats?.count || 0,
      error: layer.stats?.error || null,
    })),
  };
}

export async function getEntityContext(viewer, dataManager, styleManager, args = {}) {
  const startedAt = performance.now();
  const scope = String(args.scope || 'auto').toLowerCase();
  const layerId = normalizeLayerId(args.layerId || args.layer);
  const limit = Math.round(clampNumber(args.limit, 1, 12, 5));
  const selected = selectedEntityContext(dataManager);
  const cameraHeightM = viewer.camera.positionCartographic.height;
  const viewTarget = getViewTargetCartographic(viewer);
  const scenePromise = getSceneContext(viewer, styleManager, dataManager, viewTarget);
  const selectedWillBeReturned = selected && (scope === 'selected' || scope === 'auto');
  const visible = (!selectedWillBeReturned && shouldScanVisibleEntities(cameraHeightM))
    ? visibleEntityContexts(viewer, dataManager, { layerId, limit, target: viewTarget })
    : [];
  const scene = await scenePromise;

  if ((scope === 'selected' || scope === 'auto') && selected) {
    logSlowContext(startedAt, 'selected');
    return {
      ok: true,
      action: 'get_entity_context',
      scope: 'selected',
      scene,
      selected,
    };
  }

  logSlowContext(startedAt, 'in_view');
  return {
    ok: true,
    action: 'get_entity_context',
    scope: 'in_view',
    scene,
    selected: selected || null,
    visible,
    count: visible.length,
    visibleScanSkipped: !shouldScanVisibleEntities(cameraHeightM),
  };
}

/**
 * Answer an entity-centred "how many aircraft nearby" from the Contacts
 * engine, or null when the question is not that.
 *
 * Applies only when the requested radius centre IS the active Contacts
 * subject: that is precisely the case where the operator can see a number on
 * the panel, so the spoken answer must be that number. Everything else — an
 * explicit region, an arbitrary point, a named place — keeps the general
 * record engine, which is what those questions actually mean.
 * @param {object} args Tool arguments.
 * @param {object} result The general engine's result, reused for scope text.
 * @param {import('../data/manager.js').DataLayerManager} dataManager
 * @returns {object|null} A unified-count payload, or null.
 */
export function aircraftProximityWindowForQuery(args, result, dataManager) {
  const scope = args?.scope;
  if (String(scope?.kind || '').toLowerCase() !== 'radius') return null;
  const layers = Array.isArray(args.layers) ? args.layers : [];
  if (!layers.some((layer) => layer === 'flights' || layer === 'military')) return null;
  const snapshot = dataManager.getContextSnapshot();
  const subject = snapshot?.subject;
  if (!subject?.position) return null;
  // An explicit centre only qualifies when it IS the subject; otherwise the
  // operator asked about somewhere else and must get that answer.
  if (scope.center && !centerMatchesSubject(scope.center, subject.position)) return null;
  const radiusM = Number.isFinite(scope.km) ? scope.km * 1000 : (snapshot.radiusM || 250_000);
  const window = collectAircraftProximityWindow(subject.position, { radiusM, subject });
  if (!window) return null;
  const label = subject.label || subject.id || 'the selected contact';
  const radiusKm = Math.round(radiusM / 1000);
  const wanted = new Set(layers);
  const items = [
    ...(wanted.has('flights') ? window.flights.map((item) => ({ ...item, layerKey: 'flights' })) : []),
    ...(wanted.has('military') ? window.military.map((item) => ({ ...item, layerKey: 'military' })) : []),
  ];
  const count = items.length;
  return {
    ok: true,
    action: 'analyst_query',
    count,
    scopeLabel: `within ${radiusKm} km of ${label}`,
    truncated: false,
    items: items.slice(0, Math.round(clampNumber(args.limit, 1, 50, 12))).map((item) => ({
      layerKey: item.layerKey,
      id: item.id,
      ...(item.icao24 ? { icao24: item.icao24 } : {}),
      ...(item.callsign ? { callsign: item.callsign } : {}),
      ...(Number.isFinite(item.distance) ? { distanceKm: Math.round(item.distance / 100) / 10 } : {}),
    })),
    summary: { count },
    coverage: {
      layersQueried: result?.coverage?.layersQueried || [],
      scope: `window:${radiusKm}km@${label}`,
      followUp: false,
      note: 'Contacts window engine — the same computation and cohort the Contacts panel displays, so this count matches the panel exactly — counts cover loaded data; the flights layer loads by viewport.',
    },
    // (D) The answer always says whose window it is and which engine produced it.
    window: {
      engine: 'contacts-window',
      centeredOn: label,
      radiusKm,
      flights: window.flights.length,
      military: window.military.length,
      aircraft: window.aircraft,
    },
    ...(activeContactsWindow(dataManager) ? { contactsWindow: activeContactsWindow(dataManager) } : {}),
  };
}

/**
 * Is this requested centre the Contacts subject's own position?
 *
 * Measured as true ground distance. A lat/lon delta box was wrong in a way
 * that hid at the equator and widened toward it: a degree of longitude is
 * ~111 km at the equator and ~78 km at 45°, so a fixed 0.01° box spans a
 * different real distance at every latitude, and its diagonal admitted centres
 * ~1.5 km away — far enough to be a different place, close enough to slip
 * through and get answered as the subject's window.
 * @param {{lat: number, lon: number}} center Requested centre.
 * @param {Cesium.Cartesian3} subjectPosition Subject's world position.
 * @returns {boolean} True when the two are the same place.
 */
function centerMatchesSubject(center, subjectPosition) {
  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lon)) return false;
  const carto = Cesium.Cartographic.fromCartesian(subjectPosition);
  if (!carto) return false;
  const subjectLat = Cesium.Math.toDegrees(carto.latitude);
  const subjectLon = Cesium.Math.toDegrees(carto.longitude);
  return haversineKm(subjectLat, subjectLon, center.lat, center.lon) <= SUBJECT_CENTER_TOLERANCE_KM;
}

function shouldScanVisibleEntities(cameraHeightM) {
  return cameraHeightM <= 100000;
}

function selectedEntityContext(dataManager) {
  const record = getSelectedEntityContext({ dataManager });
  if (!record) return null;
  return summarizeContextRecord(record, { includeProperties: true });
}

function visibleEntityContexts(viewer, dataManager, { layerId = null, limit = 5, target = null } = {}) {
  const nearbyRecords = [];
  const canvas = viewer.scene.canvas;
  const width = canvas.clientWidth || canvas.width || 0;
  const height = canvas.clientHeight || canvas.height || 0;
  const centerX = width / 2;
  const centerY = height / 2;
  const targetLat = target ? Cesium.Math.toDegrees(target.latitude) : null;
  const targetLon = target ? Cesium.Math.toDegrees(target.longitude) : null;
  const store = getContextStore();
  const enabledLayerIds = new Set(
    dataManager.getAll().filter((layer) => layer.enabled).map((layer) => layer.id)
  );

  for (const record of store.entities.values()) {
    if (layerId && record.layerId !== layerId) continue;
    if (record.layerId && !enabledLayerIds.has(record.layerId)) continue;
    if (record.entity?.show === false || record.dataSource?.show === false) continue;
    if (!Number.isFinite(record.latitude) || !Number.isFinite(record.longitude)) continue;
    insertNearestRecord(nearbyRecords, {
      record,
      distanceScore: target
        ? approximateCoordinateDistanceSq(targetLat, targetLon, record.latitude, record.longitude)
        : 0,
    }, VISIBLE_ENTITY_SHORTLIST);
  }

  const candidates = [];
  for (const { record } of nearbyRecords) {
    const position = record.entity?.__localBaseCartesian;
    if (!position) continue;
    const screen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
    if (!screen || screen.x < 0 || screen.y < 0 || screen.x > width || screen.y > height) continue;
    const dx = screen.x - centerX;
    const dy = screen.y - centerY;
    candidates.push({
      summary: summarizeContextRecord(record, { includeProperties: true }),
      distancePx: Math.sqrt(dx * dx + dy * dy),
    });
  }

  return candidates
    .sort((a, b) => a.distancePx - b.distancePx)
    .slice(0, limit)
    .map((item) => item.summary);
}

function insertNearestRecord(records, candidate, limit) {
  if (records.length < limit) {
    records.push(candidate);
    records.sort((a, b) => a.distanceScore - b.distanceScore);
    return;
  }
  if (candidate.distanceScore >= records[records.length - 1].distanceScore) return;

  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (records[middle].distanceScore <= candidate.distanceScore) low = middle + 1;
    else high = middle;
  }
  records.splice(low, 0, candidate);
  records.pop();
}

async function getSceneContext(viewer, styleManager, dataManager, viewTarget = null) {
  const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
  const basemap = await getBasemapContext(viewer, viewTarget);
  const enabledLayers = dataManager.getAll()
    .filter((layer) => layer.enabled)
    .map((layer) => ({
      id: layer.id,
      name: layer.name,
      count: layer.stats?.count || 0,
      source: layer.source,
    }));
  return {
    camera: {
      latitude: Number(Cesium.Math.toDegrees(cartographic.latitude).toFixed(6)),
      longitude: Number(Cesium.Math.toDegrees(cartographic.longitude).toFixed(6)),
      heightM: Math.round(cartographic.height),
    },
    basemap,
    style: styleManager.activeStyle || 'normal',
    enabledLayers,
  };
}

function logSlowContext(startedAt, scope) {
  const durationMs = Math.round(performance.now() - startedAt);
  if (durationMs >= 500) {
    console.info(`[GEV Voice] ${scope} scene context completed in ${durationMs}ms`);
  }
}

function summarizeEntity(viewer, entity, { includeProperties = false } = {}) {
  const now = Cesium.JulianDate.now();
  if (entity.__gevContextId) {
    const store = window.__gevContextStore;
    const record = store?.entities?.get(entity.__gevContextId);
    if (record) return summarizeContextRecord(record, { includeProperties });
  }
  const props = propertyObject(entity);
  const layerId = entity.__localLayerId || props.layerId || null;
  const tags = props.tags || {};
  const label = cleanText(
    props.name ||
    tags.name ||
    tags['name:en'] ||
    tags.official_name ||
    tags.operator ||
    props.operator ||
    entity.name ||
    layerTitle(layerId)
  );
  const position = entity.__localBaseCartesian || entity.position?.getValue?.(now) || polygonCenter(entity, now);
  const carto = position ? Cesium.Cartographic.fromCartesian(position) : null;
  return {
    id: String(entity.id || ''),
    name: label || layerTitle(layerId),
    layerId,
    layerName: layerTitle(layerId),
    latitude: carto ? Number(Cesium.Math.toDegrees(carto.latitude).toFixed(6)) : null,
    longitude: carto ? Number(Cesium.Math.toDegrees(carto.longitude).toFixed(6)) : null,
    properties: includeProperties ? compactProperties(props) : undefined,
  };
}

function summarizeContextRecord(record, { includeProperties = false } = {}) {
  return {
    id: String(record.id || ''),
    name: cleanText(record.label || record.properties?.name) || layerTitle(record.layerId),
    layerId: record.layerId || null,
    layerName: record.layerName || layerTitle(record.layerId),
    source: record.source || null,
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    properties: includeProperties ? compactProperties(record.properties || {}) : undefined,
    active: isContextRecordActive(record),
  };
}

function propertyObject(entity) {
  const raw = entity?.properties?.getValue?.(Cesium.JulianDate.now()) || {};
  return unwrapProperties(raw);
}

function unwrapProperties(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(unwrapProperties);
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = entry && typeof entry.getValue === 'function'
      ? unwrapProperties(entry.getValue(Cesium.JulianDate.now()))
      : unwrapProperties(entry);
  }
  return out;
}

function compactProperties(props) {
  const preferredKeys = [
    'name',
    'operator',
    'owner',
    'brand',
    'addr:city',
    'addr:state',
    'country',
    'capacity',
    'output',
    'osm_id',
    'source',
  ];
  const flat = { ...props, ...(props.tags && typeof props.tags === 'object' ? props.tags : {}) };
  const result = {};
  for (const key of preferredKeys) {
    const value = cleanText(flat[key]);
    if (value) result[key] = value;
  }
  for (const [key, value] of Object.entries(flat)) {
    if (Object.keys(result).length >= 12) break;
    if (key === 'tags' || result[key] !== undefined) continue;
    const text = cleanText(value);
    if (text) result[key] = text;
  }
  return result;
}
