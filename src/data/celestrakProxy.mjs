/**
 * celestrakProxy.mjs — Vite dev/preview plugin for the CelesTrak TLE proxy.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 * CelesTrak does not send CORS headers, so this middleware fetches satellite
 * TLE data server-side and forwards it to the browser. Upstream:
 * https://celestrak.org/NORAD/elements/gp.php
 */

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { cacheDecision } from '../server/staleWhileRevalidate.mjs';

/** Cache TTL: CelesTrak asks for no more than one GP fetch per group every ~2 h. */
export const TLE_TTL_MS = 6 * 3600_000;
/** After a failed refresh, wait this long before asking CelesTrak again. */
export const TLE_FAILURE_BACKOFF_MS = 15 * 60_000;

/**
 * CelesTrak GP/TLE proxy with a memory + disk cache.
 * Upstream: https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=tle
 * CelesTrak asks clients not to re-fetch GP data more than ~every 2 h and
 * throttles offenders; every dev reload used to refetch every group. Cache TTL
 * 6 h. A past-TTL copy is served immediately (`x-tle-cache: STALE`) while one
 * background refresh per group runs; only a group with no copy at all waits
 * for CelesTrak. A failed refresh is not retried for 15 min
 * (`STALE-BACKOFF`), and a cold group in that window answers 502 at once
 * rather than paying the 20 s timeout again (see staleWhileRevalidate.mjs).
 * Adapted from skylight's TleStore (MIT).
 *
 * @param {{cacheDir?: string, now?: () => number}} [options]
 * @returns {import('vite').Plugin}
 */
export function celestrakProxy({ cacheDir = path.join(process.cwd(), '.gev-cache'), now: clock = () => Date.now() } = {}) {
  const CACHE_DIR = cacheDir;
  const mem = new Map(); // group -> { at: epochMs, body: string }
  const inflight = new Map(); // group -> Promise<{at, body}|null>
  const failedAt = new Map(); // group -> epochMs of the last failed refresh

  const diskPath = (group) => path.join(CACHE_DIR, `celestrak-${group}.json`);

  async function readDisk(group) {
    try {
      const parsed = JSON.parse(await fsp.readFile(diskPath(group), 'utf8'));
      if (typeof parsed?.body === 'string' && Number.isFinite(parsed?.at)) return parsed;
    } catch { /* no disk cache yet */ }
    return null;
  }

  async function writeDisk(group, entry) {
    try {
      await fsp.mkdir(CACHE_DIR, { recursive: true });
      await fsp.writeFile(diskPath(group), JSON.stringify(entry), 'utf8');
    } catch (err) {
      console.warn(`[celestrak-proxy] cache write failed for ${group}:`, err?.message || err);
    }
  }

  async function fetchUpstream(group) {
    const url = new URL('https://celestrak.org/NORAD/elements/gp.php');
    url.searchParams.set('GROUP', group);
    url.searchParams.set('FORMAT', 'tle');
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(20000),
      // CelesTrak 403s bulk groups (e.g. `active`) unless the request carries a
      // descriptive User-Agent with a contact point.
      headers: { 'User-Agent': 'eagleeye-view-celestrak-proxy/1.0 (+https://github.com/bilawalsidhu/gods-eye-view)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    // An upstream error page parses to zero TLEs — treat as failure, keep cache.
    if (!/^1 /m.test(body)) throw new Error('no TLE lines in response');
    return { at: clock(), body };
  }

  /** Single-flight refresh; resolves to the fresh entry, or null after logging the failure. */
  function refresh(group) {
    if (!inflight.has(group)) {
      inflight.set(group, fetchUpstream(group)
        .then(async (fresh) => {
          mem.set(group, fresh);
          failedAt.delete(group);
          await writeDisk(group, fresh);
          return fresh;
        })
        .catch((err) => {
          failedAt.set(group, clock());
          console.warn(`[celestrak-proxy] ${group} refresh failed (${err?.message || err}) — serving cache if any, next try in ${TLE_FAILURE_BACKOFF_MS / 60_000} min`);
          return null;
        })
        .finally(() => inflight.delete(group)));
    }
    return inflight.get(group);
  }

  return {
    name: 'celestrak-proxy',
    configureServer(server) {
      server.middlewares.use('/api/celestrak', async (req, res) => {
        const group = String(req.url || '').replace(/^\//, '').split('?')[0];
        if (!/^[a-z0-9-]+$/i.test(group)) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('invalid group');
          return;
        }
        const send = (status, body, cacheStatus) => {
          // Guard against a double-send (e.g. a throw AFTER a response already
          // went out routing into the catch's send): writeHead after headersSent
          // throws "Cannot set headers after they are sent".
          if (res.headersSent) return;
          res.writeHead(status, { 'Content-Type': 'text/plain', 'x-tle-cache': cacheStatus });
          res.end(body);
        };
        try {
          let entry = mem.get(group);
          if (!entry) {
            entry = await readDisk(group);
            if (entry) mem.set(group, entry);
          }
          const decision = cacheDecision({
            entry, now: clock(), ttlMs: TLE_TTL_MS, lastFailureAt: failedAt.get(group), failureBackoffMs: TLE_FAILURE_BACKOFF_MS,
          });
          if (decision.refresh && decision.serve !== 'wait') void refresh(group);
          if (decision.serve === 'fresh') {
            send(200, entry.body, 'HIT');
          } else if (decision.serve === 'stale') {
            // A stale TLE beats both an empty layer and a 20 s wait.
            send(200, entry.body, decision.refresh || inflight.has(group) ? 'STALE' : 'STALE-BACKOFF');
          } else if (decision.serve === 'wait') {
            const fresh = await refresh(group);
            if (fresh) send(200, fresh.body, 'MISS');
            else send(502, 'celestrak fetch failed and no cache available', 'NONE');
          } else {
            send(502, 'celestrak fetch failed recently and no cache available', 'BACKOFF');
          }
        } catch (err) {
          send(500, `celestrak proxy error: ${err?.message || err}`, 'ERROR');
        }
      });
    },
  };
}
