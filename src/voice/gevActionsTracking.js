// Moved out of gevActions.js (gevActionsTracking).

import { getSelectedEntityContext } from '../data/contextStore.js';
import { flyToLandmark } from '../locations.js';
import * as Cesium from 'cesium';
import { getViewTargetCartesian } from './gevActionsCamera.js';
import { FRAME_TARGETS, TRACKABLE_FAMILIES } from './gevActionsConstants.js';
import { clampNumber, formatTrackedEntityLabel, normalizeLayerId } from './gevActionsNormalize.js';

export function selectedCockpitTarget(dataManager) {
  const selected = getSelectedEntityContext({ dataManager });
  if (!selected || !['flights', 'military'].includes(selected.layerId)) return null;
  if (!dataManager?.layerHasMethod?.(selected.layerId, 'trackById')) return null;
  const id = String(selected.id || '').trim();
  return id ? { layerId: selected.layerId, id } : null;
}

/** Finds and tracks/selects an entity by spoken query across layer families. */
export async function trackEntity(viewer, dataManager, styleManager, args = {}) {
  const query = String(args.query || '').trim();
  if (!query) throw new Error('track_entity needs a query');

  // Fire queries route to the FIRMS layer's strongest detection
  if (/\bfires?\b/i.test(query)) {
    if (!dataManager.isEnabled('local-firms')) {
      return { ok: false, action: 'track_entity', query, error: 'The FIRMS fires layer is not enabled' };
    }
    const strongest = dataManager.callLayerMethod('local-firms', 'getStrongestFire');
    if (!strongest) {
      return { ok: false, action: 'track_entity', query, error: 'No fire detections loaded yet' };
    }
    if (!Number.isFinite(strongest.latitude) || !Number.isFinite(strongest.longitude)) {
      return { ok: false, action: 'track_entity', query, error: 'The strongest fire has no usable position' };
    }
    return runManagedVoiceNavigation(styleManager, 'fire', 'track_entity', () => {
      flyToLandmark(viewer, strongest.latitude, strongest.longitude, {
        range: 14000, pitch: -50, heading: 0, buildingHeight: 0, duration: 2.2,
      });
      return {
        ok: true, action: 'track_entity', kind: 'fire', layerId: 'local-firms',
        label: strongest.label || 'Strongest fire',
        latitude: strongest.latitude, longitude: strongest.longitude,
        frp: strongest.frp ?? null,
      };
    });
  }

  const requested = args.layerId ? normalizeLayerId(args.layerId) : null;
  const families = TRACKABLE_FAMILIES.filter((family) => !requested || family.layerId === requested);
  const skippedDisabled = [];

  for (const family of families) {
    if (!dataManager.isEnabled(family.layerId)) {
      skippedDisabled.push(family.layerId);
      continue;
    }
    const found = dataManager.callLayerMethod(family.layerId, 'findByQuery', query);
    if (!found) continue;

    if (family.kind === 'vessel'
      && (!Number.isFinite(found.latitude) || !Number.isFinite(found.longitude))) {
      return {
        ok: false, action: 'track_entity', layerId: family.layerId, kind: family.kind,
        error: 'The matched vessel has no usable position',
      };
    }

    return runManagedVoiceNavigation(styleManager, family.kind, 'track_entity', () => {
      let trackedOk = false;
      if (family.kind === 'vessel') {
        trackedOk = !!dataManager.callLayerMethod(family.layerId, 'selectById', found.mmsi);
        flyToLandmark(viewer, found.latitude, found.longitude, {
          range: 6000, pitch: -45, heading: 0, buildingHeight: 0, duration: 2.0,
        });
      } else if (family.kind === 'satellite') {
        trackedOk = !!dataManager.callLayerMethod(family.layerId, 'trackById', found.noradId, { origin: 'voice' });
      } else {
        trackedOk = !!dataManager.callLayerMethod(family.layerId, 'trackById', found.icao24, { origin: 'voice' });
      }

      return {
        ok: trackedOk,
        action: 'track_entity',
        layerId: family.layerId,
        kind: family.kind,
        // Aircraft follow the flight layers' label convention (callsign →
        // registration → icao24) so the spoken name matches what the UI shows;
        // `registration` is absent on vessels/satellites and simply falls
        // through to their own name/id links.
        label: formatTrackedEntityLabel(found, query),
        latitude: found.latitude ?? null,
        longitude: found.longitude ?? null,
        altitudeM: Number.isFinite(found.altitudeM) ? Math.round(found.altitudeM) : null,
        error: trackedOk ? null : 'Match found but tracking failed',
      };
    });
  }

  const disabledNote = skippedDisabled.length ? ` (disabled layers skipped: ${skippedDisabled.join(', ')})` : '';
  return { ok: false, action: 'track_entity', query, error: `Nothing matched "${query}"${disabledNote}` };
}

/** Releases tracking/selection on every entity layer family. */
export function stopAllTracking(viewer, dataManager) {
  const released = [];
  const failed = new Set();
  for (const family of TRACKABLE_FAMILIES) {
    if (!dataManager.layers.has(family.layerId)) continue;
    // Every module in TRACKABLE_FAMILIES contracts to return exactly `true`
    // on a successful stop/clear (see flights.js/satellites.js/
    // militaryFlights.js/aisLiveVessels.js docstrings) — `!== true` catches
    // both an explicit `false` and the facade's swallowed-throw `undefined`
    // fallback (dataManager.callLayerMethod never throws by design).
    if (family.kind === 'vessel') {
      if (dataManager.callLayerMethod(family.layerId, 'getSelectedInfo')) {
        if (dataManager.clearSelection(family.layerId) !== true) {
          failed.add(family.layerId);
        } else {
          released.push(family.layerId);
        }
      }
    } else if (dataManager.getTrackedInfo(family.layerId)) {
      if (dataManager.stopTracking(family.layerId, { origin: 'voice' }) !== true) {
        failed.add(family.layerId);
      } else {
        released.push(family.layerId);
      }
    }
  }
  for (const [layerId, key] of [
    ['flights', 'selectedFlightsTrackingId'],
    ['military', 'selectedMilitaryTrackingId'],
    ['satellites', 'selectedSatTrackingId'],
  ]) {
    try {
      if (dataManager.setLayerParams(layerId, { [key]: null }, { origin: 'voice' }) === false) {
        failed.add(layerId);
      }
    } catch {
      failed.add(layerId);
    }
  }
  if (viewer) viewer.trackedEntity = undefined;
  if (failed.size) {
    const failedLayerIds = [...failed];
    return {
      ok: false,
      action: 'stop_tracking',
      released,
      failedLayerIds,
      error: `Tracking could not be cleared for: ${failedLayerIds.join(', ')}`,
    };
  }
  return { ok: true, action: 'stop_tracking', released };
}

/**
 * Frames entities near the current view target with a cinematic pull-back:
 * oblique high pitch for aircraft/ships, shallow wide pitch for satellites.
 * When entries are found and detection is OFF, auto-enables panoptic
 * detection so the framed entities are labeled, and reports
 * detectionEnabled so the voice agent can mention labels are on.
 */
export async function frameOverhead(viewer, dataManager, styleManager, args = {}) {
  const targetRaw = String(args.target || 'flights').toLowerCase();
  const layerId = FRAME_TARGETS.get(targetRaw) || normalizeLayerId(targetRaw) || 'flights';
  if (!dataManager.layers.has(layerId)) {
    return { ok: false, action: 'frame_overhead', error: `Unknown target layer: ${args.target}` };
  }
  if (!dataManager.isEnabled(layerId)) {
    return { ok: false, action: 'frame_overhead', layerId, error: `The ${layerId} layer is not enabled` };
  }
  const isSatellites = layerId === 'satellites';
  const defaultRadiusKm = isSatellites ? 3000 : (layerId === 'ais-live-vessels' ? 120 : 150);
  const radiusKm = clampNumber(args.radiusKm, 10, 20000, defaultRadiusKm);
  const center = getViewTargetCartesian(viewer) || viewer.camera.positionWC;

  // `getNearby` and `getAllPositions` are mutually-exclusive capability
  // methods across TRACKABLE_FAMILIES' modules (never both defined on the
  // same layer), so trying the first and falling back to the second — via
  // the facade's own not-a-function safe-undefined behavior — needs no
  // separate existence check.
  let entries = dataManager.callLayerMethod(layerId, 'getNearby', center, radiusKm * 1000, 80);
  if (!entries) {
    const positions = dataManager.callLayerMethod(layerId, 'getAllPositions', 800);
    entries = (positions || [])
      .filter((entry) => entry.position)
      .map((entry) => ({ ...entry, distance: Cesium.Cartesian3.distance(center, entry.position) }))
      .filter((entry) => entry.distance <= radiusKm * 1000)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 80);
  }
  entries = entries || [];
  if (!entries.length) {
    return {
      ok: false, action: 'frame_overhead', layerId, radiusKm: Math.round(radiusKm), count: 0,
      error: `No ${targetRaw} within ${Math.round(radiusKm)} km of the current view`,
    };
  }

  const sphere = Cesium.BoundingSphere.fromPoints(entries.map((entry) => entry.position));
  sphere.radius = Math.max(sphere.radius * 1.25, 8000);
  const pitch = Cesium.Math.toRadians(isSatellites ? -35 : -62);
  return runManagedVoiceNavigation(styleManager, 'frame', 'frame_overhead', () => {
    viewer.camera.flyToBoundingSphere(sphere, {
      duration: 2.0,
      offset: new Cesium.HeadingPitchRange(viewer.camera.heading, pitch, sphere.radius * 2.4),
    });

    let detectionEnabled = false;
    try {
      const detectionState = styleManager?.getDetectionState?.();
      if (detectionState?.detectionMode === 'OFF') {
        const detectionResult = styleManager.setDetection({ mode: 'dense' });
        detectionEnabled = detectionResult?.ok === true;
      } else if (detectionState) {
        detectionEnabled = true;
      }
    } catch {
      // detection facade unavailable; framing still succeeded
    }

    return {
      ok: true,
      action: 'frame_overhead',
      layerId,
      radiusKm: Math.round(radiusKm),
      count: entries.length,
      detectionEnabled,
      nearest: entries.slice(0, 5).map((entry) => ({
        id: entry.id || entry.icao24 || entry.mmsi || null,
        label: entry.label || entry.callsign || entry.name || null,
      })),
    };
  });
}

/** Run one validated voice camera mutation through the UI-owned authority seam. */
export function runManagedVoiceNavigation(styleManager, noun, action, navigate, releaseOptions = undefined) {
  if (typeof styleManager?.runImmediateNavigation !== 'function') {
    return { ok: false, action, error: 'Camera navigation policy unavailable' };
  }
  const result = styleManager.runImmediateNavigation(noun, navigate, releaseOptions);
  if (result !== false) return result;
  return { ok: false, action, error: 'Camera navigation is unavailable in the current view' };
}

/** Gathers tracked/selected entities across layer families for read-back. */
export function collectTrackedEntities(dataManager) {
  const tracked = [];
  for (const family of TRACKABLE_FAMILIES) {
    if (!dataManager.layers.has(family.layerId)) continue;
    // The facade already catches a synchronously-thrown method and falls
    // back to null/undefined, so no try/catch is needed at this call site.
    const info = family.kind === 'vessel'
      ? dataManager.callLayerMethod(family.layerId, 'getSelectedInfo')
      : dataManager.getTrackedInfo(family.layerId);
    if (info) tracked.push({ kind: family.kind, layerId: family.layerId, ...info });
  }
  return tracked;
}
