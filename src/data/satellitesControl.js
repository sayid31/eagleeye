// Moved out of satellites.js (satellitesControl).

import { isExplicitLayerStateOrigin } from './layerState.js';
import { _loadDenseCatalog, _removeDenseCatalog } from './satellitesDense.js';
import { _syncIssOverlay } from './satellitesIss.js';
import { S } from './satellitesState.js';
import { satelliteCatalogModeChanged, satelliteVisualsVisible } from './satellitesStyle.js';
import { _applyPendingTrackingRestore, _cancelPendingTrackingRestore, _clearTracking, _normalizeTrackedNorad, _trackSatellite } from './satellitesTracking.js';

export function trackSatelliteById(noradId, { origin = 'programmatic' } = {}) {
    const id = Number(noradId);
    if (!Number.isFinite(id) || !S._viewer || !S._catalog.has(id) || !S._points.has(id)) return false;
    _cancelPendingTrackingRestore();
    _trackSatellite(id, { origin });
    return S._trackedNorad === id;
  }

export function stopSatellitesTracking({ origin = 'programmatic' } = {}) {
    _cancelPendingTrackingRestore();
    _clearTracking(false, { origin });
    return true;
  }

export function cancelSatellitesPendingTrackingRestore() {
    _cancelPendingTrackingRestore();
  }

export function setSatellitesParams(params = {}, { origin = 'programmatic' } = {}) {
    if (isExplicitLayerStateOrigin(origin)
        && !Object.hasOwn(params, 'selectedSatTrackingId')) {
      _cancelPendingTrackingRestore();
    }
    const catalog = params.catalog;
    if (catalog !== undefined && catalog !== 'core' && catalog !== 'dense') return false;
    const catalogChanged = satelliteCatalogModeChanged(S._params.catalog, catalog);
    if (catalogChanged) {
      S._params.catalog = catalog;
    }
    if (params.showPoints !== undefined) {
      S._params.showPoints = params.showPoints !== false;
      if (S._pointCollection) S._pointCollection.show = satelliteVisualsVisible(S._enabled, S._params.showPoints);
    }
    if (params.showOrbits !== undefined) {
      S._params.showOrbits = params.showOrbits !== false;
      for (const path of S._orbitPaths.values()) path.primitive.show = satelliteVisualsVisible(S._enabled, S._params.showOrbits);
      _syncIssOverlay();
    }
    if (catalogChanged && catalog === 'dense') {
      S._denseLoadPromise = _loadDenseCatalog();
    } else if (catalog === 'core') {
      if (catalogChanged) _removeDenseCatalog();
      // Any explicit request for core clears the error, even when the mode did
      // NOT change: a failed dense load already reverted the param to core, so
      // a Space Missions restore of an already-core snapshot would otherwise
      // leave the user staring at a DENSE ✕ they never caused.
      S._denseStatus = 'idle';
      S._denseError = null;
    }
    if (catalogChanged) console.log(`[Data:Satellites] Catalog mode: ${catalog}`);
    if (Object.hasOwn(params, 'selectedSatTrackingId')) {
      const requested = _normalizeTrackedNorad(params.selectedSatTrackingId);
      if (requested === S._trackedNorad) {
        S._pendingTrackingRestore = null;
      } else if (requested === null) {
        _cancelPendingTrackingRestore();
        if (S._trackedNorad !== null) _clearTracking(false, { origin });
      } else {
        const generation = ++S._trackingIntentGeneration;
        S._pendingTrackingRestore = { id: requested, generation, origin };
        if (S._trackedNorad !== null) _clearTracking(false, { origin });
        _applyPendingTrackingRestore();
      }
    }
    return true;
  }
