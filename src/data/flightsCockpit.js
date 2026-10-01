// Moved out of flights.js (flightsCockpit).

import * as Cesium from 'cesium';
import { selectTrackedSubjectContext } from './contextStore.js';
import { nextCockpitNearContacts } from './cockpitAirLod.js';
import { _contactLabel, _routeIsPlausible } from './flightsApi.js';
import { _modelAddDistM, _modelKeepDistM } from './flightsFleetModels.js';
import { _describeFlight } from './flightsFleetTick.js';
import { _applyFleetBillboardPresentation } from './flightsInstances.js';
import { S } from './flightsState.js';

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
    layerId: 'flights',
    id: icao24,
    // Canonical display chain (callsign → registration → hex). Publishing a
    // bare `callsign || icao24` here resurrected the pre-enrichment behavior:
    // a callsign-less contact reached Context as its raw hex even once adsbdb
    // had supplied a registration. Identity below stays `icao24`.
    label: _contactLabel(icao24, info),
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
  const altFt = Math.round((described.altitudeM || 0) * 3.28084);
  const route = described.route && _routeIsPlausible(icao24, described.route)
    ? `${described.route.origin.code} → ${described.route.destination.code}`
    : null;
  return {
    id: icao24,
    layerId: 'flights',
    layerName: 'Live Flights',
    source: 'OpenSky Network',
    label: _contactLabel(icao24, S._flightData.get(icao24)),
    latitude: described.latitude,
    longitude: described.longitude,
    // Flat text only: the voice payload compacts properties through a
    // string cleaner that drops nested objects.
    properties: {
      name: _contactLabel(icao24, S._flightData.get(icao24)),
      operator: described.airline || '',
      callsign: described.callsign || '',
      registration: described.registration || '',
      type: described.typeName || described.typeCode || '',
      altitude: described.onGround ? 'on ground' : `${altFt.toLocaleString('en-US')} ft`,
      speed: Number.isFinite(described.velocityMps)
        ? `${Math.round(described.velocityMps * 1.944)} kt`
        : '',
      heading: Number.isFinite(described.track) ? `${Math.round(described.track)}°` : '',
      route: route || '',
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

/**
 * Refresh the Cockpit AIR near/far band without consulting model state.
 * Near contacts keep their 2D aircraft silhouette when 3D is off, loading, or
 * capped; only a ready admitted model may take that silhouette over later.
 */
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
  // Never destroy on entry: tearing down hundreds of live glTF instances
  // synchronously blocked Chrome's renderer into Page Unresponsive.
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
