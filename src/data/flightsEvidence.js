// Moved out of flights.js (flightsEvidence).

import { tr3bAircraftClass } from './tr3bRegistry.js';
import * as Cesium from 'cesium';
import { aircraftIcon } from './aircraftIcons.js';
import { normalBillboardScaleByDistance } from './aircraftPresentation.js';
import { FOCUS_EVIDENCE_DEV } from './flightsConstants.js';
import { _fleetBillboardColor, _fleetBillboardScale, _groundDepthDistance, _releaseModels } from './flightsFleetModels.js';
import { _iconKind } from './flightsInstances.js';
import { S, _displayCourse, _focusEvidenceIds } from './flightsState.js';
import { _clearTracking } from './flightsTracking.js';

/**
 * Map one aircraft's internal poll record to a plain JSON-safe analyst
 * record (analyst query engine seam). Pure — no Cesium types, no fetches;
 * enrichment fields read the CACHED adsbdb values only. Missing/unknown
 * fields are null, never NaN/undefined. The route-plausibility verdict is
 * computed by the CALLER (it needs the billboard position) and passed in,
 * so an implausible cached route is never surfaced as fact.
 * @param {string} icao24 - ICAO 24-bit transponder address.
 * @param {Object|null|undefined} info - `_flightData` record for this aircraft.
 * @param {{military?: boolean, routeOk?: boolean}} [flags] - Shared-registry
 *   military flag + route-plausibility verdict.
 * @returns {{id: string, icao24: string, callsign: string|null, lat: number|null,
 *   lon: number|null, altitudeM: number|null, speedMps: number|null,
 *   heading: number|null, verticalRateMps: number|null, onGround: boolean,
 *   military: boolean, aircraftClass: string|null, originCountry: string|null,
 *   operator: string|null, routeOrigin: string|null, routeDestination: string|null}}
 */
export function mapAnalystRecord(icao24, info, { military = false, routeOk = false } = {}) {
  const num = (v) => (Number.isFinite(v) ? v : null);
  const text = (v) => { const t = String(v ?? '').trim(); return t || null; };
  const callsign = text(info?.callsign);
  return {
    // Display identity for the narration layer. `id` is NOT a queryable field
    // (see ANALYST_LAYERS) and follow-ups carry whole records, so this is a
    // label, not a key — the engine keys on `icao24` below.
    id: callsign || text(info?.registration) || icao24,
    icao24,
    callsign,
    lat: num(info?.rawLat),
    lon: num(info?.rawLon),
    altitudeM: num(info?.altitude), // barometric/MSL — the aviation field, not the render height
    speedMps: num(info?.velocity),
    heading: num(info?.true_track),
    verticalRateMps: num(info?.verticalRate),
    onGround: info?.onGround === true,
    military,
    // A converted contact reports the class it RENDERS as, so an analyst
    // filter/superlative agrees with the triangle on screen.
    aircraftClass: tr3bAircraftClass(icao24, text(info?.klass)),
    originCountry: text(info?.originCountry),
    operator: text(info?.airline),
    routeOrigin: routeOk ? text(info?.route?.origin?.code) : null,
    routeDestination: routeOk ? text(info?.route?.destination?.code) : null,
  };
}

/** Resolve a JSON-safe evidence position into ECEF. DEV-only caller. */
function _focusEvidencePosition(record) {
  const cartesian = record?.cartesian;
  if (Array.isArray(cartesian) && cartesian.length >= 3
    && cartesian.slice(0, 3).every(Number.isFinite)) {
    return Cesium.Cartesian3.fromElements(cartesian[0], cartesian[1], cartesian[2]);
  }
  if (!Number.isFinite(record?.longitude) || !Number.isFinite(record?.latitude)) return null;
  return Cesium.Cartesian3.fromDegrees(
    record.longitude,
    record.latitude,
    Number.isFinite(record.altitudeM) ? record.altitudeM : 3_000,
  );
}

/** Replace the real fleet with deterministic explicit-position contacts. */
export function _setFocusEvidenceAircraft(records = []) {
  if (!FOCUS_EVIDENCE_DEV || !S._billboardCollection || !S._viewer) return { ok: false, count: 0 };
  if (S._trackedIcao) _clearTracking();
  _releaseModels();
  for (const bb of S._billboards.values()) S._billboardCollection.remove(bb);
  S._billboards.clear();
  S._flightData.clear();
  S._positionHistory.clear();
  _displayCourse.clear();
  S._missingPolls.clear();
  _focusEvidenceIds.clear();

  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.id || '').trim().toLowerCase();
    const position = _focusEvidencePosition(record);
    if (!id || !position) continue;
    const klass = record.klass || 'airliner';
    const altitudeM = Number.isFinite(record.altitudeM)
      ? record.altitudeM
      : (Cesium.Cartographic.fromCartesian(position)?.height || 3_000);
    const meta = {
      callsign: String(record.callsign || id).toUpperCase(),
      altitude: altitudeM,
      renderAltitudeM: altitudeM,
      velocity: Number.isFinite(record.velocityMps) ? record.velocityMps : 0,
      true_track: Number.isFinite(record.trackDeg) ? record.trackDeg : 90,
      klass,
      onGround: false,
      wasAirborne: true,
      turnRateDps: 0,
      lastContactEpochMs: Date.now(),
      rawLat: record.latitude ?? null,
      rawLon: record.longitude ?? null,
      cullPosition: null,
    };
    S._flightData.set(id, meta);
    _focusEvidenceIds.add(id);
    const bb = S._billboardCollection.add({
      position,
      image: aircraftIcon(_iconKind(id, klass)),
      width: 20,
      height: 20,
      scale: _fleetBillboardScale(id, klass),
      rotation: 0,
      alignedAxis: Cesium.Cartesian3.ZERO,
      color: _fleetBillboardColor(id),
      sizeInMeters: false,
      scaleByDistance: normalBillboardScaleByDistance(),
      disableDepthTestDistance: _groundDepthDistance(),
      id,
      show: true,
    });
    S._billboards.set(id, bb);
  }
  S._count = S._billboards.size;
  S._lastFleetTickMs = 0;
  S._viewer.scene.requestRender?.();
  return { ok: true, count: S._count };
}

/** Update explicit evidence positions without rebuilding billboards. */
export function _moveFocusEvidenceAircraft(records = []) {
  if (!FOCUS_EVIDENCE_DEV) return { ok: false, moved: 0 };
  let moved = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.id || '').trim().toLowerCase();
    if (!_focusEvidenceIds.has(id)) continue;
    const position = _focusEvidencePosition(record);
    const bb = S._billboards.get(id);
    if (!position || !bb) continue;
    bb.position = position;
    const meta = S._flightData.get(id);
    if (meta) {
      if (Number.isFinite(record.trackDeg)) meta.true_track = record.trackDeg;
      if (Number.isFinite(record.velocityMps)) meta.velocity = record.velocityMps;
    }
    moved += 1;
  }
  S._lastFleetTickMs = 0;
  S._viewer?.scene?.requestRender?.();
  return { ok: true, moved };
}

/** JSON-safe visual snapshot for the evidence report. */
export function _focusEvidenceSnapshot() {
  if (!FOCUS_EVIDENCE_DEV || !S._viewer) return [];
  return [..._focusEvidenceIds].map((id) => {
    const bb = S._billboards.get(id);
    const screen = bb?.position
      ? Cesium.SceneTransforms.worldToWindowCoordinates(S._viewer.scene, bb.position)
      : null;
    return {
      id,
      show: bb?.show === true,
      scale: bb?.scale ?? null,
      alpha: bb?.color?.alpha ?? null,
      x: screen?.x ?? null,
      y: screen?.y ?? null,
      cameraDistanceM: bb?.position
        ? Cesium.Cartesian3.distance(S._viewer.camera.positionWC, bb.position)
        : null,
    };
  });
}
