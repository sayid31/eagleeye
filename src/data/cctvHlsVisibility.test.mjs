import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installHlsTabReturnReload } from './cctvHlsVisibility.js';
import { HLS_RELOAD_AFTER_HIDDEN_MS } from './cctvConstants.js';

function makeHarness({ hls } = {}) {
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  let clock = 1_000_000;
  const loads = [];
  const feed = hls === undefined
    ? { url: 'http://host/api/cctv/media/cam-1', loadSource: (u) => loads.push(u) }
    : hls;
  const uninstall = installHlsTabReturnReload({ doc, getHls: () => feed, now: () => clock });
  const setVisibility = (state) => {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { doc, loads, uninstall, setVisibility, advance: (ms) => { clock += ms; } };
}

test('reloads the live source when the tab returns after a long hide', () => {
  const h = makeHarness();
  h.setVisibility('hidden');
  h.advance(HLS_RELOAD_AFTER_HIDDEN_MS);
  h.setVisibility('visible');
  assert.deepEqual(h.loads, ['http://host/api/cctv/media/cam-1']);
});

test('a short tab flick does not restart the feed', () => {
  const h = makeHarness();
  h.setVisibility('hidden');
  h.advance(HLS_RELOAD_AFTER_HIDDEN_MS - 1);
  h.setVisibility('visible');
  assert.equal(h.loads.length, 0);
});

test('a visible event with no preceding hide is ignored', () => {
  const h = makeHarness();
  h.setVisibility('visible');
  assert.equal(h.loads.length, 0);
});

test('one hide reloads once, not on every later visible event', () => {
  const h = makeHarness();
  h.setVisibility('hidden');
  h.advance(HLS_RELOAD_AFTER_HIDDEN_MS * 3);
  h.setVisibility('visible');
  h.setVisibility('visible');
  assert.equal(h.loads.length, 1);
});

test('no active hls instance (or one without a url) is a no-op', () => {
  for (const hls of [null, { url: null, loadSource: () => assert.fail('must not load') }]) {
    const h = makeHarness({ hls });
    h.setVisibility('hidden');
    h.advance(HLS_RELOAD_AFTER_HIDDEN_MS * 2);
    assert.doesNotThrow(() => h.setVisibility('visible'));
  }
});

test('a throwing loadSource is reported with context, not swallowed or rethrown', () => {
  const h = makeHarness({ hls: { url: 'u', loadSource: () => { throw new Error('boom'); } } });
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    h.setVisibility('hidden');
    h.advance(HLS_RELOAD_AFTER_HIDDEN_MS);
    h.setVisibility('visible');
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /HLS reload after \d+s hidden failed/);
});

test('uninstall stops further reloads', () => {
  const h = makeHarness();
  h.uninstall();
  h.setVisibility('hidden');
  h.advance(HLS_RELOAD_AFTER_HIDDEN_MS);
  h.setVisibility('visible');
  assert.equal(h.loads.length, 0);
});
