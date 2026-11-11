import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  createFailureTracker, proxyFailureMiddleware, responseFailureEvent, routeGroup,
} from './proxyFailureWatch.mjs';

test('routeGroup keeps the first two segments of /api paths and skips log/admin routes', () => {
  assert.equal(routeGroup('/api/tomtom/tile/1/2?key=secret'), '/api/tomtom');
  assert.equal(routeGroup('/api/opensky'), '/api/opensky');
  assert.equal(routeGroup('/api/log'), null);
  assert.equal(routeGroup('/api/admin/keys'), null);
  assert.equal(routeGroup('/src/main.js'), null);
  assert.equal(routeGroup('/api/'), null);
});

test('a route is reported once after three 5xx in a row, and once when it recovers', () => {
  const tracker = createFailureTracker(3);
  assert.equal(tracker.observe('/api/tomtom', 502), null);
  assert.equal(tracker.observe('/api/tomtom', 504), null);
  const failing = tracker.observe('/api/tomtom', 503);
  assert.equal(failing.code, 'proxy.failing');
  assert.deepEqual(failing.detail, { route: '/api/tomtom', status: 503 });
  assert.equal(tracker.observe('/api/tomtom', 503), null, 'not repeated while still failing');
  assert.equal(tracker.observe('/api/tomtom', 200).code, 'proxy.recovered');
  assert.equal(tracker.observe('/api/tomtom', 200), null);
});

test('4xx answers and interleaved successes do not build a streak', () => {
  const tracker = createFailureTracker(3);
  for (const status of [500, 404, 500, 200, 500, 429]) assert.equal(tracker.observe('/api/x', status), null);
});

test('the middleware observes the finished response status and always calls next', () => {
  const events = [];
  const mw = proxyFailureMiddleware((e) => events.push(e), createFailureTracker(1));
  let nextCalls = 0;
  const res = Object.assign(new EventEmitter(), { statusCode: 500 });
  mw({ url: '/api/firms/area' }, res, () => { nextCalls += 1; });
  res.emit('finish');
  mw({ url: '/index.html' }, Object.assign(new EventEmitter(), { statusCode: 500 }), () => { nextCalls += 1; });
  assert.equal(nextCalls, 2);
  assert.deepEqual(events.map((e) => e.code), ['proxy.http_error', 'proxy.failing']);
});

test('snapshot reports the last status per route and whether it is failing', async () => {
  const { createFailureTracker: make } = await import('./proxyFailureWatch.mjs');
  const tracker = make(2);
  tracker.observe('/api/tomtom', 200, 10);
  tracker.observe('/api/overpass', 502, 20);
  tracker.observe('/api/overpass', 504, 30);
  assert.deepEqual(tracker.snapshot(), [
    { route: '/api/overpass', lastStatus: 504, lastAt: 30, streak: 2, failing: true },
    { route: '/api/tomtom', lastStatus: 200, lastAt: 10, streak: 0, failing: false },
  ]);
});

test('every 5xx and 429 answer is its own event naming route and status', () => {
  assert.deepEqual(responseFailureEvent('/api/celestrak', 504), {
    level: 'error', source: 'proxy', code: 'proxy.http_error', message: '/api/celestrak answered HTTP 504', detail: { route: '/api/celestrak', status: 504 },
  });
  assert.deepEqual(responseFailureEvent('/api/military-installations', 429), {
    level: 'warn', source: 'proxy', code: 'proxy.rate_limited',
    message: '/api/military-installations answered HTTP 429 (rate limited)', detail: { route: '/api/military-installations', status: 429 },
  });
  for (const status of [200, 304, 400, 404]) assert.equal(responseFailureEvent('/api/x', status), null, String(status));
});

test('the middleware logs a single 5xx immediately, before any streak', () => {
  const events = [];
  const mw = proxyFailureMiddleware((e) => events.push(e), createFailureTracker());
  const res = Object.assign(new EventEmitter(), { statusCode: 503 });
  mw({ url: '/api/ais-live?maxRows=12000' }, res, () => {});
  res.emit('finish');
  assert.deepEqual(events.map((e) => [e.code, e.message]), [['proxy.http_error', '/api/ais-live answered HTTP 503']]);
});
