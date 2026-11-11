import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGuidanceStatus, layerFeedState, refreshFailureFromStats } from './managerFeedState.js';

test('isGuidanceStatus recognises the prompt states only', () => {
  for (const status of ['zoom-in', 'empty', 'idle', 'Zoom-In']) assert.equal(isGuidanceStatus(status), true, status);
  for (const status of ['ready', 'stale', 'unavailable', 'error', '', null, undefined, 7]) {
    assert.equal(isGuidanceStatus(status), false, String(status));
  }
});

test('a refresh that lands in a guidance state is not a refresh failure', () => {
  const stats = { status: 'zoom-in', error: 'Perbesar untuk memuat konteks instalasi terpetakan', count: 0 };
  assert.equal(refreshFailureFromStats(stats, 'Mapped Installations'), null);
});

test('a refresh with a real error still reports it', () => {
  const failure = refreshFailureFromStats({ status: 'unavailable', error: 'HTTP 503' }, 'Mapped Installations');
  assert.ok(failure instanceof Error);
  assert.equal(failure.message, 'HTTP 503');
  assert.equal(
    refreshFailureFromStats({ unavailable: true }, 'Mapped Installations').message,
    'Mapped Installations refresh unavailable',
  );
});

test('the chip keeps reading a zoom-in prompt as nominal, and stale when the cache is stale', () => {
  assert.equal(layerFeedState({ status: 'zoom-in', error: 'Perbesar…', count: 0 }), 'nominal');
  assert.equal(layerFeedState({ status: 'zoom-in', error: 'Perbesar…', count: 3, stale: true }), 'stale');
  assert.equal(layerFeedState({ status: 'unavailable', error: 'HTTP 503', count: 0 }), 'unavailable');
});
