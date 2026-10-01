// Moved out of traffic.js (trafficTiming).

import * as Cesium from 'cesium';
import { cachedGroundFloor, resolveGroundFloorCellsBounded, warmGroundFloor } from './groundFloor.js';
import { sampleMeshFloorCells } from './meshFloorSampler.js';
import { DOT_HEIGHT_OFFSET, MAX_HEIGHT_FALLBACK_SAMPLES, MAX_WAYPOINTS_PER_ROAD, TRAFFIC_TIMING_ENABLED } from './trafficConstants.js';
import { loadRoadsForBounds } from './trafficLoad.js';
import { S } from './trafficState.js';
import { clampBounds } from './trafficView.js';

/**
 * Return development timing counters for the capture harness and inertness test.
 * This named export is unused by the application and removed from production.
 * @returns {{enabled:boolean, marksInstalled:number, traceObjectsCreated:number,
 *   uncorrelatedTracesDropped:number}}
 */
export function getTrafficTimingDiagnostics() {
  return {
    enabled: Boolean(TRAFFIC_TIMING_ENABLED),
    marksInstalled: S._trafficTimingMoveEndRemover ? 1 : 0,
    traceObjectsCreated: S._trafficTimingTracesCreated,
    uncorrelatedTracesDropped: S._trafficTimingDroppedTraces,
  };
}

// ─── Development-only causal timing ───────────────────────

/**
 * Return (and optionally update) the current trace's state for a render pass.
 * This function is only reachable when `TRAFFIC_TIMING_ENABLED` is true.
 *
 * @param {Object|null} trace - Correlated load trace.
 * @param {'major'|'full'} pass - Road-fetch/render pass.
 * @param {string} [source] - Client cache or proxy/network source.
 * @returns {Object|null} Mutable pass timing state.
 */
export function trafficTimingPass(trace, pass, source) {
  if (!trace) return null;
  let state = trace.passes.get(pass);
  if (!state) {
    state = {
      trace,
      pass,
      source: source || 'unknown',
      proxyCache: null,
      proxyUpstream: null,
    };
    trace.passes.set(pass, state);
  } else if (source) {
    state.source = source;
  }
  return state;
}

/** Build a structured-clone-safe detail object for User Timing entries. */
function trafficTimingDetail(state, segment, extra = {}) {
  return {
    trafficTiming: true,
    segment,
    traceId: state?.trace?.id ?? null,
    interactionId: state?.trace?.interactionId ?? null,
    cameraChangeTimestamp: state?.trace?.cameraChangeTimestamp ?? null,
    generation: state?.trace?.generation ?? null,
    cacheKey: state?.trace?.cacheKey ?? null,
    pass: state?.pass || 'load',
    source: state?.source || 'unknown',
    proxyCache: state?.proxyCache || null,
    proxyUpstream: state?.proxyUpstream || null,
    ...extra,
  };
}

/** Add a uniquely named User Timing mark and return its name. */
export function trafficTimingMark(state, phase, extra = {}, startTime) {
  const traceId = state?.trace?.id ?? 'interaction';
  const pass = state?.pass || 'load';
  const name = `traffic:${traceId}:${pass}:${phase}:${++S._trafficTimingSequence}`;
  const options = { detail: trafficTimingDetail(state, phase, extra) };
  if (Number.isFinite(startTime)) options.startTime = startTime;
  performance.mark(name, options);
  return name;
}

/** Emit a named User Timing measure between two marks. */
export function trafficTimingMeasure(segment, state, start, end, extra = {}) {
  performance.measure(`traffic:${segment}:${state?.pass || 'load'}`, {
    start,
    end,
    detail: trafficTimingDetail(state, segment, extra),
  });
}

/** Emit an aggregate-duration measure without pretending its work was contiguous. */
function trafficTimingAggregate(segment, state, anchorTime, duration, extra = {}) {
  const start = trafficTimingMark(state, `${segment}-aggregate-start`, extra, anchorTime);
  const end = trafficTimingMark(state, `${segment}-aggregate-end`, extra, anchorTime + duration);
  trafficTimingMeasure(segment, state, start, end, { aggregate: true, ...extra });
}

/** Clear only this module's stale User Timing entries before a new debug run. */
export function clearTrafficTimingEntries() {
  const markNames = new Set(
    performance.getEntriesByType('mark')
      .filter((entry) => entry.name.startsWith('traffic:'))
      .map((entry) => entry.name),
  );
  const measureNames = new Set(
    performance.getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith('traffic:'))
      .map((entry) => entry.name),
  );
  for (const name of markNames) performance.clearMarks(name);
  for (const name of measureNames) performance.clearMeasures(name);
}

/** Return the stable User Timing mark name for a scheduling interaction. */
function trafficTimingCameraChangeMarkName(interactionId) {
  return `traffic:interaction:${interactionId}:last-camera-change`;
}

/** Mint and mark the exact camera-change interaction that armed a debounced load. */
export function markTrafficTimingCameraChange() {
  const interactionId = ++S._trafficTimingSequence;
  const timestamp = performance.now();
  const anchor = { interactionId, timestamp };
  S._trafficTimingCurrentAnchor = anchor;
  performance.mark(trafficTimingCameraChangeMarkName(interactionId), {
    startTime: timestamp,
    detail: {
      trafficTiming: true,
      segment: 'last-camera-change',
      interactionId,
      timestamp,
    },
  });
  return anchor;
}

/**
 * Mark Cesium's diagnostic moveEnd notification. Cesium normally emits this
 * about 500 ms after stillness, so fetch has typically already started and
 * never waits for this boundary.
 */
export function markTrafficTimingMoveEnd() {
  const diagnosticId = ++S._trafficTimingSequence;
  const timestamp = performance.now();
  const name = `traffic:diagnostic:${diagnosticId}:camera-move-end`;
  performance.mark(name, {
    startTime: timestamp,
    detail: {
      trafficTiming: true,
      segment: 'camera-move-end',
      diagnosticOnly: true,
      cameraEventWaitTimeMs: 500,
      fetchWaitsForMoveEnd: false,
      timestamp,
    },
  });
}

/**
 * Instrumented twin of `parseRoads`. Operation ordering and road output match
 * the normal function; debug-only clocks accumulate synchronous height,
 * the batch ground-floor warm/resolve, and waypoint-materialization time
 * independently.
 */
export async function parseRoadsTimed(overpassData, trace) {
  /* TRACE_ONLY_BEGIN */
  const _trafficTimingState = trafficTimingPass(trace, trace?.currentPass || 'full');
  const _trafficTimingParseStartTime = performance.now();
  const _trafficTimingParseStart = trafficTimingMark(
    _trafficTimingState, 'road-parse-start', {}, _trafficTimingParseStartTime
  );
  /* TRACE_ONLY_END */
  if (!overpassData || !overpassData.elements) {
    /* TRACE_ONLY_BEGIN */
    const _trafficTimingParseEnd = trafficTimingMark(
      _trafficTimingState, 'road-parse-end', { roadCount: 0 }
    );
    trafficTimingMeasure(
      'road-parse-total', _trafficTimingState,
      _trafficTimingParseStart, _trafficTimingParseEnd, { roadCount: 0 }
    );
    trafficTimingAggregate('sample-height-total', _trafficTimingState, _trafficTimingParseStartTime, 0, {
      sampleHeightCalls: 0,
      sampleHeightMeanMs: 0,
      distinctCells: 0,
      roadCount: 0,
    });
    trafficTimingAggregate('ground-floor-warm-total', _trafficTimingState, _trafficTimingParseStartTime, 0, {
      warmPointCount: 0,
      roadCount: 0,
    });
    trafficTimingAggregate(
      'waypoint-materialization', _trafficTimingState, _trafficTimingParseStartTime, 0,
      { roadCount: 0 }
    );
    /* TRACE_ONLY_END */
    return [];
  }

  const pending = [];
  const warmPoints = [];
  let heightFallbackSamples = 0;
  /* TRACE_ONLY_BEGIN */
  const _trafficTimingSampledCells = new Set();
  let _trafficTimingSampleHeightCalls = 0;
  let _trafficTimingSampleHeightMs = 0;
  let _trafficTimingWaypointMaterializationMs = 0;
  /* TRACE_ONLY_END */
  for (const el of overpassData.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;

    const rawCoords = el.geometry.map(g => [g.lon, g.lat]);
    const simplifyStep = rawCoords.length > MAX_WAYPOINTS_PER_ROAD
      ? Math.ceil(rawCoords.length / MAX_WAYPOINTS_PER_ROAD)
      : 1;
    const coords = [];
    for (let i = 0; i < rawCoords.length; i += simplifyStep) {
      coords.push(rawCoords[i]);
    }

    const last = rawCoords[rawCoords.length - 1];
    const tail = coords[coords.length - 1];
    if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) {
      coords.push(last);
    }
    if (coords.length < 2) continue;

    const type = el.tags?.highway || 'unclassified';
    const onewayTag = el.tags?.oneway;
    const oneway = (onewayTag === 'yes' || onewayTag === '1' || onewayTag === 'true' || el.tags?.junction === 'roundabout')
      ? 1
      : (onewayTag === '-1' ? -1 : 0);

    let baseHeight = 0;
    const firstCoord = coords[0];
    if (S._viewer?.scene?.sampleHeightSupported && firstCoord && heightFallbackSamples < MAX_HEIGHT_FALLBACK_SAMPLES) {
      heightFallbackSamples++;
      /* TRACE_ONLY_BEGIN */
      _trafficTimingSampleHeightCalls += 1;
      _trafficTimingSampledCells.add(`${firstCoord[1].toFixed(3)},${firstCoord[0].toFixed(3)}`);
      /* TRACE_ONLY_END */
      const carto = Cesium.Cartographic.fromDegrees(firstCoord[0], firstCoord[1]);
      /* TRACE_ONLY_BEGIN */
      const _trafficTimingSampleStart = performance.now();
      /* TRACE_ONLY_END */
      const sampled = S._viewer.scene.sampleHeight(carto);
      /* TRACE_ONLY_BEGIN */
      _trafficTimingSampleHeightMs += performance.now() - _trafficTimingSampleStart;
      /* TRACE_ONLY_END */
      if (Number.isFinite(sampled)) baseHeight = sampled;
    }

    for (const [lng, lat] of coords) warmPoints.push({ lat, lon: lng });
    pending.push({ coords, type, oneway, baseHeight });
  }

  if (!pending.length) return [];

  /* TRACE_ONLY_BEGIN */
  const _trafficTimingWarmStart = performance.now();
  /* TRACE_ONLY_END */
  const carto = S._viewer?.camera?.positionCartographic;
  const viewerLatDeg = carto ? Cesium.Math.toDegrees(carto.latitude) : undefined;
  const viewerLonDeg = carto ? Cesium.Math.toDegrees(carto.longitude) : undefined;
  warmGroundFloor(warmPoints);
  sampleMeshFloorCells(S._viewer?.scene, warmPoints, { viewerLat: viewerLatDeg, viewerLon: viewerLonDeg });
  await resolveGroundFloorCellsBounded(warmPoints);
  /* TRACE_ONLY_BEGIN */
  const _trafficTimingWarmMs = performance.now() - _trafficTimingWarmStart;
  /* TRACE_ONLY_END */

  const roads = [];
  for (const { coords, type, oneway, baseHeight } of pending) {
    /* TRACE_ONLY_BEGIN */
    const _trafficTimingMaterializeStart = performance.now();
    /* TRACE_ONLY_END */
    const waypoints = coords.map(([lng, lat]) => {
      const floor = cachedGroundFloor(lat, lng);
      const h = (floor ?? baseHeight) + DOT_HEIGHT_OFFSET;
      return Cesium.Cartesian3.fromDegrees(lng, lat, h);
    });
    const segmentDist = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      segmentDist.push(Cesium.Cartesian3.distance(waypoints[i], waypoints[i + 1]));
    }
    /* TRACE_ONLY_BEGIN */
    _trafficTimingWaypointMaterializationMs += performance.now() - _trafficTimingMaterializeStart;
    /* TRACE_ONLY_END */

    roads.push({ coords, type, oneway, waypoints, segmentDist });
  }

  /* TRACE_ONLY_BEGIN */
  const _trafficTimingMetrics = {
    roadCount: roads.length,
    sampleHeightCalls: _trafficTimingSampleHeightCalls,
    sampleHeightMeanMs: _trafficTimingSampleHeightCalls
      ? _trafficTimingSampleHeightMs / _trafficTimingSampleHeightCalls
      : 0,
    distinctCells: _trafficTimingSampledCells.size,
  };
  trafficTimingAggregate(
    'sample-height-total', _trafficTimingState, _trafficTimingParseStartTime,
    _trafficTimingSampleHeightMs, _trafficTimingMetrics
  );
  trafficTimingAggregate(
    'ground-floor-warm-total', _trafficTimingState, _trafficTimingParseStartTime,
    _trafficTimingWarmMs, { ..._trafficTimingMetrics, warmPointCount: warmPoints.length }
  );
  trafficTimingAggregate(
    'waypoint-materialization', _trafficTimingState, _trafficTimingParseStartTime,
    _trafficTimingWaypointMaterializationMs, _trafficTimingMetrics
  );
  const _trafficTimingParseEnd = trafficTimingMark(
    _trafficTimingState, 'road-parse-end', _trafficTimingMetrics
  );
  trafficTimingMeasure(
    'road-parse-total', _trafficTimingState,
    _trafficTimingParseStart, _trafficTimingParseEnd, _trafficTimingMetrics
  );
  /* TRACE_ONLY_END */
  return roads;
}

/** Resolve a render label into its correlated pass and data source. */
export function trafficTimingRenderState(trace, label) {
  const pass = label.toLowerCase().includes('major') ? 'major' : 'full';
  const source = label.startsWith('Cache') ? 'client-cache' : 'proxy';
  return trafficTimingPass(trace, pass, source);
}

/** Record the first Cesium postRender following a completed dot render. */
export function scheduleTrafficTimingPostRender(state, renderEnd, renderId, renderMetrics) {
  if (!S._viewer?.scene) return;
  let remove = null;
  remove = S._viewer.scene.postRender.addEventListener(() => {
    remove?.();
    S._trafficTimingPostRenderRemovers?.delete(remove);
    const visibleTime = performance.now();
    const postRender = trafficTimingMark(state, 'next-post-render', {
      renderId,
      ...renderMetrics,
    }, visibleTime);
    const firstVisible = trafficTimingMark(state, 'first-visible-pixel', {
      renderId,
      visibleBoundary: 'next-postRender',
      ...renderMetrics,
    }, visibleTime);
    trafficTimingMeasure('render-to-post-render', state, renderEnd, postRender, {
      renderId,
      visibleBoundary: 'next-postRender',
      ...renderMetrics,
    });
    trafficTimingMeasure(
      'last-camera-change-to-first-visible', state, state.trace.cameraChangeMark, firstVisible,
      { renderId, visibleBoundary: 'next-postRender', ...renderMetrics }
    );
  });
  S._trafficTimingPostRenderRemovers?.add(remove);
}

/** Start a scheduling-correlated debug trace, or count and drop an unpaired load. */
export async function loadRoadsForBoundsTimed(bounds, altitude, expectedAnchor) {
  const generation = S._loadGeneration + 1;
  if (!expectedAnchor || expectedAnchor !== S._trafficTimingCurrentAnchor) {
    S._trafficTimingDroppedTraces += 1;
    await loadRoadsForBounds(bounds, altitude);
    return;
  }
  S._trafficTimingCurrentAnchor = null;
  const clamped = clampBounds(bounds);
  const trace = {
    id: ++S._trafficTimingSequence,
    interactionId: expectedAnchor.interactionId,
    cameraChangeTimestamp: expectedAnchor.timestamp,
    cameraChangeMark: trafficTimingCameraChangeMarkName(expectedAnchor.interactionId),
    generation,
    cacheKey: `${clamped.south.toFixed(4)},${clamped.west.toFixed(4)},${clamped.north.toFixed(4)},${clamped.east.toFixed(4)}`,
    currentPass: null,
    renderSequence: 0,
    passes: new Map(),
  };
  S._trafficTimingTracesCreated += 1;
  await loadRoadsForBounds(bounds, altitude, trace);
}
