import { buildOverpassQuery } from './trafficOverpassQuery.js';
import { LAYER_METADATA } from './layerMetadata.js';
import { resetFlowTileCache } from './flowTiles.js';
import { getTrafficDetectableObjects, setTrafficParams, updateTrafficLayer } from './trafficApi.js';
import { disableTrafficLayer, enableTrafficLayer, getTrafficStats, initTrafficLayer } from './trafficLifecycle.js';
import { removeHeatLines } from './trafficRender.js';
import { S, _tileCache } from './trafficState.js';

export { DOT_HEIGHT_OFFSET, MAX_HEIGHT_FALLBACK_SAMPLES, MAX_WAYPOINTS_PER_ROAD } from './trafficConstants.js';
export { trafficNeedsContinuousRender } from './trafficDots.js';
export { deriveTrafficFlowError, trafficFeedPresentation } from './trafficFlow.js';
export { parseRoads } from './trafficParse.js';
export { _renderRoadsForAltitudeForTest, _setViewerForTest } from './trafficTestHooks.js';
export { getTrafficTimingDiagnostics } from './trafficTiming.js';

export { buildOverpassQuery } from './trafficOverpassQuery.js';

// ─── Data Layer Interface ──────────────────────────────────

/**
 * Traffic data layer — conforms to the EagleEye View data-layer interface.
 *
 * Lifecycle: init -> enable -> (animate loop + camera-driven loads) -> disable -> destroy.
 * The layer is self-updating: no external tick is needed (`updateInterval: 0`).
 *
 * @type {Object}
 */
const trafficLayer = {
  ...LAYER_METADATA.traffic,
  /** @type {number} Zero — layer is self-managed via camera listener + preRender */
  updateInterval: 0,

  /**
   * One-time initialisation. Creates the PointPrimitiveCollection and adds it
   * to the scene (hidden). The collection is never removed and re-added — only
   * toggled via `.show` to avoid destroy-on-remove errors.
   *
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance.
   */
  init: initTrafficLayer,

  /**
   * Enable the traffic layer. Shows the point collection, subscribes to the
   * preRender animation loop and camera-change events, and kicks off an
   * initial viewport check.
   *
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance.
   */
  enable: enableTrafficLayer,

  /**
   * Disable the traffic layer. Cancels pending fetches, clears all dots,
   * unsubscribes from events, and hides the point collection.
   *
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance.
   */
  disable: disableTrafficLayer,

  /**
   * No-op — traffic updates are entirely camera-driven, not timer-driven.
   * @returns {Promise<void>}
   */
  update: updateTrafficLayer,

  /**
   * Update user-adjustable parameters (density and speed scaling).
   *
   * @param {Object}  [params]
   * @param {number}  [params.densityScale] - Dot density multiplier (clamped 0.2–2.5).
   * @param {number}  [params.speedScale]   - Dot speed multiplier (clamped 0.3–3.0).
   */
  setParams: setTrafficParams,

  /**
   * Return the current user-adjustable parameters.
   * @returns {{densityScale:number, speedScale:number}}
   */
  getParams() {
    return {
      densityScale: S._densityScale,
      speedScale: S._speedScale,
      uncoveredRoads: S._uncoveredMode,
      jamViz: S._jamViz,
      presetDots: S._presetDots,
    };
  },

  /**
   * Return a sub-sampled list of active dot positions for detection overlays
   * (e.g. CCTV bounding-box rendering).
   *
   * Uses a deterministic stride-based sampling so different seeds yield
   * non-overlapping subsets without sorting or shuffling.
   *
   * @param {Object}  [options]
   * @param {number}  [options.maxCount] - Maximum objects to return (defaults to all).
   * @param {number}  [options.seed]     - Integer seed to offset the sampling start.
   * @returns {Array<{position:Cesium.Cartesian3, id:string, type:string}>}
   */
  getDetectableObjects: getTrafficDetectableObjects,

  /**
   * Permanently tear down the layer. Disables it, removes the point collection
   * from the scene, and clears the tile cache.
   *
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance.
   */
  destroy(viewer) {
    this.disable(viewer);
    if (S._pointCollection) {
      viewer.scene.primitives.remove(S._pointCollection);
      S._pointCollection = null;
    }
    removeHeatLines();
    _tileCache.clear();
    resetFlowTileCache();
    S._count = 0;
    S._lastUpdate = null;
  },

  /**
   * Return current layer statistics for UI status chips.
   * `mode` is the CONFIGURED source — 'live' (a TomTom key is present) or
   * 'sim' (keyless simulation, which the manager renders as a FALLBACK chip);
   * `error` carries this instant's health, so a live-configured layer whose
   * flow feed went down reads DEGRADED with the reason instead of a stale
   * LIVE coverage number. `flowCoveragePct` is matched roads / roads with any
   * flow candidates (0–100 int); `tilesFetched` counts flow-tile requests
   * issued to the proxy this session (decode-cache hits excluded).
   * @returns {{count:number, lastUpdate:number|null, loading:boolean,
   *   mode:'live'|'sim', error:string|null, flowCoveragePct:number,
   *   tilesFetched:number}}
   */
  getStats: getTrafficStats,
};

export default trafficLayer;
