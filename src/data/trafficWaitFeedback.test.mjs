import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OSM_WAIT_REVEAL_MS,
  OSM_WAIT_TYPICAL_MS,
  osmWaitLabel,
} from './trafficWaitFeedback.js';
import { trafficFeedPresentation } from './trafficFlow.js';
import {
  aggregateLayerLoading,
  createLoadingFeedbackState,
  normalizeLayerLoading,
  presentLoadingFeedback,
} from '../loadingFeedback.js';

const LIVE_CLAIM = /\bLIVE\b|\bGPS\b|\breal[- ]?time\b/;

test('no wait copy while no fetch is in flight or the wait is still short', () => {
  assert.equal(osmWaitLabel(null, 10_000), null);
  assert.equal(osmWaitLabel(undefined, 10_000), null);
  assert.equal(osmWaitLabel(1000, Number.NaN), null);
  assert.equal(osmWaitLabel(1000, 1000 + OSM_WAIT_REVEAL_MS - 1), null);
});

test('a queued fetch names the OSM queue and counts elapsed seconds', () => {
  assert.equal(
    osmWaitLabel(0, OSM_WAIT_REVEAL_MS),
    'menunggu server peta OSM (antre, bisa ~45 dtk) · 4 dtk',
  );
  assert.equal(
    osmWaitLabel(5000, 5000 + 12_900),
    'menunggu server peta OSM (antre, bisa ~45 dtk) · 12 dtk',
  );
});

test('past the typical queue the copy stops promising a 45 s ceiling', () => {
  const label = osmWaitLabel(0, OSM_WAIT_TYPICAL_MS + 3000);
  assert.equal(label, 'server peta OSM masih antre · 48 dtk');
  assert.ok(!label.includes('bisa ~'));
});

test('a clock that runs backwards never yields a negative counter', () => {
  assert.equal(osmWaitLabel(50_000, 10_000), null);
});

test('keyless wait copy still leads with SIMULASI and never claims live', () => {
  const waitLabel = osmWaitLabel(0, 20_000);
  const feed = trafficFeedPresentation({ liveMode: false, fetching: true, waitLabel });
  assert.equal(feed.loadingLabel, `SIMULASI — ${waitLabel}`);
  assert.ok(!LIVE_CLAIM.test(feed.loadingLabel));
  assert.equal(feed.error, null);
});

test('wait copy is ignored when nothing is fetching', () => {
  const waitLabel = osmWaitLabel(0, 20_000);
  assert.equal(
    trafficFeedPresentation({ liveMode: false, fetching: false, waitLabel }).loadingLabel,
    'SIMULASI — tambahkan kunci TomTom untuk live',
  );
});

test('a keyed layer shows the queue note while fetching, and the outage copy still wins', () => {
  const waitLabel = osmWaitLabel(0, 20_000);
  assert.equal(
    trafficFeedPresentation({ liveMode: true, fetching: true, waitLabel }).loadingLabel,
    waitLabel,
  );
  const down = trafficFeedPresentation({
    liveMode: true,
    fetching: true,
    flowError: 'Kuota harian TomTom habis',
    waitLabel,
  });
  assert.equal(down.loadingLabel, 'SIMULASI — Kuota harian TomTom habis');
});

test('the global banner carries the layer wait note only while that layer is loading', () => {
  const note = 'menunggu server peta OSM (antre, bisa ~45 dtk) · 9 dtk';
  const loading = { id: 'traffic', name: 'Traffic', enabled: true, stats: { loading: true, waitNote: note } };
  assert.equal(normalizeLayerLoading(loading).waitNote, note);
  const stale = { ...loading, stats: { loading: false, waitNote: note } };
  assert.equal(normalizeLayerLoading(stale).waitNote, '');

  const state = { ...createLoadingFeedbackState(), visible: true, phase: 'loading', startedAt: 0 };
  const shown = presentLoadingFeedback(state, aggregateLayerLoading([loading]), 9000);
  assert.equal(shown.detail, `Lalu lintas · ${note}`);
  const plain = { ...loading, stats: { loading: true } };
  assert.equal(presentLoadingFeedback(state, aggregateLayerLoading([plain]), 9000).detail, 'Lalu lintas');
});
