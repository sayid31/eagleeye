// Moved out of traffic.js (trafficTestHooks).

import { renderRoadsForAltitude } from './trafficRender.js';
import { S } from './trafficState.js';

/**
 * Test seam: injects a minimal viewer stand-in so `parseRoads`'s height
 * logic (sampleHeight fallback + camera position for the mesh sampler) is
 * reachable without a full `init(viewer)`, which wires a real
 * PointPrimitiveCollection into `scene.primitives`. Mirrors the
 * `_setViewerForTest`/`_set*ForTest` seam convention already used across
 * `src/data/*.js` (e.g. flights.js's `_setTrackedFlightRefreshStateForTest`).
 * @param {Cesium.Viewer|null} viewer
 */
export function _setViewerForTest(viewer) {
  S._viewer = viewer;
}

/**
 * Test seam: runs the real dot-spawn + heat-line rebuild pipeline
 * (`renderRoadsForAltitude`) directly against caller-supplied parsed roads,
 * bypassing the Overpass fetch/cache layer entirely. Exists to exercise the
 * `governorRequestRender('traffic-poll')` plumbing (perf wave 3) — whether a
 * road/dot load landing while the render loop is idle still requests a
 * frame — without mocking the network. Requires `init(viewer)` (or an
 * equivalent minimal viewer via `_setViewerForTest`) to have already run so
 * `_pointCollection` exists.
 * @param {Array} roads - Parsed road objects (see `parseRoads`'s output shape).
 * @param {number} altitude - Camera altitude in meters.
 * @param {string} [label='test'] - Logging label.
 */
export function _renderRoadsForAltitudeForTest(roads, altitude, label = 'test') {
  renderRoadsForAltitude(roads, altitude, label);
}
