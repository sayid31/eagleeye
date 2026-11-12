/**
 * overpassFetch.mjs — the one place an Overpass query leaves this process:
 * mirror sweep with breaker skips, rate-limit/runtime-error detection, the
 * process-wide slot gate (overpassSlots.mjs) and a per-mirror outcome
 * summary for logs. Split out of overpassCore.mjs, which keeps the
 * sanitizer, mirror list, sweep budget and caches.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 *
 * @module data/overpassFetch
 */
import { readResponseTextCapped } from '../server/proxyInfra.mjs';
import { noteOverpassEndpointOutcome, planOverpassAttempts } from './overpassBreaker.mjs';
import { OVERPASS_MAX_RESPONSE_BYTES, OVERPASS_UPSTREAMS, overpassAttemptTimeoutMs } from './overpassCore.mjs';
import { simplifyOverpassPayloadBody } from './overpassSimplify.mjs';
import { getOverpassSlotGate } from './overpassSlots.mjs';

/**
 * Detect whether an Overpass API response body indicates rate-limiting.
 *
 * Checks for known rate-limit phrases in the body text regardless of
 * HTTP status code, since some mirrors return 200 with an error payload.
 *
 * @param {string} bodyText - Upstream response body.
 * @returns {boolean} True if the body looks rate-limited.
 */
function overpassLooksRateLimited(bodyText) {
  const text = String(bodyText || '').toLowerCase();
  return text.includes('rate_limited')
    || text.includes('quota of your ip address')
    || text.includes('dispatcher_client::request_read_and_idx::rate_limited')
    || text.includes('too many requests');
}

/**
 * Detect an Overpass HTTP-200 body that is actually a runtime FAILURE (server-side
 * timeout / out-of-memory) via its `remark`. These are transient upstream failures,
 * not authoritative empty results, so they must not be returned or cached.
 */
function overpassLooksRuntimeError(bodyText) {
  const text = String(bodyText || '').toLowerCase();
  return text.includes('runtime error')
    || text.includes('timed out')
    || text.includes('out of memory');
}

/**
 * Longest a query waits in the slot queue before its first mirror attempt.
 * Overpass queries here take ~20–40 s, so one full query ahead must fit.
 */
export const OVERPASS_SLOT_WAIT_MS = 45_000;
/**
 * Whole-request ceiling, queue wait included: the public host sits behind
 * Cloudflare, which drops an origin answer that takes longer than 100 s.
 */
export const OVERPASS_TOTAL_BUDGET_MS = 90_000;

/**
 * Whether an upstream answer may enter the memory/disk cache: a 2xx with real
 * data only. Any status < 500 used to qualify, so 314 HTML 406 refusals from a
 * September User-Agent block sat on disk under road keys as if they were roads.
 * @param {{status:number, rateLimited?:boolean, runtimeError?:boolean}} payload
 * @returns {boolean}
 */
export function isCacheableOverpassPayload(payload) {
  return payload?.status >= 200 && payload.status < 300 && !payload.rateLimited && !payload.runtimeError;
}

/** `https://lz4.overpass-api.de/api/interpreter` → `lz4.overpass-api.de`. */
function overpassHost(endpoint) {
  try { return new URL(endpoint).host; } catch { return String(endpoint); }
}

/**
 * Try each Overpass upstream in order until one succeeds.
 *
 * Skips rate-limited or 5xx responses and falls through to the next
 * mirror. If all mirrors fail, returns the last rate-limited payload
 * (if any) or throws the last error.
 *
 * Only mirrors outside their breaker cooldown are tried (overpassBreaker.mjs),
 * and the sweep as a whole is bounded by OVERPASS_SWEEP_BUDGET_MS — a mirror
 * reached after the budget is gone is left untried rather than parked, since
 * running out of clock says nothing about that host's health.
 *
 * Each attempt first takes a process-wide slot (overpassSlots.mjs) so this
 * process never holds more queries than Overpass grants one IP. The first
 * wait is bounded by OVERPASS_SLOT_WAIT_MS and the sweep clock starts once a
 * slot is held — queueing behind a 40 s query must not eat the attempt it
 * waited for — while OVERPASS_TOTAL_BUDGET_MS bounds the whole request.
 * `signal` abandons the sweep (e.g. every client of a coalesced request went
 * away) without blaming a mirror.
 *
 * Every outcome is summarised in `attempts` ("overpass-api.de: HTTP 429
 * rate-limited") — on the returned payload and on a thrown error, whose
 * message carries it — so a failure reaching the Server Log says why.
 *
 * @param {string} body - URL-encoded Overpass QL query body.
 * @param {number} [maxResponseBytes] Endpoint-specific response cap.
 * @param {{signal?: AbortSignal, gate?: ReturnType<typeof getOverpassSlotGate>,
 *   slotWaitMs?: number, totalBudgetMs?: number}} [options]
 * @returns {Promise<{status:number,body:string,contentType:string,endpoint:string,rateLimited:boolean,attempts:string[]}>}
 */
export async function fetchOverpassPayload(body, maxResponseBytes = OVERPASS_MAX_RESPONSE_BYTES, {
  signal, gate = getOverpassSlotGate(),
  slotWaitMs = OVERPASS_SLOT_WAIT_MS, totalBudgetMs = OVERPASS_TOTAL_BUDGET_MS,
} = {}) {
  let lastError = null;
  let lastRateLimitPayload = null;
  const attempts = [];
  const requestStart = Date.now();
  const totalLeft = () => totalBudgetMs - (Date.now() - requestStart);
  /** Starts when the first slot is held; null while still queued. */
  let sweepStart = null;
  const planned = planOverpassAttempts(OVERPASS_UPSTREAMS);
  for (const endpoint of OVERPASS_UPSTREAMS) {
    if (!planned.includes(endpoint)) attempts.push(`${overpassHost(endpoint)}: parked after recent failures`);
  }

  for (const endpoint of planned) {
    const host = overpassHost(endpoint);
    const waitMs = Math.min(
      sweepStart === null ? slotWaitMs : overpassAttemptTimeoutMs(Date.now() - sweepStart),
      totalLeft(),
    );
    if (waitMs <= 0) {
      lastError = lastError || new Error('Overpass sweep budget exhausted');
      break;
    }
    let release;
    try {
      release = await gate.acquire({ timeoutMs: waitMs, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      attempts.push(`${host}: ${error.message}`);
      lastError = error;
      break;
    }
    sweepStart ??= Date.now();
    const attemptMs = Math.min(overpassAttemptTimeoutMs(Date.now() - sweepStart), totalLeft());
    if (attemptMs <= 0) {
      release();
      attempts.push(`${host}: sweep budget spent waiting for a slot`);
      lastError = lastError || new Error('Overpass sweep budget exhausted');
      break;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), attemptMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'eagleeye-view-overpass-proxy/1.0',
        },
        body,
        signal: controller.signal,
      });

      const responseBody = await readResponseTextCapped(upstream, maxResponseBytes);
      const contentType = upstream.headers.get('content-type') || 'application/json';
      const status = upstream.status;
      const rateLimited = status === 429 || overpassLooksRateLimited(responseBody);
      const runtimeError = overpassLooksRuntimeError(responseBody);
      const payload = {
        status,
        body: responseBody,
        contentType,
        endpoint,
        rateLimited,
        runtimeError,
        attempts,
      };

      if (rateLimited) {
        noteOverpassEndpointOutcome(endpoint, 'rate-limited');
        attempts.push(`${host}: HTTP ${status} rate-limited`);
        lastRateLimitPayload = payload;
        continue;
      }
      // A 200 body carrying a runtime error / timeout is a transient upstream
      // failure — skip to the next mirror rather than returning or caching it.
      if (runtimeError) {
        noteOverpassEndpointOutcome(endpoint, 'runtime-error');
        attempts.push(`${host}: HTTP ${status} runtime error (query timeout/out of memory)`);
        lastError = new Error(`Overpass runtime error (${endpoint})`);
        continue;
      }
      if (status >= 500) {
        noteOverpassEndpointOutcome(endpoint, 'server-error');
        attempts.push(`${host}: HTTP ${status}`);
        lastError = new Error(`Overpass upstream returned ${status} (${endpoint})`);
        continue;
      }

      // Success: decimate giant boundary geometry before it reaches the cache,
      // the disk, or the client (what makes the 32 MB read cap safe to hold).
      noteOverpassEndpointOutcome(endpoint, 'ok');
      if (status >= 400) attempts.push(`${host}: HTTP ${status}`);
      payload.body = simplifyOverpassPayloadBody(payload.body);
      return payload;
    } catch (error) {
      // Abandoned by the caller: no mirror is to blame.
      if (signal?.aborted) throw error;
      noteOverpassEndpointOutcome(endpoint, error);
      attempts.push(`${host}: ${controller.signal.aborted ? `no answer within ${Math.round(attemptMs / 1000)} s` : `${error?.name || 'Error'}: ${error?.message || error}`}`);
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      release();
    }
  }

  if (lastRateLimitPayload) return lastRateLimitPayload;
  const failure = new Error(`All Overpass mirrors failed — ${attempts.join('; ') || lastError?.message || 'no mirror tried'}`, { cause: lastError });
  failure.attempts = attempts;
  throw failure;
}
