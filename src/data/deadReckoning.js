/**
 * deadReckoning.js — shared per-layer dead-reckoning/extrapolation engine for
 * flights.js and militaryFlights.js.
 *
 * Both aircraft layers kept near-identical copies of `_deadReckon`,
 * `_extrapolateFix`, and `_isTrackWarmingUp` at nearly the same offsets
 * (Wave 3 item #28 of the file-split program — see docs/DECISIONS.md).
 * This module is the reconciled core; each layer gets ONE instance via
 * `createDeadReckoning()`, matching the existing `createGroundSnap()` /
 * `createTrail()` per-layer-factory precedent (groundSnap.js, trailRenderer.js)
 * rather than a fully-pure/stateless redesign — `_flightData` and
 * `_positionHistory` are mutable, sometimes-REASSIGNED per-layer Maps (test
 * resets, destroy paths), so the factory takes ACCESSOR functions
 * (`getFlightData`/`getPositionHistory`) rather than capturing a Map
 * reference once, which would go stale across a reassignment.
 *
 * Reconciled divergences between the two layers' prior copies (kept, not
 * silently unified):
 *  - `renderDelaySec` is a genuine per-layer tuning constant (flights.js
 *    used 30s; militaryFlights.js used 15s) — required constructor option,
 *    not a shared default.
 *  - flights.js's per-fix `info` metadata uses `velocity`/`true_track`;
 *    militaryFlights.js's uses `speedMps`/`track`. Resolved via the
 *    `infoVelocity`/`infoTrack` reader options rather than hardcoding either
 *    layer's field names in the shared core. (Position-history FIX entries
 *    already use uniform `velocity`/`track` keys in both layers — no reader
 *    needed there.)
 *  - flights.js has a dev-only QA override (`FOCUS_EVIDENCE_DEV` +
 *    `_focusEvidenceIds`) that snaps dead-reckoning to a billboard's raw
 *    position for evidence-harness aircraft; militaryFlights.js has no
 *    equivalent. Modeled as the optional `focusEvidence` option — omitted
 *    entirely by militaryFlights.js, so that branch is simply never taken
 *    there (same one-check cost as before, just gated on option presence
 *    instead of a module-level dev flag).
 *  - `last.extrapolating` (whether the returned position came from
 *    extrapolation vs. interpolation) previously existed only in flights.js
 *    as `_drExtrapolating`, feeding its ground-floor-corridor logic
 *    (militaryFlights.js has no corridor feature). It is now always
 *    maintained by the shared core — militaryFlights.js simply has no
 *    reader for it, same "available to both, used by one" shape as below.
 *
 * `approxDistanceKm` moves here too, per the plan's item #28 scope — but it
 * is NOT actually duplicated: it previously existed only in flights.js
 * (militaryFlights.js has no lat/lon great-circle helper at all). This move
 * makes it available to both layers; it is not a de-dup.
 *
 * Module-scratch discipline preserved: `last` is ONE persistent object per
 * factory instance, mutated in place on every `deadReckon()`/call — never
 * reallocated — so callers read `dr.last.courseDeg` etc. IMMEDIATELY after
 * calling `dr.deadReckon()`, before any other call through the same
 * instance, exactly like the previous `_drCourseDeg`-style module scratches.
 */

import * as Cesium from 'cesium';
import {
  courseBetweenCartesians, arcOffsetEnu, lerpAngleDeg, speedRamp,
  staleCoastLimitSeconds, COURSE_HOLD_SPEED_MPS,
} from './motionModel.js';

/**
 * Cheap equirectangular distance (km) — plenty accurate for the ~100s-of-km
 * gates both layers use it for; runs at most once per contact per poll, so
 * no trig-heavy haversine needed.
 * @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2
 * @returns {number} Approximate great-circle distance in km.
 */
export function approxDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * 111.32;
  const dLon = (lon2 - lon1) * 111.32 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLon);
}

/**
 * Create a per-layer dead-reckoning engine.
 *
 * @param {object} options
 * @param {number} options.renderDelaySec - Display latency (s) = one poll
 *   interval; the layer renders at `now - renderDelaySec` so positions
 *   interpolate between two known fixes instead of extrapolating ahead and
 *   snapping back when the next poll lands.
 * @param {() => Map<string, object>} options.getPositionHistory - Accessor
 *   (not a captured reference) for the layer's icao -> fix-history Map,
 *   since the layer may reassign the Map itself (test resets, destroy).
 * @param {() => Map<string, object>} options.getFlightData - Accessor for
 *   the layer's icao -> latest-metadata Map.
 * @param {() => string|null} options.getTrackedIcao - Accessor for the
 *   layer's currently-tracked icao (isTrackWarmingUp only).
 * @param {(info: object) => number} options.infoVelocity - Reads ground
 *   speed (m/s) off a layer's `info` metadata object (field name differs
 *   per layer: flights.js `velocity`, militaryFlights.js `speedMps`).
 * @param {(info: object) => number} options.infoTrack - Reads true track
 *   (deg) off a layer's `info` metadata object (flights.js `true_track`,
 *   militaryFlights.js `track`).
 * @param {{ ids: Set<string>, getBillboardPosition: (icao24: string) =>
 *   Cesium.Cartesian3|undefined }} [options.focusEvidence] - Dev-only QA
 *   override (flights.js only): when the icao is in `ids`, dead-reckoning
 *   returns the billboard's raw position unchanged instead of running the
 *   normal history-based estimate. Omit entirely for layers with no
 *   evidence-harness support (militaryFlights.js).
 * @returns {{
 *   deadReckon: (icao24: string, result?: Cesium.Cartesian3) => Cesium.Cartesian3|null,
 *   isTrackWarmingUp: () => boolean,
 *   last: { courseDeg: number|null, speedMps: number|null, courseHold: boolean, extrapolating: boolean },
 * }}
 */
export function createDeadReckoning({
  renderDelaySec,
  getPositionHistory,
  getFlightData,
  getTrackedIcao,
  infoVelocity,
  infoTrack,
  focusEvidence = null,
}) {
  const _scratchOffset = new Cesium.Cartesian3();
  const _scratchEnu = new Cesium.Matrix4();
  const _scratchArc = { east: 0, north: 0, endCourseDeg: 0 };
  const _scratchRenderTime = new Cesium.JulianDate();
  const _scratchWarmupTime = new Cesium.JulianDate();

  /** Sibling-scratch output of `deadReckon`/`extrapolateFix`, mutated in
   *  place on every call — read IMMEDIATELY by the caller, never allocated
   *  per call (module-scratch idiom; see file header). */
  const last = { courseDeg: null, speedMps: null, courseHold: false, extrapolating: false };

  /**
   * Dead-reckon a fix along its own velocity/track by `dt` seconds,
   * integrating a constant-rate-turn arc when `turnRateDps` is significant
   * (straight line otherwise). Positive `dt` projects FORWARD (after the
   * fix); negative `dt` projects BACKWARD (before the fix) — used for
   * warm-up, estimating where the aircraft was before its first observed
   * fix. ENU frame: east = +X, north = +Y, up = +Z; heading 0 deg = north,
   * 90 deg = east (clockwise from north). Sets `last.courseDeg` to the arc's
   * instantaneous end course on every path.
   * Arc math adapted from skylight (https://github.com/cpaczek/skylight, MIT).
   */
  function extrapolateFix(fix, info, dt, out, turnRateDps = 0) {
    const speed = Number.isFinite(fix.velocity) ? fix.velocity : (infoVelocity(info) || 0);
    const heading = Number.isFinite(fix.track) ? fix.track : (infoTrack(info) || 0);
    last.speedMps = speed;
    last.courseHold = speed < COURSE_HOLD_SPEED_MPS;
    last.extrapolating = true;
    if (speed === 0 || dt === 0) {
      last.courseDeg = heading;
      return Cesium.Cartesian3.clone(fix.position, out);
    }
    // Constant-rate-turn arc (straight line when turnRateDps ≈ 0) — a plane in a
    // standard-rate turn is ~90° of arc wrong per 30 s if extrapolated straight.
    arcOffsetEnu(speed, heading, turnRateDps, dt, _scratchArc);
    last.courseDeg = _scratchArc.endCourseDeg;
    Cesium.Cartesian3.fromElements(_scratchArc.east, _scratchArc.north, 0, _scratchOffset);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(fix.position, Cesium.Ellipsoid.WGS84, _scratchEnu);
    return Cesium.Matrix4.multiplyByPoint(enu, _scratchOffset, out);
  }

  /**
   * Dead-reckon an aircraft's current position using ENU (East-North-Up)
   * frame math.
   *
   * Renders one poll interval (`renderDelaySec`) behind real time so
   * positions interpolate between two KNOWN fixes whenever possible. When
   * the newest fix is older than the delayed render time (stale position),
   * projects forward using the aircraft's ground speed and track through
   * the freshest source contact plus a bounded grace window.
   *
   * @param {string} icao24
   * @param {Cesium.Cartesian3} [result]
   * @returns {Cesium.Cartesian3|null}
   */
  function deadReckon(icao24, result) {
    const info = getFlightData().get(icao24);
    if (focusEvidence && focusEvidence.ids.has(icao24)) {
      const position = focusEvidence.getBillboardPosition(icao24);
      last.courseDeg = infoTrack(info) || 0;
      last.speedMps = infoVelocity(info) || 0;
      last.courseHold = last.speedMps < COURSE_HOLD_SPEED_MPS;
      last.extrapolating = false;
      return position ? Cesium.Cartesian3.clone(position, result || new Cesium.Cartesian3()) : null;
    }
    const history = getPositionHistory().get(icao24);
    if (!history || history.length === 0) {
      last.courseDeg = null; last.speedMps = null; last.courseHold = false; last.extrapolating = false;
      return null;
    }

    const out = result || new Cesium.Cartesian3();
    // Render one poll interval behind real time so we interpolate between
    // two KNOWN fixes whenever possible (see renderDelaySec rationale above).
    const renderTime = Cesium.JulianDate.addSeconds(
      Cesium.JulianDate.now(), -renderDelaySec, _scratchRenderTime
    );

    // Bracketing pair: interpolate — no extrapolation error, no snap-back.
    for (let i = history.length - 1; i >= 1; i--) {
      const a = history[i - 1];
      const b = history[i];
      if (
        Cesium.JulianDate.lessThanOrEquals(a.time, renderTime) &&
        Cesium.JulianDate.lessThanOrEquals(renderTime, b.time)
      ) {
        const span = Cesium.JulianDate.secondsDifference(b.time, a.time);
        const t = span > 0
          ? Cesium.JulianDate.secondsDifference(renderTime, a.time) / span
          : 1.0;
        // Course of the DISPLAYED motion. The chord is only trustworthy when the
        // segment covers real ground (at hover its direction is GPS jitter; on a
        // slow tight turn it STEPS the whole per-segment turn at each boundary),
        // so it is blended against the reported per-fix track by displayed
        // ground speed — and the track is TIME-INTERPOLATED between the fixes so
        // a slow turner's nose advances continuously through the segment instead
        // of snapping once per poll. Helicopters always use the reported track
        // (rotorcraft chords are noise-dominated at their typical speeds).
        const chordLenM = Cesium.Cartesian3.distance(a.position, b.position);
        const segSpeed = span > 0 ? chordLenM / span : (infoVelocity(info) || 0);
        const fallbackTrack = infoTrack(info) || 0;
        const trackFrom = Number.isFinite(a.track) ? a.track : fallbackTrack;
        const trackTo = Number.isFinite(b.track) ? b.track : trackFrom;
        const trackCourse = lerpAngleDeg(trackFrom, trackTo, t);
        const w = (info && info.klass === 'helicopter') ? 0 : speedRamp(segSpeed);
        const chordCourse = w > 0 ? courseBetweenCartesians(a.position, b.position) : null;
        last.courseDeg = chordCourse != null ? lerpAngleDeg(trackCourse, chordCourse, w) : trackCourse;
        last.speedMps = segSpeed;
        last.courseHold = segSpeed < COURSE_HOLD_SPEED_MPS;
        last.extrapolating = false;
        return Cesium.Cartesian3.lerp(a.position, b.position, t, out);
      }
    }

    const newest = history[history.length - 1];
    const elapsedSec = Cesium.JulianDate.secondsDifference(renderTime, newest.time);
    if (elapsedSec <= 0) {
      // Warm-up: renderTime predates ALL history (freshly seen / just-started-tracking
      // aircraft, before renderDelaySec of history has accumulated, so no bracketing
      // pair exists yet). Render at the DELAYED renderTime — preserving the
      // behind-real-time invariant — by extrapolating the OLDEST fix BACKWARD to
      // renderTime. As history fills, renderTime advances toward the first fix and
      // the icon glides FORWARD into the bracketing interpolation above with NO
      // freeze and NO backward snap. (Holding the oldest fix froze the icon until
      // enough history accrued, then jumped.)
      const oldest = history[0];
      const lookbackSec = Cesium.JulianDate.secondsDifference(oldest.time, renderTime); // ≥ 0
      return extrapolateFix(oldest, info, -Math.min(lookbackSec, 60), out, (info && info.turnRateDps) || 0);
    }

    // Newest POSITION is older than renderTime, but the source feed can still be
    // receiving fresh contact/kinematic messages for this aircraft; freezing at a
    // hard boundary produced a visible stop -> catch-up -> stop cadence. Coast
    // through the latest real contact plus a bounded grace window, with an
    // absolute cap so a stale cached feed cannot drift forever.
    // (flights.js previously passed minimumSec: 60, maximumSec: 300 explicitly;
    // militaryFlights.js relied on motionModel.js's own defaults, which are the
    // same values — omitted here too, functionally identical either way.)
    const coastLimitSec = staleCoastLimitSeconds({
      // `epochMs` is captured once when the poll is normalized. Avoid allocating
      // a Date per aircraft on every ~12 Hz fleet tick.
      fixEpochMs: Number.isFinite(newest.epochMs)
        ? newest.epochMs
        : Cesium.JulianDate.toDate(newest.time).getTime(),
      lastContactEpochMs: info?.lastContactEpochMs,
    });
    return extrapolateFix(
      newest,
      info,
      Math.min(elapsedSec, coastLimitSec),
      out,
      (info && info.turnRateDps) || 0,
    );
  }

  /**
   * True while the tracked aircraft's delayed display time
   * (now - renderDelaySec) predates its oldest real fix — i.e. `deadReckon`
   * is extrapolating backward, with no real history yet sitting BEHIND the
   * displayed icon. Callers use this to suppress trail-drawing in this
   * window (every accumulated point would be ahead of the icon).
   * @returns {boolean}
   */
  function isTrackWarmingUp() {
    const trackedIcao = getTrackedIcao();
    if (!trackedIcao) return false;
    const history = getPositionHistory().get(trackedIcao);
    if (!history || history.length === 0) return true;
    const renderTime = Cesium.JulianDate.addSeconds(
      Cesium.JulianDate.now(), -renderDelaySec, _scratchWarmupTime
    );
    return Cesium.JulianDate.lessThan(renderTime, history[0].time);
  }

  return { deadReckon, isTrackWarmingUp, last };
}
