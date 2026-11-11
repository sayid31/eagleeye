import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateLayerLoading,
  createLoadingFeedbackState,
  normalizeLayerLoading,
  presentLoadingFeedback,
  reduceLoadingFeedback,
} from './loadingFeedback.js';

/** Stats shape Mapped Installations reports when the view is wider than its 10° request cap. */
const zoomInStats = {
  count: 0,
  lastUpdate: null,
  stale: false,
  saturated: false,
  error: 'Perbesar untuk memuat konteks instalasi terpetakan',
  status: 'zoom-in',
  loading: false,
  loadingLabel: '',
};

function installations(stats, lifecycleState = 'enabled') {
  return aggregateLayerLoading([{
    id: 'military-installations', name: 'Mapped Installations', enabled: true, lifecycleState, stats,
  }]);
}

test('a zoom-in guidance prompt is not a loading failure', () => {
  const record = normalizeLayerLoading({
    id: 'military-installations', enabled: true, lifecycleState: 'enabled', stats: zoomInStats,
  });
  assert.equal(record.error, null);
  assert.equal(record.degraded, false);
  assert.equal(record.unavailable, false);
});

test('enabling Mapped Installations at a global view does not announce LOAD FAILED', () => {
  const enabling = installations({ loading: true }, 'enabling');
  let state = reduceLoadingFeedback(createLoadingFeedbackState(), enabling, 0);
  state = reduceLoadingFeedback(state, enabling, 200);
  assert.equal(state.visible, true);

  const zoomIn = installations(zoomInStats);
  state = reduceLoadingFeedback(state, zoomIn, 250, {
    type: 'visibility', layerId: 'military-installations', enabled: true,
  });
  assert.notEqual(state.terminal, 'error');
  assert.notEqual(presentLoadingFeedback(state, zoomIn, 250)?.label, 'MUAT GAGAL');
});

test('empty and idle guidance carry their prompt without failing the batch', () => {
  for (const status of ['empty', 'idle', 'ZOOM-IN']) {
    const record = normalizeLayerLoading({
      id: 'x', enabled: true, lifecycleState: 'enabled', stats: { status, error: 'prompt', count: 0 },
    });
    assert.equal(record.error, null, status);
  }
});

test('a real failure still fails, and a manager refresh failure outranks guidance', () => {
  const unavailable = normalizeLayerLoading({
    id: 'military-installations', enabled: true, lifecycleState: 'enabled',
    stats: { status: 'unavailable', error: 'Konteks instalasi tidak tersedia', count: 0 },
  });
  assert.equal(unavailable.error, 'Konteks instalasi tidak tersedia');
  assert.equal(unavailable.unavailable, true);

  const refreshFailed = normalizeLayerLoading({
    id: 'military-installations', enabled: true, lifecycleState: 'enabled',
    stats: { ...zoomInStats, managerRefreshError: 'Mapped Installations refresh unavailable' },
  });
  assert.equal(refreshFailed.error, 'Mapped Installations refresh unavailable');
});

test('enabling into an unavailable proxy still announces LOAD FAILED', () => {
  const enabling = installations({ loading: true }, 'enabling');
  let state = reduceLoadingFeedback(createLoadingFeedbackState(), enabling, 0);
  state = reduceLoadingFeedback(state, enabling, 200);
  const failed = installations({ status: 'unavailable', error: 'Konteks instalasi tidak tersedia', count: 0 });
  state = reduceLoadingFeedback(state, failed, 250, {
    type: 'visibility', layerId: 'military-installations', enabled: true,
  });
  assert.equal(state.terminal, 'error');
  assert.equal(presentLoadingFeedback(state, failed, 250).label, 'MUAT GAGAL');
});
