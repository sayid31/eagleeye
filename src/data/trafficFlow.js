// Moved out of traffic.js (trafficFlow).

import { TOMTOM_CREDIT, registerDynamicCredit } from './dataCredits.js';
import { fetchFlowForBounds } from './flowTiles.js';
import { matchFlowToRoads } from './flowMatch.js';
import { flowBucket, flowSpeedScale } from './trafficFlowStyle.js';
import * as Cesium from 'cesium';
import { FLOW_RENDER_RACE_MS, JAM_DOT_DEPTH_PUNCH, JAM_DOT_FAR_SCALE, TRAFFIC_TIMING_ENABLED } from './trafficConstants.js';
import { rebuildHeatLines, renderRoadsForAltitude, visibleRoadsForAltitude } from './trafficRender.js';
import { S } from './trafficState.js';
import { activeSizeDelta, applyOutline, baseDotSize, jamDensityOn, presetProfileActive } from './trafficStyle.js';
import { trafficTimingMark, trafficTimingMeasure, trafficTimingRenderState } from './trafficTiming.js';

// ─── Live Flow (TomTom) ────────────────────────────────────

/**
 * Map a failed flow fetch onto one short, honest user-facing reason.
 *
 * `fetchFlowForBounds` only rejects when EVERY covering tile failed, so a
 * non-null result here always means "there is no live flow to show right
 * now" — the dots fall back to simulated white. Mirrors the
 * `deriveAisFeedError` honesty helper.
 *
 * @param {Error|{name?:string, message?:string}|null|undefined} error - Rejection from the flow fetch.
 * @returns {string|null} Short reason, or null for an aborted (superseded) fetch.
 */
export function deriveTrafficFlowError(error) {
  if (!error || error.name === 'AbortError') return null;
  const message = String(error.message || error);
  const status = Number(message.match(/HTTP (\d{3})/)?.[1]);
  if (status === 503) return 'TomTom key unavailable';
  if (status === 429) return 'TomTom daily budget reached';
  if (status === 502 || status === 504) return 'TomTom upstream unreachable';
  if (Number.isFinite(status)) return `TomTom flow error (HTTP ${status})`;
  return 'TomTom flow unavailable';
}

/**
 * Derive the layer's honest feed presentation from its live-flow state.
 *
 * The three states a user can be in, and what each must read as:
 *  - keyless → `mode:'sim'` (the manager maps that to a FALLBACK chip) with a
 *    label that never claims live data;
 *  - live and healthy → LIVE with real coverage;
 *  - live but flow-down → an `error` string, so the chip degrades and says
 *    the colors on screen are simulated. Never a stale "LIVE · N% cov".
 *
 * @param {Object} [input]
 * @param {boolean} [input.liveMode] - `/api/tomtom/status` reported a key.
 * @param {boolean} [input.fetching] - A viewport load is in flight.
 * @param {string|null} [input.flowError] - `deriveTrafficFlowError` result, if any.
 * @param {number} [input.coveragePct] - Matched-road coverage, 0–100.
 * @param {boolean} [input.statusUnavailable] - The status probe itself failed.
 * @returns {{mode:'live'|'sim', error:string|null, loadingLabel:string}}
 */
export function trafficFeedPresentation({
  liveMode = false,
  fetching = false,
  flowError = null,
  coveragePct = 0,
  statusUnavailable = false,
} = {}) {
  // `mode` is the CONFIGURED source (live key present vs keyless), not this
  // instant's health — health rides on `error`. The qa-traffic harness pins
  // that meaning.
  const mode = liveMode ? 'live' : 'sim';
  if (liveMode && flowError) {
    // One string for both fields. The manager's meta line renders `error` and
    // drops `loadingLabel` in its error branch, so the owner's SIMULATED copy
    // has to BE the error text or the steady state reverts to a bare
    // "TomTom daily budget reached" that never says what is on screen.
    const degraded = `SIMULATED — ${flowError}`;
    return { mode, error: degraded, loadingLabel: degraded };
  }
  if (liveMode) {
    return {
      mode,
      error: null,
      loadingLabel: fetching
        ? 'syncing LIVE traffic flow'
        : `LIVE · TomTom flow · ${coveragePct}% cov`,
    };
  }
  // Keyless simulation — one terse line that names the mode and the remedy
  // (owner's copy shape). The chip's own progress text carries "working";
  // this line must never imply a live feed.
  return {
    mode,
    error: null,
    loadingLabel: statusUnavailable
      ? 'SIMULATED — traffic service unreachable'
      : 'SIMULATED — add TomTom key for live',
  };
}

/**
 * Check `/api/tomtom/status` once per session and cache the result.
 * Live mode iff the server holds a TomTom key; the TomTom attribution credit
 * registers the first time live mode activates. Keyless or unreachable →
 * simulation mode, exactly today's behavior.
 *
 * @returns {Promise<void>} Resolves when `_liveMode` is settled.
 */
export function ensureFlowStatus() {
  if (!S._flowStatusPromise) {
    S._flowStatusPromise = fetch('/api/tomtom/status')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((status) => {
        S._liveMode = Boolean(status?.hasKey);
        S._flowStatusUnavailable = false;
        if (S._liveMode) {
          console.log('[Data:Traffic] TomTom key present — live flow mode');
          registerDynamicCredit(S._viewer, TOMTOM_CREDIT);
        }
      })
      .catch((e) => {
        // Simulating because we could not ask, which is NOT the same as
        // "server says no key" — getStats() distinguishes the two.
        S._liveMode = false;
        S._flowStatusUnavailable = true;
        console.warn('[Data:Traffic] TomTom status unreachable — simulated traffic:', e?.message || e);
      });
  }
  return S._flowStatusPromise;
}

/**
 * Live mode only: fetch TomTom flow for the clamped bounds, match it onto the
 * parsed roads, and attach `road.flow` (`{level, closure}` or null).
 *
 * Reuses the load-generation guard: stale flow responses are discarded, and
 * the shared AbortController lets `cancelActiveFetch()` (next load / disable)
 * cancel an in-flight flow fetch. Any failure leaves roads unmatched — the
 * dots then render in today's simulated white, never a phantom color — and is
 * recorded in `_flowError` so `getStats()` degrades honestly instead of
 * reporting a stale "LIVE · N% cov" over simulated dots.
 *
 * @param {Array} roads - Parsed road objects (mutated: `road.flow`).
 * @param {{south:number,west:number,north:number,east:number}} clamped - Fetch bounds.
 * @param {number} generation - `_loadGeneration` at call time.
 * @returns {Promise<void>}
 */
async function applyFlowToRoads(roads, clamped, generation) {
  // Claim the work synchronously, before the first await, so `stats.loading`
  // covers this request from the same tick the caller started it — the
  // loading batch must not be able to close underneath an in-flight fetch.
  S._flowPending += 1;
  try {
    if (!S._flowStatusPromise) return; // status check not started — sim mode
    await S._flowStatusPromise;
    if (!S._liveMode || !S._enabled) return;
    if (generation !== S._loadGeneration) return;
    if (!Array.isArray(roads) || roads.length === 0) return;
    try {
      // Cached paths reach here without a live controller; the fetch paths
      // reuse theirs so one cancel covers both roads and flow.
      if (!S._activeFetchAbort) S._activeFetchAbort = new AbortController();
      const segments = await fetchFlowForBounds(clamped, { signal: S._activeFetchAbort.signal });
      if (generation !== S._loadGeneration) return;
      const { matches, matchedCount, candidateCount } = matchFlowToRoads(roads, segments);
      for (let i = 0; i < roads.length; i++) {
        roads[i].flow = matches[i];
      }
      S._flowCoveragePct = candidateCount > 0
        ? Math.round((matchedCount / candidateCount) * 100)
        : 0;
      S._flowError = null;
    } catch (e) {
      if (e?.name === 'AbortError') return;
      // Same guard the success path gets: a superseded request rejecting late
      // (or after disable() cleared the state) must not restore a stale
      // outage over newer good data.
      if (generation !== S._loadGeneration || !S._enabled) return;
      // Every covering tile failed: there is no live flow on screen. Drop the
      // now-false coverage number and surface the reason through getStats().
      S._flowError = deriveTrafficFlowError(e);
      S._flowCoveragePct = 0;
      console.warn('[Data:Traffic] Flow fetch failed (sim colors remain):', e?.message || e);
    }
  } finally {
    S._flowPending -= 1;
  }
}

/**
 * Race flow application against the paint deadline, render, and schedule an
 * in-place recolor if flow lost the race.
 * @param {Array} roads - Parsed road objects.
 * @param {{south:number,west:number,north:number,east:number}} clamped - Fetch bounds.
 * @param {number} generation - `_loadGeneration` at call time.
 * @param {number} altitude - Camera altitude in meters.
 * @param {string} label - Render log label.
 * @param {Object|null} [trace=null] - Development-only correlated load trace.
 * @returns {Promise<boolean>} True if this generation rendered.
 */
export async function applyFlowThenRender(roads, clamped, generation, altitude, label, trace = null) {
  const state = TRAFFIC_TIMING_ENABLED && trace
    ? trafficTimingRenderState(trace, label)
    : null;
  const flowRaceStart = state ? trafficTimingMark(state, 'flow-render-race-start', {
    deadlineMs: FLOW_RENDER_RACE_MS,
  }) : null;
  const flowJob = applyFlowToRoads(roads, clamped, generation);
  const outcome = await Promise.race([
    flowJob.then(() => 'flow'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), FLOW_RENDER_RACE_MS)),
  ]);
  if (state) {
    const flowRaceEnd = trafficTimingMark(state, 'flow-render-race-end', {
      deadlineMs: FLOW_RENDER_RACE_MS,
      outcome,
    });
    trafficTimingMeasure('flow-render-race', state, flowRaceStart, flowRaceEnd, {
      deadlineMs: FLOW_RENDER_RACE_MS,
      outcome,
    });
  }
  if (generation !== S._loadGeneration) return false;
  renderRoadsForAltitude(roads, altitude, label, trace);
  if (outcome === 'timeout') {
    flowJob.then(() => {
      if (generation !== S._loadGeneration) return;
      recolorDotsInPlace(label);
    }).catch(() => { /* applyFlowToRoads settles its own failures */ });
  }
  return true;
}

/**
 * Apply late-arriving flow data to already-rendered dots without a respawn:
 * color, jam size, and speed update in place; closed roads' dots hide.
 * Density bunching intentionally waits for the next natural re-render —
 * color and speed are the live signal, dot count is a refinement.
 * @param {string} label - Render log label (for the console trace).
 */
function recolorDotsInPlace(label) {
  if (!S._liveMode || !S._dots.length) return;
  S._bucketCounts = { free: 0, slow: 0, jam: 0, sim: 0 };
  let closedDots = 0;
  const now = Date.now();
  for (const dot of S._dots) {
    const flow = dot.road ? dot.road.flow : null;
    if (flow?.closure) {
      dot.point.show = false;
      closedDots += 1;
      continue;
    }
    const bucket = flow ? flowBucket(flow.level) : null;
    dot.bucket = bucket;
    dot.point.color = bucket ? S._activeBucketColors[bucket] : Cesium.Color.WHITE.withAlpha(0.85);
    if (bucket === 'jam') {
      dot.point.pixelSize = baseDotSize(dot.road?.type, bucket) + 1 + activeSizeDelta('jam');
    } else if (bucket && presetProfileActive()) {
      // Preset profiles size-floor every bucket; the shipped normal path
      // keeps its jam-only size touch (byte-identical behavior).
      dot.point.pixelSize = baseDotSize(dot.road?.type, bucket) + activeSizeDelta(bucket);
    }
    // Late flow can move a dot between buckets — keep the preset halo in
    // step (no-op writes under the normal profile, whose dots have none).
    if (presetProfileActive()) applyOutline(dot.point, bucket);
    dot.mps = dot.baseMps * (flow ? flowSpeedScale(flow.level) : 1);
    // Late flow tags/untags stop-and-go creep + city-scale prominence the
    // same way it rescales speed. Queue *positions* wait for the next
    // natural re-render, like density bunching.
    if (bucket === 'jam' && jamDensityOn()) {
      if (!dot.creep) dot.creep = { moving: Math.random() < 0.4, until: now + Math.random() * 2000 };
      dot.point.scaleByDistance = new Cesium.NearFarScalar(100, 1.5, S._fadeScaleFar, JAM_DOT_FAR_SCALE);
      dot.point.disableDepthTestDistance = JAM_DOT_DEPTH_PUNCH;
    } else {
      dot.creep = null;
    }
    S._bucketCounts[bucket || 'sim'] += 1;
  }
  S._closedRoads = S._roads.reduce((n, r) => n + (r.flow?.closure ? 1 : 0), 0);
  rebuildHeatLines(visibleRoadsForAltitude(S._roads, S._lastRenderAltitude));
  console.log(`[Data:Traffic] Flow recolor (${label}): ${S._dots.length} dots, closedDots=${closedDots}`);
}
