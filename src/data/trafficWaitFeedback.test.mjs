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
    'antre di server peta OSM · 4 dtk (biasanya ±45)',
  );
  assert.equal(
    osmWaitLabel(5000, 5000 + 12_900),
    'antre di server peta OSM · 12 dtk (biasanya ±45)',
  );
});

test('past the typical queue the copy stops promising a 45 s ceiling', () => {
  const label = osmWaitLabel(0, OSM_WAIT_TYPICAL_MS + 3000);
  assert.equal(label, 'server peta OSM masih antre · 48 dtk');
  assert.ok(!label.includes('biasanya'));
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

test('the global banner names the loading layer only; the OSM queue note stays on the traffic chip', () => {
  // Both chips used to print the same queue sentence, one above the other.
  const loading = { id: 'traffic', name: 'Traffic', enabled: true, stats: { loading: true, loadingLabel: osmWaitLabel(0, 9000) } };
  assert.ok(!('waitNote' in normalizeLayerLoading(loading)));
  const state = { ...createLoadingFeedbackState(), visible: true, phase: 'loading', startedAt: 0 };
  assert.equal(presentLoadingFeedback(state, aggregateLayerLoading([loading]), 9000).detail, 'Lalu lintas');
});
