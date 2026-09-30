// Moved out of militaryFlights.js (militaryFlightsTrackingApi).

import { applyTrackedCameraFrame } from './trackedCamera.js';
import * as Cesium from 'cesium';
import { _isExplicitTrackingOrigin, _publishTrackedSelection } from './militaryFlightsCockpit.js';
import { _describeFlight } from './militaryFlightsFleetTick.js';
import { S } from './militaryFlightsState.js';
import { _cancelPendingTrackingRestore, _clearTracking, _trackFlight } from './militaryFlightsTracking.js';

export function trackMilitaryFlightsById(icao24, { origin = 'programmatic' } = {}) {
    if (!icao24) return false;
    let id = String(icao24).trim();
    if (!S._billboards.has(id)) id = id.toLowerCase();
    if (!S._billboards.has(id)) return false;
    if (_isExplicitTrackingOrigin(origin)) _cancelPendingTrackingRestore();
    if (S._trackedIcao === id) return _publishTrackedSelection(id, origin);
    _trackFlight(id, { origin });
    return true;
  }

export function refocusMilitaryFlightsTrackedById(icao24, { origin = 'programmatic' } = {}) {
    if (!icao24 || S._cockpitContactMode || !S._viewer || !S._trackedEntity) return false;
    let id = String(icao24).trim();
    if (!S._billboards.has(id)) id = id.toLowerCase();
    if (
      id !== S._trackedIcao
      || !S._viewer.entities?.contains?.(S._trackedEntity)
      || S._viewer.trackedEntity !== S._trackedEntity
    ) return false;
    S._trackedCameraFrameStop?.();
    S._viewer.camera.cancelFlight();
    S._viewer.trackedEntity = S._trackedEntity;
    S._trackedCameraFrameStop = applyTrackedCameraFrame(
      S._viewer,
      S._trackedEntity,
      S._trackedEntity.viewFrom,
    ) || null;
    _publishTrackedSelection(id, origin);
    return true;
  }

export function stopMilitaryFlightsTracking({ origin = 'programmatic' } = {}) {
    _cancelPendingTrackingRestore();
    _clearTracking(false, { origin });
    return true;
  }

export function cancelMilitaryFlightsPendingTrackingRestore() {
    _cancelPendingTrackingRestore();
  }

export function getMilitaryFlightsTrackedInfo() {
    if (!S._trackedIcao) return null;
    const described = _describeFlight(S._trackedIcao);
    if (!described) return null;
    const { position, ...rest } = described;
    return rest;
  }

export function getMilitaryFlightsTrackedSubject() {
    if (!S._trackedIcao) return null;
    const described = _describeFlight(S._trackedIcao);
    if (!described?.position) return null;
    return {
      layerId: 'military',
      id: described.icao24,
      // Same label chain as getNearby/getDetectableObjects: a callsign-less
      // contact reads as its registration, never as the raw ICAO hex.
      label: described.callsign || described.registration || described.icao24,
      position: Cesium.Cartesian3.clone(described.position),
    };
  }

export function getMilitaryFlightsStats() {
    const retryInSec = S._retryAt ? Math.max(0, Math.ceil((S._retryAt - Date.now()) / 1000)) : 0;
    return {
      count: S._count,
      lastUpdate: S._lastUpdate,
      stale: S._backoff,
      error: S._lastError,
      status: S._lastStatus,
      retryInSec,
      source: 'adsb.lol',
      fallback: false,
    };
  }
