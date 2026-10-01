// Moved out of traffic.js (trafficLoad).

import { fetchFlowForBounds } from './flowTiles.js';
import { FAST_FETCH_ALTITUDE, TILE_CACHE_MAX_ENTRIES } from './trafficConstants.js';
import { applyFlowThenRender, ensureFlowStatus } from './trafficFlow.js';
import { _parseRoads } from './trafficInstances.js';
import { fetchRoads } from './trafficParse.js';
import { S, _tileCache } from './trafficState.js';
import { cancelActiveFetch, clampBounds, getBoundsCenter } from './trafficView.js';

/**
 * Load road data for the given viewport bounds and render traffic dots.
 *
 * Implements a two-pass fetch strategy with tile caching:
 *
 *  1. Check the tile cache (keyed by clamped bounding-box coordinates).
 *     - If a full road set is cached, render immediately and return.
 *     - If only major roads are cached, render those first.
 *  2. Fetch major roads from Overpass (fast, small payload). Render.
 *  3. If altitude is low enough (< FAST_FETCH_ALTITUDE), fetch the full
 *     road graph (includes tertiary/residential). Render again to upgrade.
 *
 * Each fetch is guarded by a monotonic `_loadGeneration` counter so that
 * stale responses from superseded requests are silently discarded.
 *
 * @param {{south:number, west:number, north:number, east:number}} bounds
 *   Viewport bounds (will be clamped internally).
 * @param {number} altitude - Camera altitude in meters.
 * @param {Object|null} [trace=null] - Development-only correlated load trace.
 * @returns {Promise<void>}
 */
export async function loadRoadsForBounds(bounds, altitude, trace = null) {
  // Increment generation to invalidate any in-flight responses from prior calls
  const generation = ++S._loadGeneration;
  cancelActiveFetch();
  const clamped = clampBounds(bounds);

  // Cache key: fixed-precision bounding-box string for deterministic lookups
  const cacheKey = `${clamped.south.toFixed(4)},${clamped.west.toFixed(4)},${clamped.north.toFixed(4)},${clamped.east.toFixed(4)}`;

  // Live mode: warm the flow-tile cache CONCURRENTLY with the Overpass road
  // fetch — sequential fetches doubled first-paint latency (field-test
  // round 1). Failures are irrelevant; applyFlowToRoads settles the truth.
  ensureFlowStatus().then(() => {
    if (S._liveMode && S._enabled && generation === S._loadGeneration) {
      fetchFlowForBounds(clamped, {}).catch(() => { /* warm-up only */ });
    }
  });

  S._fetching = true;
  // Only COMMIT these on success. Committing up-front means a failed Overpass
  // fetch (rate-limited / feed down) still trips the overlap gate in
  // onCameraChanged, so a stationary user never retries (H3/H5). Stage the
  // prospective values and roll back if nothing rendered.
  const prevBounds = S._lastBounds;
  const prevViewCenter = S._lastViewCenter;
  S._lastBounds = clamped;
  S._lastViewCenter = getBoundsCenter(clamped);
  let renderedSomething = false;

  try {
    let cache = _tileCache.get(cacheKey);
    if (!cache) {
      // LRU eviction: drop the oldest entry when cache exceeds the cap
      if (_tileCache.size >= TILE_CACHE_MAX_ENTRIES) {
        const oldest = _tileCache.keys().next().value;
        _tileCache.delete(oldest);
      }
      cache = { major: null, full: null };
      _tileCache.set(cacheKey, cache);
    }

    // Fast path: full road set already cached — render and return.
    // Flow is (re)applied even on cache hits: roads cache for the session,
    // but congestion data has a 120s shelf life. The race renders within
    // FLOW_RENDER_RACE_MS either way; late flow recolors in place.
    if (cache.full) {
      renderedSomething = await applyFlowThenRender(
        cache.full, clamped, generation, altitude, 'Cache full', trace
      );
      return;
    }

    // Intermediate path: render cached major roads while fetching the rest
    if (cache.major) {
      if (!await applyFlowThenRender(
        cache.major, clamped, generation, altitude, 'Cache major', trace
      )) return;
      renderedSomething = true;
    } else {
      // Fetch major roads first (smaller payload, faster response)
      S._activeFetchAbort = new AbortController();
      console.log(`[Data:Traffic] Fast fetch major roads [${cacheKey}]`);
      const majorData = await fetchRoads(
        clamped.south, clamped.west, clamped.north, clamped.east,
        { majorOnly: true, timeoutSec: 12, signal: S._activeFetchAbort.signal },
        trace,
      );
      // Discard stale response if a newer load was triggered while waiting
      if (generation !== S._loadGeneration) return;
      cache.major = await _parseRoads(majorData, trace);
      if (!await applyFlowThenRender(
        cache.major, clamped, generation, altitude, 'Loaded major', trace
      )) return;
      renderedSomething = true;
    }

    // At higher altitude, major roads provide sufficient motion density
    if (altitude > FAST_FETCH_ALTITUDE) return;

    // Detailed pass: fetch the full road graph (tertiary, residential, etc.)
    S._activeFetchAbort = new AbortController();
    console.log(`[Data:Traffic] Full fetch local roads [${cacheKey}]`);
    const fullData = await fetchRoads(
      clamped.south, clamped.west, clamped.north, clamped.east,
      { majorOnly: false, timeoutSec: 20, signal: S._activeFetchAbort.signal },
      trace,
    );
    if (generation !== S._loadGeneration) return;

    cache.full = await _parseRoads(fullData, trace);
    if (!await applyFlowThenRender(
      cache.full, clamped, generation, altitude, 'Loaded full', trace
    )) return;
    renderedSomething = true;

  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.warn('[Data:Traffic] Fetch error:', e);
  } finally {
    if (generation === S._loadGeneration) {
      S._fetching = false;
      // Roll back the bounds commit if this load rendered nothing (e.g. the
      // Overpass fetch failed). Leaving them committed would make the overlap
      // gate skip the retry while the user sits still. Guarded on generation so
      // a superseding load's commit is not clobbered.
      if (!renderedSomething) {
        S._lastBounds = prevBounds;
        S._lastViewCenter = prevViewCenter;
      }
    }
    S._activeFetchAbort = null;
  }
}
