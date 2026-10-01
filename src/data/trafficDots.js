// Moved out of traffic.js (trafficDots).

import { flowBucket, flowDensityMult, flowSpeedScale } from './trafficFlowStyle.js';
import { presetDotOutline } from './trafficPresetStyle.js';
import * as Cesium from 'cesium';
import { locateAlongRoad, queuePlatoons } from './trafficQueue.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { CREEP_BURST, CREEP_MOVE_MS, CREEP_STOP_MS, DENSITY_MULT, HEAT_JAM_BASE_ALPHA, HEAT_JAM_PULSE_ALPHA, JAM_DOT_DEPTH_PUNCH, JAM_DOT_FAR_SCALE, MAX_DOTS, SPEED_MPS } from './trafficConstants.js';
import { estimateRoadLengthDeg } from './trafficParse.js';
import { removeHeatLines } from './trafficRender.js';
import { S, _scratchLerp } from './trafficState.js';
import { activeSizeDelta, baseDotSize, jamDensityOn } from './trafficStyle.js';

// ─── Dot Spawning ──────────────────────────────────────────

/**
 * Compute the ideal number of dots for a single road at a given camera altitude.
 *
 * Spacing increases with altitude so fewer dots are rendered when zoomed out.
 * The result is further scaled by the road-type density multiplier and the
 * user-adjustable `_densityScale`.
 *
 * @param {{coords:number[][], type:string}} road - Parsed road object.
 * @param {number} altitude - Current camera altitude in meters.
 * @returns {number} Ideal dot count (minimum 1).
 */
function computeDotCount(road, altitude) {
  // Live flow: closed roads carry zero traffic; congestion packs more dots.
  // `road.flow` is only ever set in live mode, so the keyless path is
  // untouched (flow stays undefined → multiplier 1, identical output).
  const flow = S._liveMode ? road.flow : null;
  if (flow?.closure) return 0;
  // Strict data-integrity view: uncovered roads spawn nothing when hidden.
  if (S._liveMode && !flow && S._uncoveredMode === 'hide') return 0;

  const lengthM = estimateRoadLengthDeg(road.coords);

  // Altitude-adaptive spacing: closer camera = denser dots
  let spacing;
  if (altitude < 1000)      spacing = 30;
  else if (altitude < 3000) spacing = 80;
  else if (altitude < 5000) spacing = 150;
  else                      spacing = 250;

  const mult = (DENSITY_MULT[road.type] || 1)
    * S._densityScale
    * (flow ? flowDensityMult(flow.level, { jamBoost: jamDensityOn() }) : 1);
  return Math.max(1, Math.floor((lengthM / spacing) * mult));
}

/**
 * Distribute a fixed dot budget fairly across all visible roads.
 *
 * Algorithm:
 *  1. Compute ideal dot count per road via `computeDotCount`.
 *  2. Seed one dot to every road that wants at least one (fairness pass).
 *  3. Distribute remaining budget proportionally to each road's ideal count.
 *  4. Assign leftover dots (from floor rounding) to roads with the highest
 *     fractional residuals (largest-remainder method).
 *
 * This prevents high-density motorways from starving smaller residential roads
 * when the global MAX_DOTS cap is reached.
 *
 * @param {Array} roads    - Parsed road objects.
 * @param {number} altitude - Camera altitude in meters (affects spacing).
 * @param {number} dotCap   - Maximum total dots to allocate.
 * @returns {number[]} Per-road dot budgets, same length as `roads`.
 */
export function allocateRoadDotBudgets(roads, altitude, dotCap) {
  const planned = roads.map((road) => computeDotCount(road, altitude));
  const budgets = new Array(roads.length).fill(0);
  let remaining = Math.max(0, dotCap);

  // Pass 1 — fairness seed: give one dot to every road (highest-demand first)
  const firstPassOrder = planned
    .map((count, index) => ({ count, index }))
    .sort((a, b) => b.count - a.count);

  for (const entry of firstPassOrder) {
    if (remaining <= 0) break;
    if (entry.count <= 0) continue;
    budgets[entry.index] = 1;
    remaining -= 1;
  }

  if (remaining <= 0) return budgets;

  // Pass 2 — proportional distribution of the remaining budget
  let totalRemainder = 0;
  for (let i = 0; i < planned.length; i++) {
    totalRemainder += Math.max(0, planned[i] - budgets[i]);
  }
  if (totalRemainder <= 0) return budgets;

  const residuals = [];
  let assigned = 0;
  for (let i = 0; i < planned.length; i++) {
    const cap = Math.max(0, planned[i] - budgets[i]);
    if (cap <= 0) continue;
    const ideal = (cap / totalRemainder) * remaining;
    const add = Math.min(cap, Math.floor(ideal));
    budgets[i] += add;
    assigned += add;
    residuals.push({ index: i, residual: ideal - add });
  }

  // Pass 3 — largest-remainder: hand out leftover dots from floor rounding
  let leftover = remaining - assigned;
  if (leftover > 0 && residuals.length > 0) {
    residuals.sort((a, b) => b.residual - a.residual);
    let cursor = 0;
    while (leftover > 0 && residuals.length > 0) {
      const idx = residuals[cursor % residuals.length].index;
      if (budgets[idx] < planned[idx]) {
        budgets[idx] += 1;
        leftover -= 1;
      }
      cursor += 1;
      // Safety valve: avoid infinite loop if all roads are already at their ideal
      if (cursor > residuals.length * 3 && leftover > 0) break;
    }
  }

  return budgets;
}

/**
 * Spawn animated dot primitives along a single road.
 *
 * Each dot is placed at a random position along the road, assigned a
 * randomized speed (base +/-30%), and given a direction (alternating
 * forward/backward to simulate two-way traffic).
 *
 * @param {{waypoints:Cesium.Cartesian3[], segmentDist:number[], type:string, coords:number[][]}} road
 *   Parsed road object with pre-computed waypoints.
 * @param {number} altitude      - Camera altitude (used if budgetCount is null).
 * @param {number|null} [budgetCount=null] - Pre-allocated dot count. Falls back
 *   to `computeDotCount` when null.
 */
export function spawnDotsForRoad(road, altitude, budgetCount = null) {
  // Live flow styling (`road.flow` only exists in live mode; keyless path is
  // byte-identical): closures spawn nothing, congestion colors/slows dots.
  const flow = S._liveMode ? road.flow : null;
  if (flow?.closure) return;
  if (S._liveMode && !flow && S._uncoveredMode === 'hide') return;

  const count = Number.isFinite(budgetCount)
    ? Math.max(0, Math.floor(budgetCount))
    : computeDotCount(road, altitude);
  const numSegments = road.waypoints.length - 1;
  if (numSegments < 1 || count <= 0) return;

  const baseMps = SPEED_MPS[road.type] || 5;
  const bucket = flow ? flowBucket(flow.level) : null;
  // Jam dots get +1px: a red queue should read as a queue at a glance.
  // Preset-aware styling adds its own size delta and floors the base (0 /
  // no floor under the normal profile) so NVG/FLIR/CRT dots stay PRESENT.
  const pixelSize = baseDotSize(road.type, bucket)
    + (bucket === 'jam' ? 1 : 0)
    + activeSizeDelta(bucket);
  const flowColor = bucket ? S._activeBucketColors[bucket] : null;
  // Dark-halo outline under styled presets (null = shipped no-outline).
  const outlineSpec = (bucket && S._presetDots === 'on') ? presetDotOutline(S._stylePreset, bucket) : null;
  const outlineColor = outlineSpec
    ? new Cesium.Color(outlineSpec.rgba[0] / 255, outlineSpec.rgba[1] / 255, outlineSpec.rgba[2] / 255, outlineSpec.rgba[3])
    : null;
  const flowSpeed = flow ? flowSpeedScale(flow.level) : 1;
  const now = Date.now();

  // Jam-viz density prototype: jam-road dots spawn as bumper-to-bumper
  // platoons (one shared direction per queue) instead of uniform scatter.
  // Unreachable in sim mode — `bucket` requires flow.
  let placements = null;
  if (bucket === 'jam' && jamDensityOn()) {
    let totalLen = 0;
    for (const d of road.segmentDist) totalLen += d;
    const platoons = queuePlatoons(totalLen, count);
    if (platoons.length) {
      placements = [];
      for (let p = 0; p < platoons.length; p++) {
        const dir = road.oneway ? road.oneway : ((p % 2 === 0) ? 1 : -1);
        for (const s of platoons[p]) {
          const { segIdx, t } = locateAlongRoad(road.segmentDist, s);
          placements.push({ segIdx, t, direction: dir });
        }
      }
    }
  }

  for (let i = 0; i < count; i++) {
    if (S._dots.length >= MAX_DOTS) return;

    // Random start position: pick a random segment and offset within it —
    // unless this is a queued jam dot with a platoon placement.
    const segIdx = placements ? placements[i].segIdx : Math.floor(Math.random() * numSegments);
    const t = placements ? placements[i].t : Math.random();

    // Speed noise: base speed +/-30% for organic variation. baseMps (noise
    // included, flow excluded) is kept on the dot so a late-arriving flow
    // match can rescale speed in place (recolorDotsInPlace).
    const noisedMps = baseMps * S._speedScale * (0.7 + Math.random() * 0.6);
    const mps = noisedMps * flowSpeed;

    // One-way roads flow only their legal direction; two-way alternates
    // (per platoon in queue mode — a queue moves as one).
    const direction = placements
      ? placements[i].direction
      : (road.oneway ? road.oneway : ((i % 2 === 0) ? 1 : -1));

    // Compute initial Cartesian3 position via linear interpolation
    Cesium.Cartesian3.lerp(road.waypoints[segIdx], road.waypoints[segIdx + 1], t, _scratchLerp);

    // Jam-viz density prototype: jam dots stay visible at city scale — a
    // longer depth-test punch-through (single-sample road heights sit under
    // the mesh at oblique views) and a higher far-scale floor. Sim dots and
    // other buckets keep the shipped values.
    const jamProminent = bucket === 'jam' && jamDensityOn();
    const point = S._pointCollection.add({
      position: Cesium.Cartesian3.clone(_scratchLerp),
      pixelSize,
      // No flow data → today's exact simulated white.
      color: flowColor || Cesium.Color.WHITE.withAlpha(0.85),
      scaleByDistance: new Cesium.NearFarScalar(100, 1.5, S._fadeScaleFar, jamProminent ? JAM_DOT_FAR_SCALE : 0.3),
      translucencyByDistance: new Cesium.NearFarScalar(100, 1.0, S._fadeTransFar, 0.0),
      // visible through tiles only when very close (jam: city-scale punch)
      disableDepthTestDistance: jamProminent ? JAM_DOT_DEPTH_PUNCH : 2000,
      // Preset dark halo (spread only when present — the keyless/normal
      // path passes the exact shipped option set).
      ...(outlineSpec ? { outlineColor, outlineWidth: outlineSpec.width } : {}),
    });
    S._bucketCounts[bucket || 'sim'] += 1;

    S._dots.push({
      point,
      road,
      bucket, // flow bucket at spawn (null = sim) — drives preset restyle/pulse
      waypoints: road.waypoints,
      segmentDist: road.segmentDist,
      numSegments,
      segIdx,
      t,
      mps,          // meters per second (flow-scaled)
      baseMps: noisedMps, // pre-flow speed, for in-place flow rescale
      direction,
      stoppedUntil: 0,
      // Stop-and-go creep state (jam-viz density prototype): jam dots
      // alternate move-bursts and stops. Null in sim mode and for non-jam.
      creep: (bucket === 'jam' && jamDensityOn())
        ? { moving: Math.random() < 0.4, until: now + Math.random() * 2000 }
        : null,
    });
  }
}

/**
 * Per-frame animation callback registered on `scene.preRender`.
 *
 * For every active dot:
 *  1. Skip if currently paused by a simulated stop-light.
 *  2. Convert speed (m/s) to a parametric t-delta relative to the current
 *     segment's Cartesian distance.
 *  3. Advance t in the dot's travel direction, handling segment boundary
 *     crossings and end-of-road reversals.
 *  4. Linearly interpolate between the two bounding waypoints and update the
 *     point primitive's position.
 *
 * Delta time is capped at 100 ms to prevent large jumps after background tabs.
 */
export function animate() {
  const now = Date.now();
  // Delta time in seconds, capped to avoid jumps when returning from background tab
  const dt = S._lastAnimTime ? Math.min((now - S._lastAnimTime) / 1000, 0.1) : 0.016;
  S._lastAnimTime = now;

  for (let i = 0; i < S._dots.length; i++) {
    const dot = S._dots[i];

    // Simulated stop-light pause — skip movement while timer is active
    if (now < dot.stoppedUntil) continue;

    // Stop-and-go creep (jam-viz density prototype, live jam dots only):
    // alternate short forward bursts with stops. The burst multiplier keeps
    // the long-run average near the honest TomTom crawl speed.
    let burst = 1;
    if (dot.creep) {
      if (now >= dot.creep.until) {
        dot.creep.moving = !dot.creep.moving;
        const [lo, hi] = dot.creep.moving ? CREEP_MOVE_MS : CREEP_STOP_MS;
        dot.creep.until = now + lo + Math.random() * (hi - lo);
      }
      if (!dot.creep.moving) continue;
      burst = CREEP_BURST;
    }

    // Convert m/s speed to parametric t-delta for the current segment length
    const segLen = dot.segmentDist[dot.segIdx] || 1;
    const tDelta = (dot.mps * burst * dt) / segLen;

    // Advance parametric position along the road in the current direction
    dot.t += tDelta * dot.direction;

    // Handle forward segment boundary crossing (t >= 1.0)
    if (dot.t >= 1.0) {
      dot.t -= 1.0;
      dot.segIdx++;
      if (dot.segIdx >= dot.numSegments) {
        // End of road: recycle to the road's entry with a small stagger —
        // cars don't reverse at the end of a street (field-test round 1).
        // Direction is preserved, so one-way flow stays legal.
        dot.segIdx = 0;
        dot.t = Math.random() * 0.3;
      }
      maybeStopLight(dot, now);
    } else if (dot.t <= 0.0) {
      // Handle backward segment boundary crossing (t <= 0.0)
      dot.t += 1.0;
      dot.segIdx--;
      if (dot.segIdx < 0) {
        // Start of road (traveling backward): recycle to the far end.
        dot.segIdx = dot.numSegments - 1;
        dot.t = 1.0 - Math.random() * 0.3;
      }
      maybeStopLight(dot, now);
    }

    // Lerp between pre-computed Cartesian3 waypoints (no trig needed).
    // Pass the scratch directly: PointPrimitive's position setter clones the
    // value into its own storage (and skips the VBO dirty flag when equal), so
    // the extra defensive clone here allocated 360–720k Cartesian3/s of pure
    // garbage across 6000 dots. (perf item 5)
    const a = dot.waypoints[dot.segIdx];
    const b = dot.waypoints[dot.segIdx + 1];
    Cesium.Cartesian3.lerp(a, b, dot.t, _scratchLerp);
    dot.point.position = _scratchLerp;
  }

  // Jam heat-lines throb (~1.6 s period) — one shared material uniform for
  // the whole jam batch, no geometry rebuild. Null outside live heatline mode.
  if (S._heatJamPrim?.appearance) {
    S._heatJamPrim.appearance.material.uniforms.color.alpha =
      HEAT_JAM_BASE_ALPHA + HEAT_JAM_PULSE_ALPHA * Math.sin(now / 260);
  }

  S._animFrame++;
  syncTrafficRenderHold();
}

/**
 * Whether Traffic genuinely has per-frame work right now. Every dot lerps
 * along its road every frame, and the live jam heat-line pulse recomputes
 * its shared material alpha every frame — both die naturally the instant the
 * loaded viewport empties (`clearDots()` on high altitude, camera-away, or
 * disable). No per-object on-screen check is needed here: the dot/heat-line
 * set is already scoped to the loaded viewport by
 * `onCameraChanged`/`renderRoadsForAltitude`, unlike a globally-resident
 * catalog. `anyVisibleAndMoving` is a seam for a future frustum-cull
 * refinement (a camera pitched away from a still-loaded area); it defaults
 * true — fail toward continuous, never toward a silently-stale scene — until
 * that refinement lands.
 * @param {{dotCount?: number, heatLineCount?: number, anyVisibleAndMoving?: boolean}} [snapshot] Explicit state, for tests.
 * @returns {boolean}
 */
export function trafficNeedsContinuousRender({
  dotCount = S._dots.length,
  heatLineCount = S._heatLineCount,
  anyVisibleAndMoving = true,
} = {}) {
  return (dotCount > 0 || heatLineCount > 0) && anyVisibleAndMoving;
}

/**
 * Take or drop the continuous-render hold to match current need. Idempotent
 * (the governor is identity-keyed).
 * @returns {void}
 */
export function syncTrafficRenderHold() {
  if (S._enabled && trafficNeedsContinuousRender()) holdContinuousRender('traffic');
  else releaseContinuousRender('traffic');
}

/**
 * Randomly pause a dot near road endpoints to simulate stop-light behaviour.
 *
 * Only triggers within the first 2 or last 2 segments of the road, and only
 * with a very low per-frame probability (0.8%) to keep traffic flowing.
 *
 * @param {Object} dot - The dot state object.
 * @param {number} now - Current timestamp in milliseconds.
 */
function maybeStopLight(dot, now) {
  const nearEnd = dot.segIdx <= 1 || dot.segIdx >= dot.numSegments - 2;
  if (nearEnd && Math.random() < 0.008) {
    // Pause for 2–6 seconds
    dot.stoppedUntil = now + 2000 + Math.random() * 4000;
  }
}

// ─── Cleanup ───────────────────────────────────────────────

/** Remove all point primitives and reset dot/road arrays and counters. */
export function clearDots() {
  if (S._pointCollection) S._pointCollection.removeAll();
  removeHeatLines();
  S._dots = [];
  S._roads = [];
  S._count = 0;
  S._bucketCounts = { free: 0, slow: 0, jam: 0, sim: 0 };
  S._closedRoads = 0;
}
