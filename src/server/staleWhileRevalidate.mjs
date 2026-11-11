/**
 * staleWhileRevalidate.mjs — when a cached upstream copy may be served
 * without waiting, and when a refresh may be started.
 *
 * The CelesTrak and Launch Library proxies used to hold every request past
 * the cache TTL until the upstream answered (up to 20 s), even with a usable
 * copy in hand; that wait sat directly in the Space Missions enable path. A
 * past-TTL copy is now served at once and refreshed in the background, and a
 * failed refresh is not retried until a backoff passes, so an upstream outage
 * neither stalls requests nor gets hammered. Only a cold cache waits.
 *
 * @module server/staleWhileRevalidate
 */

/**
 * @param {{entry: {at: number}|null|undefined, now: number, ttlMs: number,
 *   lastFailureAt?: number|null, failureBackoffMs: number}} input
 * @returns {{serve: 'fresh'|'stale'|'wait'|'unavailable', refresh: boolean}}
 *   `fresh`/`stale`: send the entry now; `wait`: await the refresh;
 *   `unavailable`: nothing to send and a refresh failed too recently to retry.
 */
export function cacheDecision({ entry, now, ttlMs, lastFailureAt = null, failureBackoffMs }) {
  const backingOff = Number.isFinite(lastFailureAt) && now - lastFailureAt < failureBackoffMs;
  if (entry && Number.isFinite(entry.at) && now - entry.at < ttlMs) return { serve: 'fresh', refresh: false };
  if (entry) return { serve: 'stale', refresh: !backingOff };
  return backingOff ? { serve: 'unavailable', refresh: false } : { serve: 'wait', refresh: true };
}
