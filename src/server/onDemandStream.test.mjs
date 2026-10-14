import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOnDemandStreamManager,
  normalizeOnDemand,
  OnDemandStartError,
  ON_DEMAND_START_FAILED_MESSAGE,
} from './onDemandStream.mjs';

const CONTROL = 'https://host.example/api/v1/public/cctv/abc';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function harness(handler, extra = {}) {
  const calls = [];
  const clock = { t: 1000 };
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, ua: init.headers?.['User-Agent'] });
    return handler(String(url), calls);
  };
  const manager = createOnDemandStreamManager({
    userAgent: 'ua-test', fetchFn, now: () => clock.t, randomId: () => 'fixed', sleep: async () => {},
    heartbeatMs: 20, idleMs: 100, ...extra,
  });
  return { manager, calls, clock };
}

test('normalizeOnDemand accepts a same-origin control URL and rejects everything else', () => {
  const src = 'https://host.example/hls/cam/index.m3u8';
  assert.deepEqual(normalizeOnDemand({ controlUrl: `${CONTROL}/` }, src), { controlUrl: CONTROL });
  assert.equal(normalizeOnDemand({ controlUrl: 'https://other.example/x' }, src), undefined);
  assert.equal(normalizeOnDemand({ controlUrl: `${CONTROL}?viewer_id=x` }, src), undefined);
  assert.equal(normalizeOnDemand({ controlUrl: 'https://u:p@host.example/x' }, src), undefined);
  assert.equal(normalizeOnDemand({ controlUrl: 'ftp://host.example/x' }, src), undefined);
  assert.equal(normalizeOnDemand(null, src), undefined);
  assert.equal(normalizeOnDemand({}, src), undefined);
});

test('ensure starts one POST viewer session and concurrent callers share it', async () => {
  const { manager, calls } = harness(() => json({ ok: true, hls_url: '/hls/x/index.m3u8' }));
  await Promise.all([manager.ensure('c1', { controlUrl: CONTROL }), manager.ensure('c1', { controlUrl: CONTROL })]);
  await manager.ensure('c1', { controlUrl: CONTROL });
  const starts = calls.filter((c) => c.url.includes('/start?'));
  assert.equal(starts.length, 1);
  assert.equal(starts[0].method, 'POST');
  assert.equal(starts[0].ua, 'ua-test');
  assert.match(starts[0].url, /viewer_id=eev-fixed&context=public&quality=auto$/);
  assert.equal(manager.activeCount(), 1);
  manager.stopAll();
});

test('a failed start throws only the generic message, never the host text with credentials', async () => {
  const secret = 'rtsp://admin:hunter2@10.0.0.9/stream';
  const { manager } = harness(() => json({ ok: false, message: `ffmpeg failed: ${secret}` }));
  await assert.rejects(
    () => manager.ensure('c1', { controlUrl: CONTROL }),
    (err) => err instanceof OnDemandStartError && err.message === ON_DEMAND_START_FAILED_MESSAGE && !err.message.includes('hunter2'),
  );
  assert.equal(manager.activeCount(), 0);
});

test('a non-JSON or HTTP-error start also fails generically, and the next call retries', async () => {
  let n = 0;
  const { manager, calls } = harness(() => (++n === 1 ? new Response('boom', { status: 500 }) : json({ ok: true })));
  await assert.rejects(() => manager.ensure('c1', { controlUrl: CONTROL }), OnDemandStartError);
  await manager.ensure('c1', { controlUrl: CONTROL });
  assert.equal(calls.filter((c) => c.url.includes('/start?')).length, 2);
  manager.stopAll();
});

test('heartbeats keep the session alive while touched and stop it once idle', async () => {
  const { manager, calls, clock } = harness(() => json({ ok: true }));
  await manager.ensure('c1', { controlUrl: CONTROL });
  await new Promise((r) => setTimeout(r, 70));
  assert.ok(calls.some((c) => c.url.includes('/heartbeat?')), 'heartbeat sent');
  assert.equal(manager.activeCount(), 1);
  clock.t += 500; // far past idleMs with no touch
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(manager.activeCount(), 0);
  assert.ok(calls.some((c) => c.url.includes('/stop?')), 'stop sent');
});

test('touch refreshes the idle clock', async () => {
  const { manager, clock } = harness(() => json({ ok: true }));
  await manager.ensure('c1', { controlUrl: CONTROL });
  clock.t += 90;
  manager.touch('c1');
  clock.t += 90;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(manager.activeCount(), 1);
  manager.stopAll();
});

test('fetchWhenReady retries 404 playlists and drops the viewer when it never appears', async () => {
  const { manager, calls } = harness(() => json({ ok: true }));
  await manager.ensure('c1', { controlUrl: CONTROL });
  let tries = 0;
  const okRes = await manager.fetchWhenReady('c1', async () => (++tries < 3 ? new Response('', { status: 404 }) : new Response('#EXTM3U')));
  assert.equal(okRes.status, 200);
  assert.equal(tries, 3);
  const never = await manager.fetchWhenReady('c1', async () => new Response('', { status: 404 }));
  assert.equal(never.status, 404);
  assert.equal(manager.activeCount(), 0);
  assert.ok(calls.some((c) => c.url.includes('/stop?')));
});
