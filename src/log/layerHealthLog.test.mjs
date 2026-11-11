import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  installLayerHealthLog, layerFaultReason, layerHealthEvents, layerVisibilityFailureEvent, LAYER_HEALTH_POLL_MS,
} from './layerHealthLog.js';
import { BROWSER_LOG_SOURCES, normalizeLogEvent } from '../admin/log/serverLogCore.mjs';

const ais = (stats, over = {}) => ({ id: 'ais-live-vessels', name: 'AIS Vessels', enabled: true, lifecycleState: 'enabled', stats, ...over });
const timeoutStats = { count: 0, lastUpdate: null, status: 'unavailable', error: 'waktu habis memuat AIS live (>20 dtk)' };

test('a layer turning unavailable is reported once with its label and reason', () => {
  const first = layerHealthEvents(new Map(), [ais(timeoutStats)]);
  assert.equal(first.events.length, 1);
  const [event] = first.events;
  assert.equal(event.level, 'error');
  assert.equal(event.source, 'layer');
  assert.equal(event.code, 'layer.unavailable');
  assert.match(event.message, /— sumber tidak tersedia: waktu habis memuat AIS live \(>20 dtk\)$/);
  assert.deepEqual(event.detail, { layer: 'ais-live-vessels', state: 'unavailable', count: 0 });
  assert.ok(normalizeLogEvent(event, { allowedSources: BROWSER_LOG_SOURCES }), 'must pass the /api/log ingest');

  const again = layerHealthEvents(first.next, [ais(timeoutStats)]);
  assert.deepEqual(again.events, [], 'an unchanged fault is not re-sent');
});

test('a changed reason in the same state is reported; recovery is reported once', () => {
  let { next } = layerHealthEvents(new Map(), [ais(timeoutStats)]);
  const changed = layerHealthEvents(next, [ais({ ...timeoutStats, error: 'AIS live HTTP 502' })]);
  assert.equal(changed.events.length, 1);
  assert.match(changed.events[0].message, /AIS live HTTP 502$/);
  next = changed.next;

  const recovered = layerHealthEvents(next, [ais({ count: 900, lastUpdate: 1, status: 'live' })]);
  assert.deepEqual(recovered.events.map((e) => [e.level, e.code]), [['info', 'layer.recovered']]);
  assert.equal(recovered.next.size, 0);
  assert.deepEqual(layerHealthEvents(recovered.next, [ais({ count: 900, lastUpdate: 1 })]).events, []);
});

test('loading keeps the last report; disabled, transitioning and guidance layers report nothing', () => {
  const { next } = layerHealthEvents(new Map(), [ais(timeoutStats)]);
  const loading = layerHealthEvents(next, [ais({ loading: true })]);
  assert.deepEqual(loading.events, []);
  assert.equal(loading.next.get('ais-live-vessels'), next.get('ais-live-vessels'));

  const quiet = layerHealthEvents(new Map(), [
    ais(timeoutStats, { enabled: false }),
    ais(timeoutStats, { lifecycleState: 'enabling' }),
    { id: 'military-installations', enabled: true, lifecycleState: 'enabled', stats: { status: 'zoom-in', error: 'Perbesar…', count: 0 } },
  ]);
  assert.deepEqual(quiet.events, []);
});

test('degraded, stale and fallback are warnings', () => {
  const { events } = layerHealthEvents(new Map(), [
    { id: 'traffic', enabled: true, lifecycleState: 'enabled', stats: { count: 5, lastUpdate: 1, mode: 'sim', error: 'SIMULATED — TomTom daily budget reached' } },
    { id: 'satellites', enabled: true, lifecycleState: 'enabled', stats: { count: 5, lastUpdate: 1, stale: true } },
  ]);
  assert.deepEqual(events.map((e) => [e.level, e.code]), [['warn', 'layer.fallback'], ['warn', 'layer.stale']]);
  assert.match(events[1].message, /data usang: tanpa keterangan dari layer$/);
});

test('layerFaultReason prefers the layer error and accepts Error objects', () => {
  assert.equal(layerFaultReason({ error: 'a', lastError: 'b' }), 'a');
  assert.equal(layerFaultReason({ managerRefreshError: new Error('refresh failed') }), 'refresh failed');
  assert.equal(layerFaultReason({}), 'tanpa keterangan dari layer');
});

test('a failed enable from the manager becomes one error event', () => {
  const event = layerVisibilityFailureEvent({ type: 'visibility-failed', layerId: 'satellites', phase: 'resolve', error: new Error('chunk load failed') });
  assert.equal(event.code, 'layer.visibility_failed');
  assert.match(event.message, /gagal saat resolve: chunk load failed$/);
  assert.deepEqual(event.detail, { layer: 'satellites', phase: 'resolve' });
  assert.ok(normalizeLogEvent(event, { allowedSources: BROWSER_LOG_SOURCES }));
  assert.equal(layerVisibilityFailureEvent({ type: 'visibility', layerId: 'satellites' }), null);
});

test('installLayerHealthLog polls getAll, forwards manager failures, and stops cleanly', () => {
  const logged = [];
  let listener = null;
  let tick = null;
  let cancelled = false;
  let rows = [ais(timeoutStats)];
  const manager = {
    getAll: () => rows,
    subscribe: (fn) => { listener = fn; return () => { listener = null; }; },
  };
  const stop = installLayerHealthLog(manager, {
    log: (e) => logged.push(e.code),
    every: (fn, ms) => { assert.equal(ms, LAYER_HEALTH_POLL_MS); tick = fn; return 1; },
    cancel: () => { cancelled = true; },
  });
  tick();
  tick();
  rows = [ais({ count: 10, lastUpdate: 1 })];
  tick();
  listener({ type: 'visibility-failed', layerId: 'ais-live-vessels', phase: 'enable', error: 'boom' });
  assert.deepEqual(logged, ['layer.unavailable', 'layer.recovered', 'layer.visibility_failed']);
  stop();
  assert.equal(cancelled, true);
  assert.equal(listener, null);
});
