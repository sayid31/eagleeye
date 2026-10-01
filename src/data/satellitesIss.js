// Moved out of satellites.js (satellitesIss).

import { findNextIssPass } from './issPass.js';
import { DOCKED_COMPANION_RADIUS_M, DOCKED_SCAN_INTERVAL_MS, ISS_NORAD, ISS_OVERLAY_SOURCE_ID, ISS_OVERLAY_SOURCE_OPTIONS } from './satellitesConstants.js';
import { S } from './satellitesState.js';
import { _trackedDisplayCached } from './satellitesTracking.js';

/** Build the persistent ISS ambient label from the cached point position. */
export function createIssOverlayEntry(position) {
  return {
    id: String(ISS_NORAD),
    position,
    variant: 'label',
    title: 'ISS',
    accent: '#ff4444',
    priority: 1000,
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    distanceScale: {
      near: 1_000_000,
      nearValue: 1,
      far: 30_000_000,
      farValue: 0.4,
    },
    gapPx: 14,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Cached ISS point only; never performs a fresh SGP4 propagation. */
function _issDisplayCached() {
  return S._points.get(ISS_NORAD)?.position || null;
}

/**
 * Rebuild the docked-companion set for the tracked satellite.
 * @returns {boolean} true when membership changed (callers resync presentation).
 */
export function _refreshDockedCompanions(nowMs) {
  const trackedPosition = S._trackedNorad === null ? null : _trackedDisplayCached();
  if (!trackedPosition) {
    if (S._dockedCompanions.size === 0) return false;
    S._dockedCompanions = new Set();
    return true;
  }
  if (nowMs - S._lastDockedScanMs < DOCKED_SCAN_INTERVAL_MS) return false;
  S._lastDockedScanMs = nowMs;
  const radiusSq = DOCKED_COMPANION_RADIUS_M * DOCKED_COMPANION_RADIUS_M;
  let changed = false;
  let found = 0;
  const next = new Set();
  for (const [noradId, point] of S._points) {
    if (noradId === S._trackedNorad || !point?.position) continue;
    const dx = point.position.x - trackedPosition.x;
    const dy = point.position.y - trackedPosition.y;
    const dz = point.position.z - trackedPosition.z;
    if (dx * dx + dy * dy + dz * dz > radiusSq) continue;
    next.add(noradId);
    found++;
    if (!S._dockedCompanions.has(noradId)) changed = true;
  }
  if (found !== S._dockedCompanions.size) changed = true;
  if (changed) S._dockedCompanions = next;
  return changed;
}

/** Names of the docked companions, stable-sorted so the card text never churns. */
export function _dockedCompanionNames() {
  const names = [];
  for (const noradId of S._dockedCompanions) {
    names.push(S._catalog.get(noradId)?.name?.trim() || `SAT-${noradId}`);
  }
  return names.sort();
}

/** Keep persistent ISS text mutually exclusive with the tracked host card. */
export function _syncIssOverlay() {
  // Hidden when ISS is the tracked subject, and equally when ISS is DOCKED to
  // whatever is tracked: its ambient label would otherwise sit underneath the
  // tracked card at the same position.
  const visible = S._enabled && S._params.showOrbits && S._trackedNorad !== ISS_NORAD
    && !S._dockedCompanions.has(ISS_NORAD)
    && S._catalog.has(ISS_NORAD) && _issDisplayCached();
  if (!visible) {
    S._overlayHost.clearSource(ISS_OVERLAY_SOURCE_ID);
    S._overlayHost.setVisible(ISS_OVERLAY_SOURCE_ID, false);
    return;
  }
  S._overlayHost.setEntries(
    ISS_OVERLAY_SOURCE_ID,
    [createIssOverlayEntry(_issDisplayCached)],
    ISS_OVERLAY_SOURCE_OPTIONS,
  );
  S._overlayHost.setVisible(ISS_OVERLAY_SOURCE_ID, true);
}

/**
 * Next ISS pass for an observer. Requires the catalog to have loaded (the
 * satellites layer enabled at least once this session).
 * @returns {{status:'no-tle'}|{status:'none'}|{status:'ok', pass:{riseMs:number,setMs:number,maxElevDeg:number,maxElevMs:number,riseAzDeg:number}}}
 */
export function getNextIssPass({ latDeg, lonDeg, minElevDeg = 10 }) {
  const sat = S._catalog.get(ISS_NORAD);
  if (!sat || !sat.satrec) return { status: 'no-tle' };
  const pass = findNextIssPass({
    satrec: sat.satrec, latDeg, lonDeg, fromMs: Date.now(), minElevDeg,
  });
  return pass ? { status: 'ok', pass } : { status: 'none' };
}

export function internationalDesignatorYear(satrec) {
  const match = String(satrec?.intldesg || '').match(/^(\d{2})/);
  if (!match) return null;
  const shortYear = Number(match[1]);
  return shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
}
