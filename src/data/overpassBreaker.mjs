/**
 * overpassBreaker.mjs — per-endpoint failure memory for the Overpass mirror
 * sweep in overpassCore.mjs.
 *
 * `fetchOverpassPayload` tries mirrors sequentially with a 22 s timeout each.
 * Without failure memory every request re-pays that timeout for a host that is
 * already known dead: during the 2026-10-21 outage two of the three hosts
 * accepted TCP but never answered HTTP, so each road fetch burned ~44 s before
 * the proxy could even reach its serve-stale fallback, and the client's
 * two-pass loader issued a fresh pair of those per viewport move.
 *
 * This module remembers which endpoints just failed and for how long to leave
 * them alone, so a repeat request skips them in microseconds instead of
 * minutes. The scheduling decision is a pure function of (endpoints, state,
 * now) — the live Map is only a default argument, so tests drive it without
 * timers or network.
 *
 * Deliberately NOT tripped by Overpass "runtime error" / "timed out" bodies:
 * those are a property of the query (too expensive for the mirror), not of the
 * host, so letting one heavy boundary pivot blacklist every mirror would
 * punish the cheap road queries that follow.
 *
 * Node-only (imported by overpassCore.mjs via vite.config.js), never bundled
 * for the browser.
 *
 * @module data/overpassBreaker
 */

/**
 * Cooldown ladder by consecutive failure count (ms): a first failure is often a
 * blip, so it only parks the host for a minute; a host that keeps failing is a
 * real outage and gets parked for progressively longer, capped at 15 min so a
 * recovered mirror is always retried within one exploration session.
 */
export const OVERPASS_BREAKER_COOLDOWNS_MS = Object.freeze([60_000, 300_000, 900_000]);

/**
 * @type {Map<string,{failures:number,openUntil:number}>}
 * Live breaker state keyed by endpoint URL. Process-lifetime only — a
 * dev-server restart starts optimistic, which is the right default because the
 * most common reason to restart is that the operator changed something.
 */
export const _overpassBreakerState = new Map();

/**
 * How long to park an endpoint after its nth consecutive failure.
 *
 * @param {number} consecutiveFailures Failure count including the one just recorded.
 * @returns {number} Cooldown in ms.
 */
export function overpassBreakerCooldownMs(consecutiveFailures) {
  const rung = Math.min(
    Math.max(Math.trunc(consecutiveFailures) || 1, 1),
    OVERPASS_BREAKER_COOLDOWNS_MS.length,
  );
  return OVERPASS_BREAKER_COOLDOWNS_MS[rung - 1];
}

/**
 * Record a host-level failure (timeout, refused connection, 5xx, rate limit)
 * and park the endpoint for its next cooldown rung.
 *
 * @param {string} endpoint Endpoint URL that failed.
 * @param {{state?:Map,now?:number}} [opts]
 * @returns {{failures:number,openUntil:number}} The stored entry.
 */
export function recordOverpassEndpointFailure(endpoint, opts = {}) {
  const { state = _overpassBreakerState, now = Date.now() } = opts;
  const failures = (state.get(endpoint)?.failures || 0) + 1;
  const entry = { failures, openUntil: now + overpassBreakerCooldownMs(failures) };
  state.set(endpoint, entry);
  return entry;
}

/**
 * Clear an endpoint's failure memory after it serves a usable response.
 *
 * @param {string} endpoint Endpoint URL that succeeded.
 * @param {{state?:Map}} [opts]
 * @returns {boolean} Whether a cooldown was cleared.
 */
export function recordOverpassEndpointSuccess(endpoint, opts = {}) {
  const { state = _overpassBreakerState } = opts;
  return state.delete(endpoint);
}

/**
 * Whether an endpoint is outside its cooldown window.
 *
 * @param {string} endpoint Endpoint URL to check.
 * @param {{state?:Map,now?:number}} [opts]
 * @returns {boolean} Whether the endpoint may be tried normally.
 */
export function overpassEndpointAvailable(endpoint, opts = {}) {
  const { state = _overpassBreakerState, now = Date.now() } = opts;
  const entry = state.get(endpoint);
  return !entry || now >= entry.openUntil;
}

/**
 * Decide which endpoints this request may try, in order.
 *
 * Returns every endpoint outside its cooldown, in declared preference order.
 * When all of them are parked it returns exactly ONE probe — the endpoint
 * closest to recovery — rather than the whole list: during a total outage the
 * old sweep spent one timeout per mirror before the proxy could answer, and the
 * caller has a stale-cache fallback that is only worth reaching quickly. A
 * failed probe pushes that endpoint's cooldown furthest out, so the next
 * request naturally probes a different host.
 *
 * @param {string[]} endpoints Endpoints in declared preference order.
 * @param {{state?:Map,now?:number}} [opts]
 * @returns {string[]} Endpoints to try, in order.
 */
export function planOverpassAttempts(endpoints, opts = {}) {
  const { state = _overpassBreakerState, now = Date.now() } = opts;
  const available = [];
  const parked = [];
  (endpoints || []).forEach((endpoint, index) => {
    const entry = state.get(endpoint);
    if (!entry || now >= entry.openUntil) available.push(endpoint);
    else parked.push({ endpoint, openUntil: entry.openUntil, index });
  });
  if (available.length) return available;
  if (!parked.length) return [];
  parked.sort((a, b) => a.openUntil - b.openUntil || a.index - b.index);
  return [parked[0].endpoint];
}

/**
 * Classify one mirror attempt and update its failure memory accordingly.
 *
 * The distinction this owns: a failure caused by the HOST (timeout, refused
 * connection, DNS, TLS, 5xx, rate limit) parks the endpoint, while a failure
 * caused by the QUERY (an Overpass "runtime error"/"timed out" body, or a
 * response too large for our read cap) clears it — the host answered, so
 * blacklisting it would punish the cheaper queries behind this one.
 *
 * @param {string} endpoint Endpoint URL that was attempted.
 * @param {'ok'|'rate-limited'|'server-error'|'runtime-error'|Error} outcome
 *   Result of the attempt: a tag, or the thrown error for network failures.
 * @param {{state?:Map,now?:number}} [opts]
 * @returns {boolean} Whether the endpoint is now parked.
 */
export function noteOverpassEndpointOutcome(endpoint, outcome, opts = {}) {
  const queryFault = outcome === 'ok'
    || outcome === 'runtime-error'
    || outcome?.code === 'RESPONSE_TOO_LARGE';
  if (queryFault) {
    recordOverpassEndpointSuccess(endpoint, opts);
    return false;
  }
  recordOverpassEndpointFailure(endpoint, opts);
  return true;
}

/** Forget all failure memory. Exported for tests and for operator-triggered resets. */
export function resetOverpassBreaker(opts = {}) {
  const { state = _overpassBreakerState } = opts;
  state.clear();
}
