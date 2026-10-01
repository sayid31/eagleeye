// Moved out of annotationResolver.js (annotationResolverCache).

import { NEG_CACHE_TTL_MS } from './annotationResolverConstants.js';

/** Read a cache entry → value | null (cached not-found within TTL) | undefined (miss/expired). */
export function cacheRead(cache, key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.value !== null) return entry.value; // positive — always valid
  if (Date.now() - entry.at <= NEG_CACHE_TTL_MS) return null; // negative within TTL
  cache.delete(key); // expired negative → allow a re-fetch
  return undefined;
}

/** Write a positive (or definitive-null) cache entry with a timestamp. */
export function cacheWrite(cache, key, value) {
  cache.set(key, { value, at: Date.now() });
}

/**
 * Cache a null (not-found) result — but ONLY when it is DEFINITIVE (the upstream
 * answered "no such place"), never on an abort or a transient error (network /
 * 429 / 5xx / timeout). Caching those would poison the key; instead we leave it a
 * miss so the next attempt retries. Definitive negatives still carry a TTL.
 */
export function negCache(cache, key, signal, definitive = true) {
  if (signal?.aborted) return; // superseded — never cache
  if (!definitive) return; // transient upstream failure — allow a retry
  cacheWrite(cache, key, null);
}

/** Wire an external AbortSignal to a local controller; returns a detach fn. */
export function linkAbort(controller, externalSignal) {
  if (!externalSignal) return () => {};
  if (externalSignal.aborted) { controller.abort(); return () => {}; }
  const onAbort = () => controller.abort();
  externalSignal.addEventListener('abort', onAbort, { once: true });
  return () => externalSignal.removeEventListener('abort', onAbort);
}
