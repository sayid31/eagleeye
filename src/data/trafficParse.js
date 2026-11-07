// Moved out of traffic.js (trafficParse).

import { OVERPASS_URL, buildOverpassQuery } from './trafficOverpassQuery.js';
import * as Cesium from 'cesium';
import { FLOOR_RESOLVE_DEADLINE_MS, cachedGroundFloor, resolveGroundFloorCells, warmGroundFloor } from './groundFloor.js';
import { batchFallbackHeight, materializeWaypoints, reheightRoad, repositionDotsOnRoads } from './trafficHeights.js';
import { sampleMeshFloorCells } from './meshFloorSampler.js';
import { DOT_HEIGHT_OFFSET, MAX_HEIGHT_FALLBACK_SAMPLES, MAX_WAYPOINTS_PER_ROAD, TRAFFIC_TIMING_ENABLED } from './trafficConstants.js';
import { S } from './trafficState.js';
import { trafficTimingMark, trafficTimingMeasure, trafficTimingPass } from './trafficTiming.js';

// ─── Overpass API ──────────────────────────────────────────

/**
 * Fetch road geometries from the Overpass API via the local proxy.
 *
 * Sends a POST with the query as form-encoded `data`. Supports
 * AbortController signals so in-flight requests can be cancelled
 * when the camera moves before the response arrives.
 *
 * @param {number} south - Southern latitude bound (degrees).
 * @param {number} west  - Western longitude bound (degrees).
 * @param {number} north - Northern latitude bound (degrees).
 * @param {number} east  - Eastern longitude bound (degrees).
 * @param {Object}  [opts]
 * @param {boolean} [opts.majorOnly=false]  - Restrict to major highway classes.
 * @param {number}  [opts.timeoutSec=25]    - Server-side Overpass timeout.
 * @param {AbortSignal} [opts.signal]       - Abort signal for cancellation.
 * @param {Object|null} [trace=null] - Development-only correlated load trace.
 * @returns {Promise<Object>} Parsed JSON response from Overpass.
 * @throws {Error} If the HTTP response status is not OK.
 */
export async function fetchRoads(
  south,
  west,
  north,
  east,
  { majorOnly = false, timeoutSec = 25, signal } = {},
  trace = null,
) {
  const query = buildOverpassQuery(south, west, north, east, { majorOnly, timeoutSec });
  const state = TRAFFIC_TIMING_ENABLED && trace
    ? trafficTimingPass(trace, majorOnly ? 'major' : 'full', 'proxy')
    : null;
  if (state) trace.currentPass = state.pass;
  const fetchStart = state ? trafficTimingMark(state, 'fetch-start') : null;
  if (state) {
    trafficTimingMeasure(
      'last-camera-change-to-fetch-start', state, trace.cameraChangeMark, fetchStart,
    );
  }
  // Wait clock for the honest "queued at the OSM mirror" copy. Tokened: an
  // aborted fetch settles AFTER its successor has started, and must not clear
  // the successor's clock.
  const waitSeq = ++S._osmWaitSeq;
  S._osmWaitStartedAt = performance.now();
  let response;
  try {
    response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal,
    });
  } finally {
    if (waitSeq === S._osmWaitSeq) S._osmWaitStartedAt = null;
  }

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status}`);
  }

  if (!state) return response.json();

  if (state) {
    state.proxyCache = response.headers.get('x-overpass-cache');
    state.proxyUpstream = response.headers.get('x-overpass-upstream');
  }
  const responseStart = state ? trafficTimingMark(state, 'response-json-start', {
    responseStatus: response.status,
  }) : null;
  if (state) {
    trafficTimingMeasure('fetch-to-response', state, fetchStart, responseStart, {
      responseStatus: response.status,
    });
  }
  const data = await response.json();
  if (state) {
    const responseEnd = trafficTimingMark(state, 'response-json-end', {
      responseStatus: response.status,
    });
    trafficTimingMeasure('response-json', state, responseStart, responseEnd, {
      responseStatus: response.status,
    });
  }
  return data;
}

/**
 * Parse an Overpass `out geom;` JSON response into internal road objects.
 *
 * Each OSM `way` element carries an inline `geometry` array of `{lat, lon}`
 * objects, so no separate node look-up or osmtogeojson conversion is needed.
 *
 * Processing per way:
 *  1. Extract [lon, lat] coordinate pairs.
 *  2. Sub-sample long polylines to at most MAX_WAYPOINTS_PER_ROAD vertices.
 *  3. Batch-warm the ground floor (DEM + rendered-mesh) for every waypoint
 *     across every road, then read each waypoint's height from ITS OWN
 *     cell — see the "per-waypoint height" note below.
 *  4. Convert to Cartesian3 waypoints and pre-compute inter-vertex distances.
 *
 * Per-waypoint height (2026-09): the original implementation sampled terrain
 * height ONCE at each road's first vertex and applied that single height to
 * every waypoint on the road ("avoids per-vertex cost"). Along any road that
 * crosses varying terrain/building height, later waypoints rendered at the
 * wrong elevation — dots drifting into buildings. This now reuses the same
 * batch-warm-then-sync-read pattern flights.js already relies on
 * (`groundFloor.js` + `meshFloorSampler.js`): warm every waypoint's coarse
 * cell up front (bounded wait so the FIRST paint benefits, not just a later
 * poll), then read each waypoint's own cell. Any cell that didn't resolve in
 * time falls back to the road's first-vertex `sampleHeight` — the original
 * behavior, not a hard dependency on the floor system being warm.
 *
 * @param {Object} overpassData - Raw JSON response from the Overpass API.
 * @param {Array}  overpassData.elements - Array of OSM elements.
 * @returns {Promise<Array<{coords:number[][], type:string, waypoints:Cesium.Cartesian3[], segmentDist:number[]}>>}
 *   Parsed road objects ready for dot spawning.
 */
export async function parseRoads(overpassData) {
  if (!overpassData || !overpassData.elements) return [];

  // Phase 1: pure coordinate/metadata extraction — no heights yet. Collect
  // every waypoint coordinate across every road for a single batch warm.
  const pending = [];
  const warmPoints = [];
  let heightFallbackSamples = 0;
  for (const el of overpassData.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;

    const rawCoords = el.geometry.map(g => [g.lon, g.lat]);

    // Sub-sample long polylines: keep every Nth vertex to stay within budget
    const simplifyStep = rawCoords.length > MAX_WAYPOINTS_PER_ROAD
      ? Math.ceil(rawCoords.length / MAX_WAYPOINTS_PER_ROAD)
      : 1;
    const coords = [];
    for (let i = 0; i < rawCoords.length; i += simplifyStep) {
      coords.push(rawCoords[i]);
    }

    // Ensure the original endpoint is always preserved
    const last = rawCoords[rawCoords.length - 1];
    const tail = coords[coords.length - 1];
    if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) {
      coords.push(last);
    }

    if (coords.length < 2) continue;

    const type = el.tags?.highway || 'unclassified';
    // One-way capture (field-test round 1: "a car would never go in
    // reverse"): dots on one-way roads all travel the legal direction.
    // OSM: oneway=yes/1/true → digitization order; '-1' → reversed;
    // roundabouts are one-way by definition. 0 = two-way (alternate).
    const onewayTag = el.tags?.oneway;
    const oneway = (onewayTag === 'yes' || onewayTag === '1' || onewayTag === 'true' || el.tags?.junction === 'roundabout')
      ? 1
      : (onewayTag === '-1' ? -1 : 0);

    // Fallback height: the original single first-vertex sample, kept as the
    // graceful-degrade path for any waypoint whose cell never resolves. Capped
    // at MAX_HEIGHT_FALLBACK_SAMPLES per call — Phase 2/3 below already
    // resolve real per-waypoint height for every road via the batched/cached
    // ground-floor system, so this raycast is a rare degrade path, not a
    // per-road requirement; roads past the cap use the batch median instead
    // (trafficHeights.js) until their own cell resolves.
    let baseHeight = null;
    const firstCoord = coords[0];
    if (S._viewer?.scene?.sampleHeightSupported && firstCoord && heightFallbackSamples < MAX_HEIGHT_FALLBACK_SAMPLES) {
      heightFallbackSamples++;
      const carto = Cesium.Cartographic.fromDegrees(firstCoord[0], firstCoord[1]);
      const sampled = S._viewer.scene.sampleHeight(carto);
      if (Number.isFinite(sampled)) baseHeight = sampled;
    }

    for (const [lng, lat] of coords) warmPoints.push({ lat, lon: lng });
    pending.push({ coords, type, oneway, baseHeight });
  }

  if (!pending.length) return [];

  // Phase 2: batch-warm the ground floor for every waypoint collected above —
  // DEM (fire-and-forget) + rendered mesh (rationed, viewer-proximate,
  // photoreal-only) + a bounded await so the first paint benefits instead of
  // only a later poll. No `excludeObjects`: traffic dots are
  // PointPrimitiveCollection entries, which scene.sampleHeight (tiles/terrain
  // only) doesn't hit, unlike flights.js's billboards/models.
  const carto = S._viewer?.camera?.positionCartographic;
  const viewerLatDeg = carto ? Cesium.Math.toDegrees(carto.latitude) : undefined;
  const viewerLonDeg = carto ? Cesium.Math.toDegrees(carto.longitude) : undefined;
  warmGroundFloor(warmPoints);
  sampleMeshFloorCells(S._viewer?.scene, warmPoints, { viewerLat: viewerLatDeg, viewerLon: viewerLonDeg });
  // Bounded wait (first paint uses what is warm); the full resolve keeps
  // running and re-heights cold roads when it lands (Phase 4).
  const fullResolve = resolveGroundFloorCells(warmPoints);
  await Promise.race([fullResolve, new Promise((resolve) => setTimeout(resolve, FLOOR_RESOLVE_DEADLINE_MS))]);

  // Phase 3: materialize waypoints — per-coordinate height from its own
  // resolved cell; cold cells fall back to the road's sample, then the batch
  // median, never straight to the ellipsoid when anything better is known.
  const floorAt = (lat, lng) => cachedGroundFloor(lat, lng);
  const batchHeight = batchFallbackHeight([
    ...warmPoints.map((p) => floorAt(p.lat, p.lon)),
    ...pending.map((road) => road.baseHeight),
  ]);
  const roads = [];
  const coldRoads = [];
  for (const { coords, type, oneway, baseHeight } of pending) {
    const { waypoints, segmentDist, cold } = materializeWaypoints(coords, floorAt, baseHeight, batchHeight, DOT_HEIGHT_OFFSET);
    const road = { coords, type, oneway, waypoints, segmentDist };
    roads.push(road);
    if (cold) coldRoads.push(road);
  }

  // Phase 4: once the late cells land, move cold roads (and their dots) onto them.
  if (coldRoads.length) {
    fullResolve.then(() => {
      const moved = new Set(coldRoads.filter((road) => reheightRoad(road, floorAt, DOT_HEIGHT_OFFSET) > 0));
      if (moved.size) repositionDotsOnRoads(moved);
    });
  }

  return roads;
}

// ─── Road Length Estimation ────────────────────────────────

/**
 * Estimate the total length of a road in meters from its degree-based coordinates.
 *
 * Uses Euclidean distance in degree-space then multiplies by the equatorial
 * approximation of 111 km per degree. Accurate enough for dot density spacing
 * but not for navigation.
 *
 * @param {number[][]} coords - Array of [lon, lat] pairs.
 * @returns {number} Approximate road length in meters.
 */
export function estimateRoadLengthDeg(coords) {
  let len = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  // Rough conversion: 1 degree ~ 111,000 meters at equator
  return len * 111000;
}
