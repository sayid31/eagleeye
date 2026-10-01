// Moved out of traffic.js (trafficApi).

import { trafficBucketTier } from './trafficPresetStyle.js';
import { S } from './trafficState.js';
import { restyleDotsInPlace } from './trafficStyle.js';

export async function updateTrafficLayer() {
    // No-op — updates are camera-driven
  }

export function setTrafficParams(params = {}) {
    if (typeof params.densityScale === 'number') {
      S._densityScale = Math.max(0.2, Math.min(2.5, params.densityScale));
    }
    if (typeof params.speedScale === 'number') {
      S._speedScale = Math.max(0.3, Math.min(3.0, params.speedScale));
    }
    // Live-mode treatment of roads TomTom has no flow data for:
    // 'sim' (default) keeps them as today's white ambient dots — colored =
    // real data, white = simulation; 'hide' spawns nothing on them (strict
    // data-integrity view). Owner-explorable; re-render applies on the next
    // camera-driven load.
    if (params.uncoveredRoads === 'sim' || params.uncoveredRoads === 'hide') {
      S._uncoveredMode = params.uncoveredRoads;
    }
    // Jam-viz prototype toggle (owner A/B): 'none' = shipped main behavior;
    // live mode only, applies on the next camera-driven load like the
    // uncoveredRoads param above.
    if (['none', 'density', 'heatline', 'both'].includes(params.jamViz)) {
      S._jamViz = params.jamViz;
    }
    // Preset-aware dot styling kill switch (owner A/B): 'off' forces the
    // shipped palette under every post-FX preset. Applies immediately via
    // in-place restyle — no refetch — so A/B legs share identical dots.
    if (params.presetDots === 'on' || params.presetDots === 'off') {
      if (params.presetDots !== S._presetDots) {
        S._presetDots = params.presetDots;
        restyleDotsInPlace();
      }
    }
  }

export function getTrafficDetectableObjects(options = {}) {
    if (!S._enabled || S._dots.length === 0) return [];
    const maxCount = Number.isFinite(options.maxCount)
      ? Math.max(1, Math.floor(options.maxCount))
      : S._dots.length;
    const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0;
    // Stride-based sampling: step through dots evenly to get ~maxCount samples
    const stride = Math.max(1, Math.ceil(S._dots.length / maxCount));
    const start = seed % stride;

    const result = [];
    for (let i = start; i < S._dots.length; i += stride) {
      const pos = S._dots[i].point.position;
      if (!pos) continue;
      const entry = {
        position: pos,
        id: `VEH-${String(i).padStart(4, '0')}`,
        type: 'VEH',
      };
      // Live mode: the detection bracket carries the congestion signal —
      // its canvas sits ABOVE the post-FX chain, so tier colors survive
      // every preset (owner round 2: "bounding boxes do the heavy
      // lifting"). Keyless mode sets no tier: contacts keep the stock
      // 'vehicle' bracket and the keyless experience stays untouched.
      if (S._liveMode) {
        const tier = trafficBucketTier(S._dots[i].bucket || 'sim');
        if (tier) entry.tier = tier;
      }
      result.push(entry);
      if (result.length >= maxCount) break;
    }
    return result;
  }
