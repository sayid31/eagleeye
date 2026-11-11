import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  _beginAisSessionForTest,
  _getVesselFeedStateForTest,
  _loadLivePositionsForTest,
  _setAisRuntimeForTest,
  _setVesselStateForTest,
} from './aisLiveVessels.js';
import { AIS_LIVE_FETCH_TIMEOUT_MS } from './aisLiveVesselsConstants.js';

/** Inert scheduler: the first-connect grace timer must not fire or hold the process. */
const inertRuntime = { now: () => 1000, setTimeout: () => ({}), clearTimeout: () => {} };

test('a timed-out poll surfaces a timeout reason instead of a generic failure', async () => {
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  const priorWarn = console.warn;
  let requestedSignal = null;
  globalThis.window = { location: { origin: 'https://eagle-eye.example' } };
  globalThis.fetch = async (_url, init) => {
    requestedSignal = init.signal;
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };
  console.warn = () => {};
  _setAisRuntimeForTest(inertRuntime);
  _setVesselStateForTest({ viewer: {}, records: [] });
  try {
    _beginAisSessionForTest();
    await _loadLivePositionsForTest({});
    const feed = _getVesselFeedStateForTest();
    assert.ok(requestedSignal, 'poll must carry a timeout-capable signal');
    assert.equal(feed.status, 'unavailable');
    assert.equal(feed.firstConnectPhase, 'unavailable');
    assert.equal(feed.error, `waktu habis memuat AIS live (>${AIS_LIVE_FETCH_TIMEOUT_MS / 1000} dtk)`);
  } finally {
    globalThis.fetch = priorFetch;
    console.warn = priorWarn;
    if (hadWindow) globalThis.window = priorWindow;
    else delete globalThis.window;
    _setVesselStateForTest({ enabled: false });
    _setAisRuntimeForTest();
  }
});

test('the poll timeout budget leaves room for a multi-MB body yet stays inside the refresh cadence', async () => {
  const { REFRESH_MS } = await import('./aisLiveVesselsConstants.js');
  assert.ok(AIS_LIVE_FETCH_TIMEOUT_MS >= 20000);
  assert.ok(AIS_LIVE_FETCH_TIMEOUT_MS < REFRESH_MS);
});
