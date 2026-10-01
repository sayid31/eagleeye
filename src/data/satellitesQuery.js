// Moved out of satellites.js (satellitesQuery).

import { satelliteClassLabel, satelliteClassLegend } from './satelliteClass.js';
import * as Cesium from 'cesium';
import { ISS_NORAD } from './satellitesConstants.js';
import { propagatePosition } from './satellitesOrbit.js';
import { S } from './satellitesState.js';
import { _classTally } from './satellitesStyle.js';
import { _getTrackedFramePosition } from './satellitesTracking.js';

export function getSatellitesDetectableObjects(options = {}) {
    if (!S._pointCollection || !S._pointCollection.show) return [];
    // Dense extras are points-only: excluded from the detection overlay.
    const eligibleCount = Math.max(1, S._points.size - S._denseIds.length);
    const maxCount = Number.isFinite(options.maxCount)
      ? Math.max(1, Math.floor(options.maxCount))
      : eligibleCount;
    const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0;
    const stride = Math.max(1, Math.ceil(eligibleCount / maxCount));
    const start = seed % stride;

    const result = [];
    let idx = 0;
    for (const [noradId, point] of S._points) {
      if (S._denseIds.length > 0 && S._catalog.get(noradId)?.group === 'dense') continue;
      const shouldTake = ((idx - start) % stride) === 0;
      idx++;
      if (!shouldTake) continue;
      if (!point.position) continue;
      const isTracked = noradId === S._trackedNorad;
      // A docked companion sits at the tracked subject's own position, so its
      // mark and label would stack underneath the tracked card. It is listed on
      // that card instead. Only members of the tracked cluster are affected —
      // unrelated nearby satellites are never suppressed.
      if (!isTracked && S._dockedCompanions.has(noradId)) continue;
      const cat = S._catalog.get(noradId);
      let object = S._detectionObjects.get(noradId);
      if (!object) {
        object = {
          sourceId: noradId,
          id: cat?.name || `SAT-${noradId}`,
          type: 'SAT',
          // Human class ("NAV · GPS"), not the raw CelesTrak tag ("GPS-OPS").
          // The detection canvas composites ABOVE the post-FX chain, so this
          // is how class survives NVG/FLIR once the dot colors are collapsed.
          klass: satelliteClassLabel(cat?.group, { isIss: noradId === ISS_NORAD }),
        };
        S._detectionObjects.set(noradId, object);
      }
      object.position = point.position;
      object.skipLabel = isTracked;
      result.push(object);
      if (result.length >= maxCount) break;
    }
    return result;
  }

export function findSatellitesByQuery(query) {
    if (query === null || query === undefined || !S._catalog || S._catalog.size === 0) return null;
    const q = String(query).trim();
    if (!q) return null;

    let noradId = null;
    if (/^\d+$/.test(q) && S._catalog.has(Number(q))) {
      noradId = Number(q);
    } else {
      const lower = q.toLowerCase();
      for (const [id, sat] of S._catalog) {
        if (sat.name.toLowerCase().includes(lower)) {
          noradId = id;
          break;
        }
      }
    }
    if (noradId === null) return null;

    const sat = S._catalog.get(noradId);
    const pos = propagatePosition(sat.satrec, new Date());
    if (!pos) return null;

    return {
      noradId,
      name: sat.name.trim(),
      position: Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos.altitude),
      latitude: pos.latitude,
      longitude: pos.longitude,
      altitudeM: pos.altitude,
    };
  }

export function getSatellitesAllPositions(maxCount = 300) {
    const result = [];
    if (!S._points || S._points.size === 0) return result;
    const cap = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : 300;

    for (const [noradId, point] of S._points) {
      if (result.length >= cap) break;
      if (!point.position) continue;
      // Dense extras are points-only — keep voice/framing lists to the core catalog.
      if (S._denseIds.length > 0 && S._catalog.get(noradId)?.group === 'dense') continue;
      const carto = Cesium.Cartographic.fromCartesian(point.position);
      if (!carto) continue;
      const sat = S._catalog.get(noradId);
      result.push({
        id: noradId,
        label: sat ? sat.name.trim() : String(noradId),
        position: point.position,
        latitude: Cesium.Math.toDegrees(carto.latitude),
        longitude: Cesium.Math.toDegrees(carto.longitude),
        altitudeM: carto.height,
      });
    }
    return result;
  }

export function getSatellitesTrackedInfo() {
    if (S._trackedNorad === null || !S._catalog.has(S._trackedNorad)) return null;
    const sat = S._catalog.get(S._trackedNorad);
    // Per-frame cache (WS-D2) — same epoch as the dot/label/camera this frame.
    const pos = _getTrackedFramePosition();
    if (!pos) return null;
    return {
      noradId: S._trackedNorad,
      name: sat.name.trim(),
      latitude: pos.latitude,
      longitude: pos.longitude,
      altitudeM: pos.altitude,
    };
  }

export function getSatellitesRowControls() {
    // A dependency owner (Space Missions) borrows this layer for TLE lookup
    // with showPoints:false. Nothing is rendered, so a legend would describe an
    // empty sky and a chip write would be silently reverted by that owner's
    // restore. Surrender the row rather than lie about it.
    if (!S._params.showPoints) return { chips: [], legend: [] };

    const loading = S._denseStatus === 'loading';
    const failed = S._denseStatus === 'failed';
    const active = S._params.catalog === 'dense' && S._denseStatus === 'ready';
    let title = 'Add the full Starlink broadband shell (thousands of extra points)';
    if (loading) title = 'Loading the Starlink shell…';
    else if (failed) title = `Starlink ${S._denseError || 'load failed'} — click to retry`;
    else if (active) title = 'Showing the full Starlink shell — click for the core catalog only';
    return {
      chips: [{
        id: 'catalog',
        label: loading ? 'DENSE ···' : (failed ? 'DENSE ✕' : 'DENSE'),
        active,
        busy: loading,
        disabled: loading,
        state: loading ? 'loading' : (failed ? 'error' : (active ? 'active' : 'idle')),
        title,
        params: { catalog: active ? 'core' : 'dense' },
      }],
      legend: satelliteClassLegend(_classTally()),
    };
  }

export function setSatellitesRowControlsListener(listener) {
    S._rowControlsListener = typeof listener === 'function' ? listener : null;
  }
