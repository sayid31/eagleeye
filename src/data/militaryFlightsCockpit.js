// Moved out of militaryFlights.js (militaryFlightsCockpit).

import * as Cesium from 'cesium';
import { selectTrackedSubjectContext } from './contextStore.js';
import { tr3bTypeLabel } from './tr3bRegistry.js';
import { nextCockpitNearContacts } from './cockpitAirLod.js';
import { _formatAltitude, _toCleanText } from './militaryFlightsApi.js';
import { _modelAddDistM, _modelKeepDistM } from './militaryFlightsFleetModels.js';
import { _describeFlight } from './militaryFlightsFleetTick.js';
import { _applyFleetBillboardPresentation } from './militaryFlightsInstances.js';
import { S } from './militaryFlightsState.js';

export function _emitAwarenessEvent(type, detail) {
  if (typeof window === 'undefined' || !window.dispatchEvent || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function _publishTrackedSelection(icao24, origin = 'programmatic') {
  const bb = S._billboards.get(icao24);
  const info = S._flightData.get(icao24);
  if (!bb?.position || !info) return false;
  if (S._trackedEntity) S._trackedEntity.gevSelectionOrigin = origin;
  _emitAwarenessEvent('gev:awareness-subject-selected', {
    layerId: 'military',
    id: icao24,
    label: _toCleanText(info.callsign) || _toCleanText(info.registration) || icao24,
    position: Cesium.Cartesian3.clone(bb.position),
    origin,
  });
  selectTrackedSubjectContext(_contextSubjectMetadata(icao24));
  return true;
}

/**
 * Describe the selected contact for the shared context slot the voice tools
 * and Cockpit read. Values are the LIVE descriptor, not a selection-time
 * snapshot, so a long follow never narrates a position the plane has left.
 * @param {string} icao24 Contact identity.
 * @returns {object|null} Context metadata, or null when the contact is gone.
 */
export function _contextSubjectMetadata(icao24) {
  const described = _describeFlight(icao24);
  if (!described) return null;
  const info = S._flightData.get(icao24);
  const label = described.callsign || described.registration || icao24;
  return {
    id: icao24,
    layerId: 'military',
    layerName: 'Military Flights',
    source: 'adsb.lol',
    label,
    latitude: described.latitude,
    longitude: described.longitude,
    // Flat text only: the voice payload compacts properties through a
    // string cleaner that drops nested objects.
    properties: {
      name: label,
      operator: _toCleanText(info?.operator) || '',
      callsign: described.callsign || '',
      registration: described.registration || '',
      // Converted contacts report their class as TR-3B — the same override
      // the readout and Contacts card show.
      type: tr3bTypeLabel(icao24, _toCleanText(info?.type) || ''),
      altitude: described.onGround ? 'on ground' : _formatAltitude(info?.altitudeFt),
      speed: Number.isFinite(described.velocityMps)
        ? `${Math.round(described.velocityMps * 1.944)} kt`
        : '',
      heading: Number.isFinite(described.track) ? `${Math.round(described.track)}°` : '',
      icao24,
      // Honesty cue: the contact is coasting on dead reckoning, so the
      // narrated position/velocity are last-known rather than live.
      status: described.stale ? 'stale (missed polls)' : 'live',
    },
  };
}

export function _isExplicitTrackingOrigin(origin) {
  return origin === 'user' || origin === 'voice' || origin === 'tool';
}

/** Refresh the AIR-only Cockpit near band independently from model admission. */
export function _refreshCockpitNearContacts() {
  if (!S._cockpitContactMode || !S._viewer?.camera?.positionWC) {
    if (S._cockpitNearContacts.size) S._cockpitNearContacts = new Set();
    return;
  }
  const previous = S._cockpitNearContacts;
  const distancesSquared = [];
  for (const [icao24, bb] of S._billboards) {
    if (icao24 === S._trackedIcao || !bb?.position) continue;
    distancesSquared.push([
      icao24,
      Cesium.Cartesian3.distanceSquared(S._viewer.camera.positionWC, bb.position),
    ]);
  }
  const next = nextCockpitNearContacts(
    previous,
    distancesSquared,
    _modelAddDistM(),
    _modelKeepDistM(),
  );
  S._cockpitNearContacts = next;
  let presentationChanged = false;
  for (const [icao24, bb] of S._billboards) {
    if (previous.has(icao24) === next.has(icao24)) continue;
    _applyFleetBillboardPresentation(icao24, bb);
    presentationChanged = true;
  }
  if (presentationChanged) S._lastCamPoseSig = '';
}

/** Switch all current and future ambient contacts between silhouettes and cockpit pips. */
export function _setCockpitContactMode(active) {
  const next = active === true;
  if (S._cockpitContactMode === next) return;
  S._cockpitContactMode = next;
  if (next) _refreshCockpitNearContacts();
  else S._cockpitNearContacts = new Set();
  // The collection stays visible in cockpit. Near AIR contacts retain their
  // aircraft silhouette until a ready model takes over; far contacts are pips.
  // Never bulk-destroy here: that stalls the renderer exactly as cockpit begins.
  if (S._modelCollection) S._modelCollection.show = true;
  S._trail?.setVisible(!next);
  if (S._trailHeadEntity) S._trailHeadEntity.show = !next;
  for (const [icao24, bb] of S._billboards) _applyFleetBillboardPresentation(icao24, bb);
  S._lastCamPoseSig = '';
  S._lastFleetTickMs = 0;
}

export function _applyCockpitState(detail = {}) {
  const active = detail?.active === true;
  S._cockpitSubjectId = active
    ? String(detail?.subjectId || '').trim().toLowerCase() || null
    : null;
  _setCockpitContactMode(active);
}
