/**
 * rocketLaunchesProxy.mjs — Vite dev/preview plugin for the Launch Library 2
 * (thespacedevs.com) upcoming/recent rocket-launch feed proxy.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 * Upstream: https://ll.thespacedevs.com/2.3.0/launches/ — a public feed, no
 * key required, but an optional LL2_API_TOKEN raises the rate limit and is
 * kept server-side only (never sent to the browser). Cache: memory + disk
 * (.gev-cache/launch-library-2-v2.3.json), TTL 15 min, single-flight
 * refresh. A past-TTL copy is answered at once (`X-GEV-Cache: STALE`) while
 * the refresh runs in the background; only a cold cache waits for LL2, and a
 * failed refresh is not retried for 5 min (staleWhileRevalidate.mjs).
 *
 * GET /api/launches → raw upstream JSON body (results for the trailing 30
 * days, capped at 100).
 */

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { coalesceProxyRequest, readResponseTextCapped } from '../server/proxyInfra.mjs';
import { cacheDecision } from '../server/staleWhileRevalidate.mjs';

/** Cache TTL for the Launch Library 2 recent-launch feed (15 min). */
export const LL2_CACHE_TTL_MS = 15 * 60_000;
/** After a failed refresh, wait this long before asking LL2 again (free tier: 15 calls/hour). */
export const LL2_FAILURE_BACKOFF_MS = 5 * 60_000;

/** Build LL2 request headers without exposing its optional token client-side. */
export function launchLibraryRequestHeaders(token = process.env.LL2_API_TOKEN) {
  const normalized = String(token || '').trim();
  return {
    Accept: 'application/json',
    ...(normalized ? { Authorization: `Token ${normalized}` } : {}),
  };
}

/**
 * Vite plugin: proxy the public Launch Library 2 recent-launch feed
 * server-side.
 *
 * @param {{cachePath?: string, now?: () => number}} [options]
 * @returns {import('vite').Plugin}
 */
export function rocketLaunchesProxy({
  cachePath = path.join(process.cwd(), '.gev-cache', 'launch-library-2-v2.3.json'),
  now: clock = () => Date.now(),
} = {}) {
  const ttlMs = LL2_CACHE_TTL_MS;
  const maxResponseBytes = 12 * 1024 * 1024;
  const maxDiskCacheBytes = 24 * 1024 * 1024;
  let cache = null;
  let diskLoaded = false;
  let lastFailureAt = null;
  const inFlight = new Map();

  async function loadDiskCache() {
    if (diskLoaded) return;
    diskLoaded = true;
    try {
      const stat = await fsp.stat(cachePath);
      if (stat.size > maxDiskCacheBytes) throw new Error('cache file too large');
      const parsed = JSON.parse(await fsp.readFile(cachePath, 'utf8'));
      if (Number.isFinite(parsed?.at) && typeof parsed?.body === 'string') {
        const body = JSON.parse(parsed.body);
        if (Array.isArray(body?.results)) cache = parsed;
      }
    } catch { /* first run or invalid cache */ }
  }

  async function saveDiskCache(entry) {
    try {
      await fsp.mkdir(path.dirname(cachePath), { recursive: true });
      await fsp.writeFile(cachePath, JSON.stringify(entry), 'utf8');
    } catch (error) {
      console.warn(`[launch-library-proxy] cache write failed: ${error?.message || error}`);
    }
  }

  function send(res, status, body, cacheState) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=900' : 'no-store',
      'X-GEV-Cache': cacheState,
    });
    res.end(body);
  }

  async function refreshUpstream() {
    const end = new Date(clock());
    const start = new Date(end.getTime() - 30 * 86400000);
    const url = new URL('https://ll.thespacedevs.com/2.3.0/launches/');
    url.searchParams.set('net__gte', start.toISOString());
    url.searchParams.set('net__lte', end.toISOString());
    url.searchParams.set('limit', '100');
    url.searchParams.set('mode', 'detailed');
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: launchLibraryRequestHeaders(),
    });
    const body = await readResponseTextCapped(upstream, maxResponseBytes);
    if (!upstream.ok) {
      const error = new Error(`upstream HTTP ${upstream.status}`);
      error.upstreamStatus = upstream.status;
      error.upstreamBody = body;
      throw error;
    }
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed?.results)) throw new Error('malformed upstream response');
    const fresh = { at: clock(), body };
    cache = fresh;
    lastFailureAt = null;
    void saveDiskCache(fresh);
    return fresh;
  }

  /** Coalesced refresh; a failure is logged once and starts the backoff. */
  function refresh() {
    const request = coalesceProxyRequest(inFlight, 'recent-launches', refreshUpstream);
    if (!request.shared) {
      request.promise.catch((error) => {
        lastFailureAt = clock();
        console.warn(`[launch-library-proxy] refresh failed (${error?.message || error}) — next try in ${LL2_FAILURE_BACKOFF_MS / 60_000} min`);
      });
    }
    return request;
  }

  function install(middlewares) {
    middlewares.use('/api/launches', async (req, res) => {
      if (req.method !== 'GET') {
        send(res, 405, JSON.stringify({ error: 'Method Not Allowed' }), 'NONE');
        return;
      }
      await loadDiskCache();
      const decision = cacheDecision({
        entry: cache, now: clock(), ttlMs, lastFailureAt, failureBackoffMs: LL2_FAILURE_BACKOFF_MS,
      });
      if (decision.serve === 'fresh') {
        send(res, 200, cache.body, 'HIT');
        return;
      }
      if (decision.serve === 'stale') {
        if (decision.refresh) refresh().promise.catch(() => {}); // failure already logged by refresh()
        send(res, 200, cache.body, decision.refresh || inFlight.size ? 'STALE' : 'STALE-BACKOFF');
        return;
      }
      if (decision.serve === 'unavailable') {
        send(res, 502, JSON.stringify({ error: 'Launch Library 2 unavailable (recent refresh failed)' }), 'BACKOFF');
        return;
      }
      const request = refresh();
      try {
        const fresh = await request.promise;
        send(res, 200, fresh.body, request.shared ? 'INFLIGHT' : 'MISS');
      } catch (error) {
        send(
          res,
          Number.isInteger(error?.upstreamStatus) ? error.upstreamStatus : 502,
          error?.upstreamBody || JSON.stringify({ error: 'Launch Library 2 unavailable' }),
          'NONE',
        );
      }
    });
  }

  return {
    name: 'rocket-launches-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
