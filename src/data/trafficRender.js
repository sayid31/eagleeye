// Moved out of traffic.js (trafficRender).

import * as Cesium from 'cesium';
import { flowBucket } from './trafficFlowStyle.js';
import { trafficStyleProfile } from './trafficPresetStyle.js';
import { governorRequestRender } from '../renderGovernor.js';
import { HEAT_JAM_BASE_ALPHA, HEAT_JAM_COLOR, HEAT_LINE_CAP, HEAT_LINE_JAM_WIDTH, HEAT_LINE_SLOW_WIDTH, HEAT_SLOW_COLOR, MAX_DOTS, TRAFFIC_TIMING_ENABLED } from './trafficConstants.js';
import { allocateRoadDotBudgets, clearDots, spawnDotsForRoad } from './trafficDots.js';
import { S } from './trafficState.js';
import { heatlineOn } from './trafficStyle.js';
import { scheduleTrafficTimingPostRender, trafficTimingMark, trafficTimingMeasure, trafficTimingRenderState } from './trafficTiming.js';

/**
 * At high altitude only major roads render — shared by the render pass and
 * the late-flow heat-line rebuild so lines never mark roads without dots.
 * @param {Array} roads    - Parsed road objects.
 * @param {number} altitude - Camera altitude in meters.
 * @returns {Array} The roads visible at this altitude.
 */
export function visibleRoadsForAltitude(roads, altitude) {
  return altitude > 5000
    ? roads.filter(r => r.type === 'motorway' || r.type === 'trunk' || r.type === 'primary')
    : roads;
}

/** Remove both heat-line ground primitives from the scene. */
export function removeHeatLines() {
  if (S._heatJamPrim) {
    S._viewer?.scene.groundPrimitives.remove(S._heatJamPrim);
    S._heatJamPrim = null;
  }
  if (S._heatSlowPrim) {
    S._viewer?.scene.groundPrimitives.remove(S._heatSlowPrim);
    S._heatSlowPrim = null;
  }
  S._heatLineCount = 0;
}

/**
 * Rebuild the congestion heat-line underlay (jam-viz heatline prototype):
 * slow/jam roads drape a corridor line onto the rendered 3D tiles — glowing
 * pulsing red for jam, faint flat amber for slow — with the dots animating
 * on top. Two batched GroundPolylinePrimitives (one per bucket) so the jam
 * batch pulses through one shared material. Capped at HEAT_LINE_CAP (jam
 * first, longest first); overflow is logged. No-op in sim mode, when the
 * heatline mode is off, or without ground-primitive support.
 *
 * @param {Array} roads - Road objects visible in the current render.
 */
export function rebuildHeatLines(roads) {
  removeHeatLines();
  if (!S._viewer || !S._liveMode || !heatlineOn()) return;
  if (S._heatSupported === null) {
    S._heatSupported = Cesium.GroundPolylinePrimitive.isSupported(S._viewer.scene);
    if (!S._heatSupported) console.warn('[Data:Traffic] GroundPolylinePrimitive unsupported — heat-lines disabled');
  }
  if (!S._heatSupported) return;

  const candidates = [];
  for (const road of roads) {
    const flow = road.flow;
    if (!flow || flow.closure) continue;
    const bucket = flowBucket(flow.level);
    if (bucket === 'free') continue;
    let len = 0;
    for (const d of road.segmentDist) len += d;
    candidates.push({ road, bucket, len });
  }
  candidates.sort((a, b) => (a.bucket === b.bucket
    ? b.len - a.len
    : (a.bucket === 'jam' ? -1 : 1)));
  const kept = candidates.slice(0, HEAT_LINE_CAP);

  const instancesFor = (bucket, width) => kept
    .filter((c) => c.bucket === bucket)
    .map((c) => new Cesium.GeometryInstance({
      geometry: new Cesium.GroundPolylineGeometry({ positions: c.road.waypoints, width }),
    }));

  // Mono presets (NVG/FLIR/noir) discard hue — heat-lines re-encode in
  // luminance like the dots: jam = white glow, slow = faint gray.
  const monoHeat = S._presetDots === 'on' && trafficStyleProfile(S._stylePreset) === 'mono';
  const jamLineColor = monoHeat ? Cesium.Color.WHITE : HEAT_JAM_COLOR;
  const slowLineColor = monoHeat
    ? new Cesium.Color(0.7, 0.7, 0.7, HEAT_SLOW_COLOR.alpha)
    : HEAT_SLOW_COLOR;

  const jamInstances = instancesFor('jam', HEAT_LINE_JAM_WIDTH);
  if (jamInstances.length) {
    S._heatJamPrim = S._viewer.scene.groundPrimitives.add(new Cesium.GroundPolylinePrimitive({
      geometryInstances: jamInstances,
      classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
      appearance: new Cesium.PolylineMaterialAppearance({
        material: Cesium.Material.fromType('PolylineGlow', {
          color: jamLineColor.withAlpha(HEAT_JAM_BASE_ALPHA),
          glowPower: 0.25,
        }),
      }),
    }));
  }
  const slowInstances = instancesFor('slow', HEAT_LINE_SLOW_WIDTH);
  if (slowInstances.length) {
    S._heatSlowPrim = S._viewer.scene.groundPrimitives.add(new Cesium.GroundPolylinePrimitive({
      geometryInstances: slowInstances,
      classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
      appearance: new Cesium.PolylineMaterialAppearance({
        material: Cesium.Material.fromType('Color', { color: slowLineColor }),
      }),
    }));
  }

  S._heatLineCount = kept.length;
  if (candidates.length > kept.length) {
    console.log(`[Data:Traffic] Heat-lines capped at ${HEAT_LINE_CAP} (${candidates.length} congested roads in view)`);
  }
}

/**
 * Clear existing dots and re-spawn them for the given road set and altitude.
 *
 * When zoomed out (>5 km), only major road types are rendered to reduce clutter.
 * Dot budgets are allocated fairly across visible roads via `allocateRoadDotBudgets`.
 *
 * @param {Array} roads    - Parsed road objects to render.
 * @param {number} altitude - Camera altitude in meters.
 * @param {string} label    - Logging label (e.g. "Cache full", "Loaded major").
 * @param {Object|null} [trace=null] - Development-only correlated load trace.
 */
export function renderRoadsForAltitude(roads, altitude, label, trace = null) {
  const state = TRAFFIC_TIMING_ENABLED && trace
    ? trafficTimingRenderState(trace, label)
    : null;
  const renderId = state ? ++trace.renderSequence : null;
  clearDots();
  S._roads = roads;
  S._lastRenderAltitude = altitude;

  // At high altitude, drop minor roads to reduce visual noise
  const filteredRoads = visibleRoadsForAltitude(roads, altitude);

  // Closed roads spawn zero dots (computeDotCount/spawnDotsForRoad) — count
  // them here so the closure signal is visible in stats even at zero dots.
  S._closedRoads = S._liveMode
    ? filteredRoads.reduce((n, r) => n + (r.flow?.closure ? 1 : 0), 0)
    : 0;

  // Fade distances must track the camera-to-AREA distance, not assume a
  // nadir view: oblique pitches put the loaded roads many km away even at
  // low altitude. Probe three roads and stretch the curves accordingly.
  let areaDist = altitude;
  if (S._viewer && filteredRoads.length) {
    const probes = [
      filteredRoads[0],
      filteredRoads[Math.floor(filteredRoads.length / 2)],
      filteredRoads[filteredRoads.length - 1],
    ];
    for (const probe of probes) {
      const wp = probe?.waypoints?.[0];
      if (wp) areaDist = Math.max(areaDist, Cesium.Cartesian3.distance(S._viewer.camera.positionWC, wp));
    }
  }
  S._fadeScaleFar = Math.max(8000, areaDist * 1.5);
  S._fadeTransFar = Math.max(10000, areaDist * 1.8);

  const dotStart = state ? trafficTimingMark(state, 'dot-construction-start', {
    renderId,
    renderLabel: label,
    roadCount: roads.length,
    visibleRoadCount: filteredRoads.length,
  }) : null;
  const roadBudgets = allocateRoadDotBudgets(filteredRoads, altitude, MAX_DOTS);
  for (let i = 0; i < filteredRoads.length; i++) {
    const road = filteredRoads[i];
    const budget = roadBudgets[i] || 0;
    if (budget <= 0) continue;
    spawnDotsForRoad(road, altitude, budget);
    if (S._dots.length >= MAX_DOTS) break;
  }

  const renderMetrics = state ? {
    renderId,
    renderLabel: label,
    roadCount: roads.length,
    visibleRoadCount: filteredRoads.length,
    dotCount: S._dots.length,
  } : null;
  if (state) {
    const dotEnd = trafficTimingMark(state, 'dot-construction-end', renderMetrics);
    trafficTimingMeasure('dot-construction', state, dotStart, dotEnd, renderMetrics);
  }

  const heatStart = state ? trafficTimingMark(state, 'rebuild-heat-lines-start', renderMetrics) : null;
  rebuildHeatLines(filteredRoads);
  if (state) {
    const heatEnd = trafficTimingMark(state, 'rebuild-heat-lines-end', {
      ...renderMetrics,
      heatLineCount: S._heatLineCount,
    });
    trafficTimingMeasure('rebuild-heat-lines', state, heatStart, heatEnd, {
      ...renderMetrics,
      heatLineCount: S._heatLineCount,
    });
  }

  S._count = S._dots.length;
  S._lastUpdate = Date.now();
  console.log(`[Data:Traffic] ${label}: ${S._count} dots (roads=${roads.length}, alt=${Math.round(altitude)}m)`);
  if (state) {
    const renderEnd = trafficTimingMark(state, 'render-return', renderMetrics);
    scheduleTrafficTimingPostRender(state, renderEnd, renderId, renderMetrics);
  }
  // A road load landing while idle (hold released, viewport was empty) still
  // needs one frame to paint the just-spawned dots/heat-lines — animate() is
  // a preRender listener, so it can't run to re-take the hold until a frame
  // is actually requested. This also flushes the visual clear when a load
  // resolves to zero dots (e.g. every road in view is closed).
  governorRequestRender('traffic-poll');
}
