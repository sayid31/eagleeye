import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createFailureTracker, proxyFailureMiddleware, routeGroup } from './proxyFailureWatch.mjs';

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
  assert.deepEqual(events.map((e) => e.code), ['proxy.failing']);
});
