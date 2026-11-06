import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { adminDenialEvent, adminDenialMiddleware, adminRouteGroup } from './adminDenialWatch.mjs';

test('adminRouteGroup groups admin API paths and ignores everything else', () => {
  assert.equal(adminRouteGroup('/api/admin/keys/test?x=1'), '/api/admin/keys');
  assert.equal(adminRouteGroup('/api/admin/log'), '/api/admin/log');
  assert.equal(adminRouteGroup('/api/tomtom/x'), null);
  assert.equal(adminRouteGroup('/admin/server-log'), null);
});

test('only 401 and 403 become access_denied entries', () => {
  assert.equal(adminDenialEvent('/api/admin/keys', 200), null);
  assert.equal(adminDenialEvent('/api/admin/keys', 405), null);
  assert.match(adminDenialEvent('/api/admin/keys', 401).message, /no valid admin session/);
  assert.match(adminDenialEvent('/api/admin/keys', 403).message, /origin not allowed/);
});

test('the middleware records on finish and always calls next', () => {
  const events = [];
  const mw = adminDenialMiddleware((e) => events.push(e));
  const res = Object.assign(new EventEmitter(), { statusCode: 401 });
  let next = 0;
  mw({ url: '/api/admin/voice/settings' }, res, () => { next += 1; });
  res.emit('finish');
  assert.equal(next, 1);
  assert.deepEqual(events.map((e) => e.detail), [{ route: '/api/admin/voice', status: 401 }]);
});
