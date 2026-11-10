// src/data/trafficSurfaceHeights.js
/**
 * Puts traffic road waypoints on the rendered globe surface at their exact
 * coordinate.
 *
 * `parseRoads` heights each waypoint from the ground-floor cell it falls in,
 * which is one height per ~111 m (`FLOOR_CELL_DEG`) read at the cell centre,
 * plus DOT_HEIGHT_OFFSET. On a globe stack (Esri / OSM over Re:Earth terrain)
 * that terrain is a surface model: in Jakarta adjacent cells differ by a
 * median 1.2 m, p90 3.8 m, up to 18.7 m (2026-11-10, cached tiles around
 * -6.21, 106.85), so a street waypoint often inherits a rooftop or canopy
 * height. A dot draws through the terrain within its depth-test punch
 * distance, so a dot h metres too high shows h / tan(pitch) metres further
 * from the camera — about 2 m per metre at a 25° pitch — and on 3–6 m wide
 * residential streets that lands it on the roofs beside the road.
 *
 * `globe.getHeight` answers from the terrain mesh the user is looking at, at
 * the waypoint itself. It is a CPU pick, so the pass is time-sliced, nearest
 * roads first, and waits for the globe's tiles to finish loading so it reads
 * the level of detail on screen. Photoreal stacks hide the globe and keep the
 * mesh-cell floor (`meshFloorSampler.js`) instead.
 *
 * @module data/trafficSurfaceHeights
 */
import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import { cachedGroundFloor } from './groundFloor.js';
import { DOT_HEIGHT_OFFSET } from './trafficConstants.js';
import { reheightRoad, repositionDotsOnRoads, segmentDistances } from './trafficHeights.js';
import { S } from './trafficState.js';

/**
 * Metres above the rendered surface for a waypoint whose height was read at
 * its exact coordinate. Lower than DOT_HEIGHT_OFFSET (3 m), which still covers
 * the cell estimate: every metre a dot floats shows as sideways drift, and
 * close dots draw through the terrain anyway.
 */
export const SURFACE_DOT_HEIGHT_OFFSET = 1.0;
/** Main-thread milliseconds the pass may use per rendered frame. */
export const SURFACE_REFINE_FRAME_BUDGET_MS = 4;
/** Longest wait for the globe tiles before heights are read anyway. */
export const SURFACE_REFINE_MAX_WAIT_MS = 3000;
/** Height changes smaller than this are not written (no churn on re-runs). */
const SURFACE_MOVE_EPSILON_M = 0.25;

const _scratchCarto = new Cesium.Cartographic();
let _generation = 0;
let _remover = null;

/**
 * Re-heights a road's waypoints IN PLACE from `sampleSurface`, marking each
 * one it could read in `road.surfaceRefined` so a late cell floor
 * (`reheightRoad`) does not overwrite it. Waypoints with no reading keep
 * their current height.
 * @param {{coords: number[][], waypoints: Cesium.Cartesian3[], segmentDist: number[], surfaceRefined?: boolean[]}} road
 * @param {(lat: number, lng: number) => number|undefined} sampleSurface Ellipsoidal height or undefined.
 * @param {number} offset Metres above the surface.
 * @returns {number} How many waypoints moved.
 */
export function refineRoadToSurface(road, sampleSurface, offset) {
  road.surfaceRefined ||= [];
  let moved = 0;
  road.coords.forEach(([lng, lat], i) => {
    const surface = sampleSurface(lat, lng);
    if (!Number.isFinite(surface)) return;
    road.surfaceRefined[i] = true;
    const target = surface + offset;
    const before = Cesium.Cartographic.fromCartesian(road.waypoints[i], Cesium.Ellipsoid.WGS84, _scratchCarto).height;
    if (Math.abs(before - target) < SURFACE_MOVE_EPSILON_M) return;
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
 * Orders roads by distance from the camera to their middle waypoint, so the
 * dots the user is looking at are corrected first.
 * @param {Array<{waypoints: Cesium.Cartesian3[]}>} roads
 * @param {Cesium.Cartesian3} cameraPosition
 * @returns {Array} A new, sorted array.
 */
export function roadsNearestFirst(roads, cameraPosition) {
  return roads
    .map((road) => ({
      road,
      distance: Cesium.Cartesian3.distance(cameraPosition, road.waypoints[road.waypoints.length >> 1]),
    }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ road }) => road);
}

/**
 * Hands cached roads back to the cell floor once the globe is hidden (a switch
 * to the photoreal stack): their globe-surface heights sit under the
 * photogrammetric mesh, which the cell floor tracks there.
 * @param {Array} roads
 * @param {(lat: number, lng: number) => number|null} [floorAt]
 * @returns {number} Roads handed back.
 */
export function releaseSurfaceHeights(roads, floorAt = cachedGroundFloor) {
  const released = new Set();
  for (const road of roads) {
    if (!road?.surfaceRefined) continue;
    delete road.surfaceRefined;
    reheightRoad(road, floorAt, DOT_HEIGHT_OFFSET);
    released.add(road);
  }
  if (released.size) repositionDotsOnRoads(released);
  return released.size;
}

/** Stops any running surface pass. */
export function cancelSurfaceRefine() {
  _generation += 1;
  _remover?.();
  _remover = null;
}

/**
 * Starts a time-sliced pass that puts the given roads' waypoints on the
 * rendered globe surface. Replaces any pass already running. No-op when the
 * globe is hidden (photoreal stack) or there is nothing to do.
 * @param {Array} roads Roads whose dots are on screen.
 * @param {{now?: () => number}} [options] Clock seam for tests.
 * @returns {boolean} Whether a pass was started.
 */
export function scheduleSurfaceRefine(roads, { now = () => performance.now() } = {}) {
  cancelSurfaceRefine();
  const scene = S._viewer?.scene;
  const globe = scene?.globe;
  const cameraPosition = S._viewer?.camera?.positionWC;
  if (globe && !globe.show && roads?.length) releaseSurfaceHeights(roads);
  if (!globe?.show || typeof globe.getHeight !== 'function' || !cameraPosition || !roads?.length) return false;
  const generation = _generation;
  const queue = roadsNearestFirst(roads.filter((road) => road?.waypoints?.length), cameraPosition);
  const sampleSurface = (lat, lng) => globe.getHeight(Cesium.Cartographic.fromDegrees(lng, lat, 0, _scratchCarto));
  const startedAt = now();
  let index = 0;
  const step = () => {
    if (generation !== _generation || !S._enabled) return;
    if (!globe.tilesLoaded && now() - startedAt < SURFACE_REFINE_MAX_WAIT_MS) return;
    const deadline = now() + SURFACE_REFINE_FRAME_BUDGET_MS;
    const moved = new Set();
    while (index < queue.length && now() < deadline) {
      const road = queue[index++];
      if (refineRoadToSurface(road, sampleSurface, SURFACE_DOT_HEIGHT_OFFSET) > 0) moved.add(road);
    }
    if (moved.size) repositionDotsOnRoads(moved);
    if (index >= queue.length) cancelSurfaceRefine();
    // Idle render mode only draws when asked: keep frames coming until the
    // pass is done, and paint its last batch.
    if (index < queue.length || moved.size) governorRequestRender('traffic-surface-heights');
  };
  _remover = scene.postRender.addEventListener(step);
  governorRequestRender('traffic-surface-heights');
  return true;
}
