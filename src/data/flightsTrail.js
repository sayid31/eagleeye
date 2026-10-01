// Moved out of flights.js (flightsTrail).

import * as Cesium from 'cesium';
import { createTrail } from './trailRenderer.js';
import { trailHeadStart } from './modelVisualAnchor.js';
import { ensureGeoidReady, geoidHeight } from './geoid.js';
import { cachedGroundFloor, floorAltitudeM, resolveGroundFloorCellsBounded } from './groundFloor.js';
import { RENDER_DELAY_SEC, TRAIL_COLOR, TRAIL_MAX_POINTS } from './flightsConstants.js';
import { _trackedDisplayPosition, _trackedModelCenterWorld, _trackedModelEnvelopeM, _trackedTrailCached } from './flightsDisplay.js';
import { _dr } from './flightsInstances.js';
import { S, _scratchTrailHead, _scratchTrailSeedTime } from './flightsState.js';

/**
 * Append one fix to the tracked aircraft's trail accumulation and refresh
 * the rendered trail. Caller passes an owned (cloned) Cartesian3.
 * @param {Cesium.Cartesian3} position - New fix position, appended at the head.
 */
export function _appendTrailFix(position) {
  S._trailPositions.push(position);
  if (S._trailPositions.length > TRAIL_MAX_POINTS) S._trailPositions.shift();
  _refreshTrailDisplay();
}

/**
 * Renders the trail with its head clamped to the render-behind display
 * position. Raw newest fixes run up to RENDER_DELAY_SEC ahead of the
 * displayed aircraft (PRD C2 delayed clock) — drawing them verbatim makes
 * the trail extend in FRONT of the icon. The head is refreshed ~1Hz from
 * the fleet tick so it stays glued to the moving aircraft.
 */
function _refreshTrailDisplay() {
  // The trail BODY is the accumulated fixes EXCLUDING the newest raw one — that newest
  // fix is at ~now, ~one poll interval AHEAD of the delayed icon (rendered at
  // now − RENDER_DELAY_SEC), so drawing it would push the trail in front of the plane.
  // The cheap per-frame _trailHeadEntity segment bridges the last body point to the
  // delayed dead-reckoned head, so the body primitive only rebuilds on a real fix
  // (poll cadence), never at motion cadence.
  if (!S._trail) return;
  S._trail.setPositions(S._trailPositions.length > 1 ? S._trailPositions.slice(0, -1) : S._trailPositions);
}

/**
 * Start the trail for a newly tracked aircraft: seed it with the short
 * dead-reckoning history (chronological), render immediately, then
 * fire-and-forget an OpenSky track backfill.
 * @param {string} icao24 - ICAO 24-bit transponder address being tracked.
 */
export function _startTrail(icao24) {
  S._trailBackfillToken += 1;
  S._trailPositions = [];
  const history = S._positionHistory.get(icao24) || [];
  // Seed only fixes at/behind the DELAYED display time (now − RENDER_DELAY_SEC). The
  // newest ~RENDER_DELAY_SEC of fixes are AHEAD of the displayed icon; including them
  // would draw the trail in front of the plane. They join the trail via _appendTrailFix
  // as they age past the delay.
  const seedRenderTime = Cesium.JulianDate.addSeconds(
    Cesium.JulianDate.now(), -RENDER_DELAY_SEC, _scratchTrailSeedTime
  );
  for (const fix of history) {
    if (Cesium.JulianDate.lessThanOrEquals(fix.time, seedRenderTime)) {
      S._trailPositions.push(Cesium.Cartesian3.clone(fix.position));
    }
  }
  if (!S._trail && S._viewer) {
    S._trail = createTrail(S._viewer, { color: TRAIL_COLOR, width: 2.5 });
  }
  S._trail?.setVisible(!S._cockpitContactMode);
  // Live head segment: last fix → current dead-reckoned icon, updated every frame via
  // a CallbackProperty (Cesium updates entity-polyline positions cheaply, unlike the
  // trail primitive which fully rebuilds on setPositions). Keeps the head glued to the
  // 12 Hz icon instead of lagging ~1 s behind it.
  if (!S._trailHeadEntity && S._viewer) {
    S._trailHeadEntity = S._viewer.entities.add({
      // 'gev-trail' namespace (round 6): claimed by trailRenderer's pick
      // owner so a click on the head segment never reads as empty space.
      id: `gev-trail:fl-head-${++S._trailHeadSeq}`,
      show: !S._cockpitContactMode,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          // Need ≥2 accumulated points: the body draws all-but-newest, so the head must
          // start at the last DISPLAYED body point (index n−2). With a single fix that
          // point would be the sole raw fix — which is ~now, AHEAD of the delayed icon —
          // so the segment would draw IN FRONT of the plane. Likewise during warm-up the
          // icon predates all real history, so there is no valid body point behind it.
          if (!S._trackedIcao || S._trailPositions.length < 2 || _dr.isTrackWarmingUp()) return [];
          const head = _trackedTrailCached() || _trackedDisplayPosition(S._trackedIcao);
          if (!head) return [];
          // body[n−2] (last displayed body point) → delayed head: runs FORWARD, never a
          // backward/reversing segment.
          const start = S._trailPositions[S._trailPositions.length - 2];
          // On a contact that has not moved this segment runs from inside the
          // model out to its own anchor — a line through the fuselage. The END
          // never gives, so a moving trail still terminates on the tail; the
          // START is what slides, from nothing on a parked contact out to the
          // whole segment once it has cleared its own envelope.
          // See trailHeadStart. Read `head` in place and clone only on the draw
          // path — a suppressed parked contact runs this every frame.
          const from = trailHeadStart(
            start, head, _trackedModelCenterWorld(), _trackedModelEnvelopeM(), _scratchTrailHead,
          );
          if (!from) return [];
          return [from, Cesium.Cartesian3.clone(head)];
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
 * Fire-and-forget OpenSky /tracks backfill (PRD F1). On success, splices
 * waypoints strictly older than the oldest seeded fix AHEAD of the locally
 * accumulated fine segment, capped at TRAIL_MAX_POINTS (newest kept). Any
 * failure (404/429/timeout/malformed) silently keeps the local-only trail.
 * @param {string} icao24 - ICAO 24-bit transponder address being tracked.
 * @param {number} token - Backfill token captured at request time.
 * @param {number} oldestFixEpochSec - Epoch seconds of the oldest seeded fix.
 * @returns {Promise<void>}
 */
async function _backfillTrail(icao24, token, oldestFixEpochSec) {
  let path = null;
  try {
    const response = await fetch('/api/opensky-track?icao24=' + encodeURIComponent(icao24), {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    const data = await response.json();
    path = Array.isArray(data?.path) ? data.path : null;
  } catch {
    return; // silent fallback to the accumulated trail
  }
  if (!path || token !== S._trailBackfillToken || icao24 !== S._trackedIcao) return;

  // OpenSky track waypoints: [time, latitude, longitude, baro_altitude, true_track, on_ground]
  // Height-datum fix (Task 6): /tracks only ever reports barometric/MSL altitude
  // (no per-waypoint geo_altitude in this endpoint), so waypoint render height is
  // the documented visual FALLBACK baroM + geoidHeight(waypointLat, waypointLon)
  // — geometrically approximate, not exact, same honesty caveat as the live
  // baro-fallback branch of pickRenderAltitudeM.
  await ensureGeoidReady();
  const parsed = [];
  for (const waypoint of path) {
    if (!Array.isArray(waypoint)) continue;
    const [time, lat, lon, baroAlt] = waypoint;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!Number.isFinite(time) || time >= oldestFixEpochSec) continue;
    parsed.push({ lat, lon, baroAlt });
  }
  if (!parsed.length) return;

  // Field-test fix (WAKE01 trail-underground, 2026-07-06 — mirror of
  // militaryFlights.js): resolve the coarse ellipsoidal ground along the track
  // and floor every waypoint at it so low baro segments never dive below the
  // mesh; a no-baro waypoint (predominantly taxi/ground segments in /tracks)
  // sits ON the surface when the floor is known.
  // Round-2 fix (owner: "trails suddenly much shorter / not loading"): the
  // resolve is BOUNDED (≤1.2 s), not a blocking await — a cold Re:Earth
  // lookup across a long path could stall the paint for seconds-to-timeout.
  // Paint with whatever cells are warm; the resolve keeps filling the cache
  // in the background for the next paint/select.
  await resolveGroundFloorCellsBounded(parsed);
  // Re-check the backfill token after the await (same guard as post-fetch):
  // tracking may have moved on while the terrain race was in flight.
  if (token !== S._trailBackfillToken || icao24 !== S._trackedIcao) return;

  const older = [];
  let lastAltM = null; // carry-forward for no-baro points whose cell isn't warm yet
  for (const { lat, lon, baroAlt } of parsed) {
    const baroM = Number.isFinite(baroAlt) ? baroAlt + geoidHeight(lat, lon) : null;
    let altM = floorAltitudeM(baroM, cachedGroundFloor(lat, lon));
    // No baro + unresolved floor: hold the previous waypoint's altitude
    // (continuity — never a dive/spike to a made-up height). Leading points
    // with nothing to carry keep the old 10 km airborne default.
    if (altM == null) altM = lastAltM != null ? lastAltM : 10000;
    lastAltM = altM;
    older.push(Cesium.Cartesian3.fromDegrees(lon, lat, altM));
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
