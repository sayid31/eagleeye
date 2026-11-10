// src/data/trafficHeights.js
/**
 * Road waypoint heights for the traffic layer.
 *
 * Dots are absolute 3D points drawn through the terrain within their
 * depth-test punch distance, so a waypoint at the wrong height does not just
 * float or sink: it projects onto a different screen spot than the road and
 * slides against the imagery whenever the camera moves. A cold ground-floor
 * cell used to fall back to ellipsoid height 0 (≈ the terrain height plus the
 * geoid offset below the road — 100 m+ in Central Java), and the waypoint kept
 * that height even after the cell resolved a second later.
 *
 * Two fixes live here: a batch fallback (median of the heights this batch did
 * resolve) instead of 0, and an in-place re-height once the floor lands.
 *
 * @module data/trafficHeights
 */
import * as Cesium from 'cesium';
import { S } from './trafficState.js';

/**
 * Median of the finite heights given, or null when there are none. Used as the
 * fallback for a waypoint with neither a warm cell nor a sampled road height:
 * every road in one fetch sits inside one ~5 km box, so the batch median is a
 * far better guess than the ellipsoid.
 * @param {number[]} heights
 * @returns {number|null}
 */
export function batchFallbackHeight(heights) {
  const finite = heights.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const mid = finite.length >> 1;
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

/**
 * Builds a road's waypoints. Height per waypoint: its own floor cell, else the
 * road's sampled height, else the batch fallback, else 0.
 * @param {number[][]} coords `[lng, lat]` pairs.
 * @param {(lat: number, lng: number) => number|null} floorAt Warm-cache floor read.
 * @param {number|null} roadHeight The road's first-vertex sample, if any.
 * @param {number|null} batchHeight See batchFallbackHeight.
 * @param {number} offset Meters above the surface.
 * @returns {{waypoints: Cesium.Cartesian3[], segmentDist: number[], cold: boolean}}
 *   `cold` is true when any waypoint used a fallback (worth a re-height later).
 */
export function materializeWaypoints(coords, floorAt, roadHeight, batchHeight, offset) {
  let cold = false;
  const fallback = roadHeight ?? batchHeight ?? 0;
  const waypoints = coords.map(([lng, lat]) => {
    const floor = floorAt(lat, lng);
    if (floor == null) cold = true;
    return Cesium.Cartesian3.fromDegrees(lng, lat, (floor ?? fallback) + offset);
  });
  return { waypoints, segmentDist: segmentDistances(waypoints), cold };
}

/**
 * Re-heights a road IN PLACE from cells that have since resolved. Dots hold the
 * same `waypoints`/`segmentDist` arrays, so moving dots follow on their next
 * frame; stopped dots need `repositionDotsOnRoads`.
 * @param {{coords: number[][], waypoints: Cesium.Cartesian3[], segmentDist: number[]}} road
 * @param {(lat: number, lng: number) => number|null} floorAt
 * @param {number} offset
 * @returns {number} How many waypoints moved.
 */
export function reheightRoad(road, floorAt, offset) {
  let moved = 0;
  road.coords.forEach(([lng, lat], i) => {
    // A height read on the rendered surface at this exact spot beats any
    // ~111 m cell value that lands later.
    if (road.surfaceRefined?.[i]) return;
    const floor = floorAt(lat, lng);
    if (floor == null) return;
    const before = Cesium.Cartographic.fromCartesian(road.waypoints[i]).height;
    const target = floor + offset;
    if (Math.abs(before - target) < 0.5) return;
    Cesium.Cartesian3.fromDegrees(lng, lat, target, Cesium.Ellipsoid.WGS84, road.waypoints[i]);
    moved += 1;
  });
  if (moved) {
    const dist = segmentDistances(road.waypoints);
    road.segmentDist.length = 0;
    road.segmentDist.push(...dist);
  }
  return moved;
}

/**
 * Re-places every live dot on the given roads at its current (segIdx, t) after
 * a re-height — stopped and creeping dots skip `animate()`'s lerp, so without
 * this they would keep the old height until they move again.
 * @param {Set<object>} roads Road objects whose waypoints changed.
 * @returns {number} Dots repositioned.
 */
export function repositionDotsOnRoads(roads) {
  let count = 0;
  const scratch = new Cesium.Cartesian3();
  for (const dot of S._dots) {
    if (!roads.has(dot.road)) continue;
    const a = dot.waypoints[dot.segIdx];
    const b = dot.waypoints[dot.segIdx + 1];
    if (!a || !b) continue;
    dot.point.position = Cesium.Cartesian3.lerp(a, b, dot.t, scratch);
    count += 1;
  }
  return count;
}

/** Meters between consecutive waypoints (speed → parametric t conversion). */
export function segmentDistances(waypoints) {
  const dist = [];
  for (let i = 0; i < waypoints.length - 1; i++) dist.push(Cesium.Cartesian3.distance(waypoints[i], waypoints[i + 1]));
  return dist;
}
