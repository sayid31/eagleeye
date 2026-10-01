// Moved out of militaryFlights.js (militaryFlightsTrail).

import * as Cesium from 'cesium';
import { cachedGroundFloor, floorAltitudeM, resolveGroundFloorCellsBounded } from './groundFloor.js';
import { createTrail } from './trailRenderer.js';
import { trailHeadStart } from './modelVisualAnchor.js';
import { ensureGeoidReady, geoidHeight } from './geoid.js';
import { RENDER_DELAY_SEC, TRAIL_COLOR, TRAIL_MAX_POINTS } from './militaryFlightsConstants.js';
import { _trackedDisplayPosition, _trackedModelCenterWorld, _trackedModelEnvelopeM, _trackedTrailCached } from './militaryFlightsDisplay.js';
import { _dr } from './militaryFlightsInstances.js';
import { S, _scratchTrailCarto, _scratchTrailHead, _scratchTrailSeedTime } from './militaryFlightsState.js';

/**
 * Field-test round 2 (2026-07-06): floors a trail-bound position at the warm
 * coarse ground cell — a pure LIFT (above-floor positions pass through
 * untouched, unknown floors change nothing). Grounded military billboards
 * deliberately render at the pre-datum default height (T7 groundSnap
 * invariant), so every position entering the TRAIL subsystem (seed, append,
 * per-frame head) goes through this instead — the visible taxi history sits
 * on the surface without touching the billboard/model machinery.
 * @param {Cesium.Cartesian3} position - Owned position (mutated/replaced freely).
 * @returns {Cesium.Cartesian3} The same or a lifted position.
 */
function _trailFloorPosition(position) {
  const carto = Cesium.Cartographic.fromCartesian(position, Cesium.Ellipsoid.WGS84, _scratchTrailCarto);
  if (!carto) return position;
  const latDeg = Cesium.Math.toDegrees(carto.latitude);
  const lonDeg = Cesium.Math.toDegrees(carto.longitude);
  const floored = floorAltitudeM(carto.height, cachedGroundFloor(latDeg, lonDeg));
  if (floored == null || floored === carto.height) return position;
  return Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, floored);
}

/**
 * Append one fix to the tracked aircraft's trail accumulation and refresh
 * the rendered trail. Caller passes an owned (cloned) Cartesian3.
 * @param {Cesium.Cartesian3} position - New fix position, appended at the head.
 */
export function _appendTrailFix(position) {
  S._trailPositions.push(_trailFloorPosition(position));
  if (S._trailPositions.length > TRAIL_MAX_POINTS) S._trailPositions.shift();
  _refreshTrailDisplay();
}

/**
 * Renders the trail BODY — the accumulated fixes EXCLUDING the newest raw one. That
 * newest fix is at ~now, ~one poll interval AHEAD of the delayed icon (rendered at
 * now − RENDER_DELAY_SEC), so drawing it would push the trail in FRONT of the plane.
 * The cheap per-frame _trailHeadEntity segment bridges the last body point to the
 * delayed dead-reckoned head, so this primitive only rebuilds on a real fix (poll
 * cadence), never at motion cadence.
 */
function _refreshTrailDisplay() {
  if (!S._trail) return;
  S._trail.setPositions(S._trailPositions.length > 1 ? S._trailPositions.slice(0, -1) : S._trailPositions);
}

/**
 * Start the trail for a newly tracked aircraft: seed it with the short
 * dead-reckoning history (chronological), render immediately, then
 * fire-and-forget an adsb.lol trace backfill (~24 h of real history).
 * @param {string} icao24 - ICAO hex identifier being tracked.
 */
export function _startTrail(icao24) {
  S._trailBackfillToken += 1;
  S._trailPositions = [];
  const history = S._positionHistory.get(icao24) || [];
  // Seed only fixes at/behind the DELAYED display time (now − RENDER_DELAY_SEC). The
  // newest ~RENDER_DELAY_SEC of fixes are AHEAD of the displayed icon; including them
  // would draw the trail in front of the plane. They join via _appendTrailFix as they age.
  const seedRenderTime = Cesium.JulianDate.addSeconds(
    Cesium.JulianDate.now(), -RENDER_DELAY_SEC, _scratchTrailSeedTime
  );
  for (const fix of history) {
    if (Cesium.JulianDate.lessThanOrEquals(fix.time, seedRenderTime)) {
      // Floor grounded-history seeds (round 2): a grounded contact's stored
      // fixes carry the pre-datum default height — the trail copy sits on
      // the surface instead (pure lift; airborne fixes pass through).
      S._trailPositions.push(_trailFloorPosition(Cesium.Cartesian3.clone(fix.position)));
    }
  }
  if (!S._trail && S._viewer) {
    S._trail = createTrail(S._viewer, { color: TRAIL_COLOR, width: 2.5 });
  }
  S._trail?.setVisible(!S._cockpitContactMode);
  // Live head segment: last DISPLAYED body point → current dead-reckoned icon, updated
  // every frame via a CallbackProperty (Cesium updates entity-polyline positions cheaply,
  // unlike the trail primitive which fully rebuilds on setPositions). Keeps the head glued
  // to the 12 Hz icon instead of lagging ~1 s behind it.
  if (!S._trailHeadEntity && S._viewer) {
    S._trailHeadEntity = S._viewer.entities.add({
      // 'gev-trail' namespace (round 6): claimed by trailRenderer's pick
      // owner so a click on the head segment never reads as empty space.
      id: `gev-trail:mil-head-${++S._trailHeadSeq}`,
      show: !S._cockpitContactMode,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          // Need ≥2 accumulated points: the body draws all-but-newest, so the head must
          // start at the last DISPLAYED body point (index n−2). With a single fix that
          // point would be the sole raw fix — ~now, AHEAD of the delayed icon — so the
          // segment would draw IN FRONT of the plane. Likewise during warm-up the icon
          // predates all real history, so there is no valid body point behind it.
          if (!S._trackedIcao || S._trailPositions.length < 2 || _dr.isTrackWarmingUp()) return [];
          const head = _trackedTrailCached() || _trackedDisplayPosition(S._trackedIcao);
          if (!head) return [];
          // body[n−2] (last displayed body point) → delayed head: runs FORWARD, never a
          // backward/reversing segment.
          const start = S._trailPositions[S._trailPositions.length - 2];
          // Floor the head too (round 2): a grounded tracked contact's DR
          // display height is the pre-datum default — without this the last
          // segment dives underground while taxiing.
          const end = _trailFloorPosition(Cesium.Cartesian3.clone(head));
          // On a contact that has not moved this segment runs from inside the
          // model out to its own anchor — a line through the fuselage. The END
          // never gives, so a moving trail still terminates on the tail; the
          // START is what slides, from nothing on a parked contact out to the
          // whole segment once it has cleared its own envelope. Measured against
          // the FLOORED endpoint, which is the one actually drawn.
          // See trailHeadStart.
          const from = trailHeadStart(
            start, end, _trackedModelCenterWorld(), _trackedModelEnvelopeM(), _scratchTrailHead,
          );
          if (!from) return [];
          return [from, end];
        }, false),
        width: 2.5,
        material: Cesium.Color.fromCssColorString(TRAIL_COLOR).withAlpha(0.9),
        // Round 4: the head must never vanish into the mesh either (dimmed
        // when occluded so depth still reads).
        depthFailMaterial: Cesium.Color.fromCssColorString(TRAIL_COLOR).withAlpha(0.45),
        arcType: Cesium.ArcType.GEODESIC, // round 8: consistent with the trail body (no chords)
      },
    });
  }
  _refreshTrailDisplay();

  const oldestFixEpochSec = history.length
    ? Cesium.JulianDate.toDate(history[0].time).getTime() / 1000
    : Infinity;
  _backfillTrail(icao24, S._trailBackfillToken, oldestFixEpochSec);
}

/**
 * Fire-and-forget adsb.lol readsb trace backfill (PRD F2). Trace points are
 * stride-thinned to the remaining vertex budget, then spliced strictly older
 * than the oldest seeded fix AHEAD of the locally accumulated fine segment,
 * capped at TRAIL_MAX_POINTS (newest kept). Any failure (404/timeout/
 * malformed) silently keeps the local-only trail.
 * @param {string} icao24 - ICAO hex identifier being tracked.
 * @param {number} token - Backfill token captured at request time.
 * @param {number} oldestFixEpochSec - Epoch seconds of the oldest seeded fix.
 * @returns {Promise<void>}
 */
async function _backfillTrail(icao24, token, oldestFixEpochSec) {
  let baseEpochSec = null;
  let trace = null;
  try {
    const response = await fetch('/api/adsblol/trace?hex=' + encodeURIComponent(icao24), {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    const data = await response.json();
    baseEpochSec = Number(data?.timestamp);
    trace = Array.isArray(data?.trace) ? data.trace : null;
  } catch {
    return; // silent fallback to the accumulated trail
  }
  if (!trace || !Number.isFinite(baseEpochSec)) return;
  if (token !== S._trailBackfillToken || icao24 !== S._trackedIcao) return;

  // Height-datum fix (Task 7, mirror of flights.js Task 6 _backfillTrail): a
  // readsb trace point's altitude is barometric feet (same datum as the live
  // alt_baro, NOT geometric), so a trail waypoint's render height is the same
  // documented visual FALLBACK the live path uses — baroM + geoidHeight(lat,lon)
  // — geometrically approximate, not exact.
  await ensureGeoidReady();

  // readsb trace points: [secondsAfterTimestamp, lat, lon, alt_ft|'ground'|null, gs_kt, track, flags, ...]
  const parsed = [];
  for (const point of trace) {
    if (!Array.isArray(point)) continue;
    const t = baseEpochSec + Number(point[0]);
    const lat = Number(point[1]);
    const lon = Number(point[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!Number.isFinite(t) || t >= oldestFixEpochSec) continue;
    parsed.push({ lat, lon, altFt: point[3] });
  }
  if (!parsed.length) return;

  // Field-test fix (WAKE01 trail-underground, 2026-07-06): resolve the coarse
  // ellipsoidal ground along the trace and clamp every waypoint at it. A
  // 'ground'/null point sits ON the local surface — the old fixed 50 m
  // sentinel rendered ~1.5 km underground at Kirtland AFB (field ~1590 m
  // ellipsoidal) and dragged the whole pattern-work loop with it.
  // Round-2 fix (owner: "trails suddenly much shorter / not loading"): the
  // resolve is BOUNDED (≤1.2 s), not a blocking await — a cold Re:Earth
  // lookup across a long path could stall the paint for seconds-to-timeout.
  // Paint with whatever cells are warm; the resolve keeps filling the cache
  // in the background for the next paint/select.
  await resolveGroundFloorCellsBounded(parsed);
  // Re-check the backfill token after the await (same guard as post-fetch):
  // tracking may have moved on while the terrain race was in flight.
  if (token !== S._trailBackfillToken || icao24 !== S._trackedIcao) return;

  let older = [];
  let lastAltM = null; // carry-forward for ground points whose cell isn't warm yet
  for (const { lat, lon, altFt } of parsed) {
    const baroM = (altFt === 'ground' || altFt == null || !Number.isFinite(Number(altFt)))
      ? null
      : Number(altFt) * 0.3048 + geoidHeight(lat, lon);
    let altM = floorAltitudeM(baroM, cachedGroundFloor(lat, lon));
    // Ground/no-alt point with an unresolved floor: hold the previous
    // waypoint's altitude (continuity — never a dive to a made-up depth).
    // Leading points with nothing to carry keep the old low breadcrumb
    // sentinel (an arbitrary placeholder, never a reported altitude).
    if (altM == null) altM = lastAltM != null ? lastAltM : 50;
    lastAltM = altM;
    older.push(Cesium.Cartesian3.fromDegrees(lon, lat, altM));
  }

  // Stride-thin the backfill so it plus the live fine segment fit the cap.
  const budget = Math.max(1, TRAIL_MAX_POINTS - S._trailPositions.length);
  if (older.length > budget) {
    const stride = Math.ceil(older.length / budget);
    const thinned = [];
    for (let i = 0; i < older.length; i += stride) thinned.push(older[i]);
    older = thinned;
  }

  S._trailPositions = older.concat(S._trailPositions);
  if (S._trailPositions.length > TRAIL_MAX_POINTS) {
    S._trailPositions = S._trailPositions.slice(S._trailPositions.length - TRAIL_MAX_POINTS);
  }
  _refreshTrailDisplay();
}

/**
 * Clear the rendered trail and accumulation; invalidate pending backfills.
 */
export function _clearTrail() {
  S._trailBackfillToken += 1;
  S._trailPositions = [];
  if (S._trail) S._trail.clear();
  if (S._trailHeadEntity && S._viewer && !S._viewer.isDestroyed()) {
    try { S._viewer.entities.remove(S._trailHeadEntity); } catch { /* already gone */ }
  }
  S._trailHeadEntity = null;
}

/**
 * Destroy the trail primitive entirely (layer disable/teardown).
 */
export function _destroyTrail() {
  _clearTrail();
  if (S._trail) {
    S._trail.destroy();
    S._trail = null;
  }
}
