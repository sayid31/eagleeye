// Overpass mirror-sweep resilience (field test 2026-10-21): every public mirror
// was down, two of the listed four were the same machine behind a CNAME, and that
// machine accepted TCP without ever answering HTTP — so each road fetch burned
// 22 s twice on one dead box before the proxy could reach its stale cache, and
// the client's two-pass loader repeated that per viewport move. These tests pin
// the two fixes: a de-aliased mirror list, and failure memory that classifies
// host faults (park the mirror) apart from query faults (keep it in rotation).
// Pure functions with injected state and clock — no network, no timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OVERPASS_BREAKER_COOLDOWNS_MS,
  noteOverpassEndpointOutcome,
  overpassBreakerCooldownMs,
  overpassEndpointAvailable,
  planOverpassAttempts,
  recordOverpassEndpointFailure,
  recordOverpassEndpointSuccess,
  resetOverpassBreaker,
} from './overpassBreaker.mjs';
import { fetchOverpassPayload, OVERPASS_UPSTREAMS } from './overpassCore.mjs';

const A = 'https://a.example/api/interpreter';
const B = 'https://b.example/api/interpreter';
const C = 'https://c.example/api/interpreter';
const ALL = [A, B, C];

test('every listed Overpass mirror is a distinct host', () => {
  const hosts = OVERPASS_UPSTREAMS.map((url) => new URL(url).host);
  assert.deepEqual(
    [...new Set(hosts)],
    hosts,
    'two mirrors resolving to one machine charge the same dead host two timeouts',
  );
  assert.ok(
    !hosts.includes('overpass.kumi.systems'),
    'overpass.kumi.systems is a CNAME of overpass.private.coffee — listing both is one host twice',
  );
  assert.ok(hosts.length >= 2, 'a single mirror leaves no fallback when it fails');
});

test('a healthy sweep tries every mirror in declared order', () => {
  const state = new Map();
  assert.deepEqual(planOverpassAttempts(ALL, { state, now: 1000 }), ALL);
  assert.equal(overpassEndpointAvailable(A, { state, now: 1000 }), true);
});

test('a failed mirror is skipped until its cooldown expires, then returns', () => {
  const state = new Map();
  const entry = recordOverpassEndpointFailure(A, { state, now: 1000 });
  assert.equal(entry.failures, 1);
  assert.equal(entry.openUntil, 1000 + OVERPASS_BREAKER_COOLDOWNS_MS[0]);

  assert.deepEqual(
    planOverpassAttempts(ALL, { state, now: 1000 }),
    [B, C],
    'the next request must not re-pay the timeout for a host that just hung',
  );
  assert.equal(overpassEndpointAvailable(A, { state, now: 1000 }), false);

  const afterCooldown = entry.openUntil;
  assert.deepEqual(
    planOverpassAttempts(ALL, { state, now: afterCooldown }),
    ALL,
    'cooldown is a pause, not a blacklist — a recovered mirror is retried',
  );
});

test('repeat failures back off along the ladder and stop growing at the cap', () => {
  const state = new Map();
  let now = 0;
  const seen = [];
  for (let i = 0; i < OVERPASS_BREAKER_COOLDOWNS_MS.length + 2; i += 1) {
    const entry = recordOverpassEndpointFailure(A, { state, now });
    seen.push(entry.openUntil - now);
    now = entry.openUntil;
  }
  const last = OVERPASS_BREAKER_COOLDOWNS_MS[OVERPASS_BREAKER_COOLDOWNS_MS.length - 1];
  assert.deepEqual(seen, [...OVERPASS_BREAKER_COOLDOWNS_MS, last, last]);
  assert.ok(
    last <= 900_000,
    'the cap must stay inside one exploration session so recovery is noticed',
  );
  assert.equal(overpassBreakerCooldownMs(0), OVERPASS_BREAKER_COOLDOWNS_MS[0], 'degenerate count');
  assert.equal(overpassBreakerCooldownMs(99), last, 'beyond the ladder');
});

test('a success wipes the failure memory so the host starts over at rung one', () => {
  const state = new Map();
  recordOverpassEndpointFailure(A, { state, now: 0 });
  recordOverpassEndpointFailure(A, { state, now: 60_000 });
  assert.equal(recordOverpassEndpointSuccess(A, { state }), true);
  assert.equal(overpassEndpointAvailable(A, { state, now: 60_001 }), true);

  const entry = recordOverpassEndpointFailure(A, { state, now: 70_000 });
  assert.equal(entry.failures, 1, 'a proven-good mirror is not punished for old history');
  assert.equal(entry.openUntil, 70_000 + OVERPASS_BREAKER_COOLDOWNS_MS[0]);
});

test('a total outage costs one probe, not one timeout per mirror', () => {
  const state = new Map();
  // All three parked, with different recovery times.
  recordOverpassEndpointFailure(A, { state, now: 0 });
  recordOverpassEndpointFailure(B, { state, now: 10_000 });
  recordOverpassEndpointFailure(C, { state, now: 20_000 });

  const plan = planOverpassAttempts(ALL, { state, now: 25_000 });
  assert.equal(plan.length, 1, 'the caller has a stale cache worth reaching quickly');
  assert.deepEqual(plan, [A], 'probe the mirror closest to recovery');

  // A failed probe pushes A furthest out, so the next request probes a different host.
  recordOverpassEndpointFailure(A, { state, now: 25_000 });
  assert.deepEqual(
    planOverpassAttempts(ALL, { state, now: 26_000 }),
    [B],
    'probes rotate instead of hammering one dead host',
  );
});

test('planning tolerates an empty or missing mirror list', () => {
  const state = new Map();
  assert.deepEqual(planOverpassAttempts([], { state, now: 0 }), []);
  assert.deepEqual(planOverpassAttempts(null, { state, now: 0 }), []);
});

test('host faults park a mirror; query faults leave it in rotation', () => {
  const state = new Map();
  const parked = (outcome) => {
    resetOverpassBreaker({ state });
    return noteOverpassEndpointOutcome(A, outcome, { state, now: 0 });
  };

  // The host is at fault: it never answered, refused us, broke, or cut our quota.
  assert.equal(parked(Object.assign(new Error('aborted'), { name: 'AbortError' })), true);
  assert.equal(parked(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })), true);
  assert.equal(parked('server-error'), true);
  assert.equal(parked('rate-limited'), true);

  // The query is at fault: the host answered, so parking it would punish the
  // cheap road fetches queued behind one expensive boundary pivot.
  assert.equal(parked('ok'), false);
  assert.equal(parked('runtime-error'), false);
  assert.equal(parked(Object.assign(new Error('too large'), { code: 'RESPONSE_TOO_LARGE' })), false);
});

test('a runtime error on one query does not strand the next query', () => {
  const state = new Map();
  // One expensive boundary pivot blows up on every mirror...
  for (const endpoint of ALL) noteOverpassEndpointOutcome(endpoint, 'runtime-error', { state, now: 0 });
  assert.deepEqual(
    planOverpassAttempts(ALL, { state, now: 0 }),
    ALL,
    'a query too heavy for Overpass must not blacklist the whole mirror pool',
  );
});

test('resetOverpassBreaker forgets everything', () => {
  const state = new Map();
  recordOverpassEndpointFailure(A, { state, now: 0 });
  recordOverpassEndpointFailure(B, { state, now: 0 });
  resetOverpassBreaker({ state });
  assert.equal(state.size, 0);
  assert.deepEqual(planOverpassAttempts(ALL, { state, now: 0 }), ALL);
});

// --- Integration: the sweep in overpassCore.mjs actually consults the breaker ---
// The tests above are pure; these drive the real fetchOverpassPayload so the
// wiring cannot be deleted without a failure.

test('the real mirror sweep parks a dead host and skips it next request', async () => {
  const originalFetch = globalThis.fetch;
  const attempts = [];
  resetOverpassBreaker();
  try {
    globalThis.fetch = async (url) => {
      attempts.push(url);
      // First mirror is the dead host: it aborts like a timeout would.
      if (url === OVERPASS_UPSTREAMS[0]) {
        throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      }
      return new Response('{"elements":[]}', {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    };

    const first = await fetchOverpassPayload('data=first');
    assert.deepEqual(attempts, [OVERPASS_UPSTREAMS[0], OVERPASS_UPSTREAMS[1]],
      'the sweep falls through the dead mirror to the next one');
    assert.equal(first.endpoint, OVERPASS_UPSTREAMS[1]);

    attempts.length = 0;
    const second = await fetchOverpassPayload('data=second');
    assert.ok(!attempts.includes(OVERPASS_UPSTREAMS[0]),
      'a host that just hung must not be re-tried on the very next request');
    assert.equal(second.endpoint, OVERPASS_UPSTREAMS[1]);
  } finally {
    globalThis.fetch = originalFetch;
    resetOverpassBreaker();
  }
});

test('the real sweep stops after one probe once every mirror is parked', async () => {
  const originalFetch = globalThis.fetch;
  const attempts = [];
  resetOverpassBreaker();
  try {
    globalThis.fetch = async (url) => {
      attempts.push(url);
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    };

    // First request discovers the total outage: every mirror is tried once.
    await assert.rejects(fetchOverpassPayload('data=outage'));
    assert.equal(attempts.length, OVERPASS_UPSTREAMS.length);

    // The next one costs a single probe, so the proxy reaches its stale cache fast.
    attempts.length = 0;
    await assert.rejects(fetchOverpassPayload('data=outage-again'));
    assert.equal(attempts.length, 1,
      'during an outage the caller should wait for one timeout, not one per mirror');
  } finally {
    globalThis.fetch = originalFetch;
    resetOverpassBreaker();
  }
});
