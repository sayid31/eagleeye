import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { SHARE_RESTORE_FLIGHT_S, SHARE_RESTORE_HOLD_MS } from './shareRestoreTiming.js';

const ui = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const sharelink = fs.readFileSync(new URL('./sharelink.js', import.meta.url), 'utf8');

test('both holds are positive and finite', () => {
  assert.ok(Number.isFinite(SHARE_RESTORE_HOLD_MS) && SHARE_RESTORE_HOLD_MS > 0);
  assert.ok(Number.isFinite(SHARE_RESTORE_FLIGHT_S) && SHARE_RESTORE_FLIGHT_S > 0);
});

// The hold is a deferred-navigation grace window. At 0 ms the setTimeout body
// would run in the same task that armed it, so `_reassertNavigationHandoff()`
// could never observe a competing claim and the window would stop being one.
test('the hold stays long enough for a competing navigation to claim authority', () => {
  assert.ok(SHARE_RESTORE_HOLD_MS >= 100, 'a sub-100 ms window cannot be won by anything');
});

// Guards the measured win, not taste: these two are ~71% of a reload, so a
// future edit that walks either back toward the 2026-10-08 values should have
// to change this line and read why.
test('neither value regresses to the pre-2026-10-29 timings', () => {
  assert.ok(SHARE_RESTORE_HOLD_MS <= 500, 'the 1500 ms hold was measured and lowered');
  assert.ok(SHARE_RESTORE_FLIGHT_S <= 1.2, 'the 3.0 s flight was measured and lowered');
});

// `ui.js` and `sharelink.js` are both far over the file-health limit, which is
// how these two spent so long as bare literals in separate files. Pin that
// neither reintroduces one.
test('neither consumer carries a hardcoded duration any more', () => {
  assert.match(ui, /}, SHARE_RESTORE_HOLD_MS\);/);
  assert.doesNotMatch(ui, /}, 1500\);/);
  assert.match(sharelink, /duration: SHARE_RESTORE_FLIGHT_S,/);
  assert.doesNotMatch(sharelink, /duration: 3\.0,/);
});

// The flight is awaited before the splash lifts (`sharelink.js` resolves on
// `await cameraPromise`, and `ui.js` settles the view-ready gate after it), so
// this value is spent behind an opaque cover and is pure latency to a
// recipient. That ordering is what justified lowering it; assert it still holds.
test('the flight is still inside the span the splash waits on', () => {
  const settle = ui.indexOf('this._initialViewReadyGate?.settle(');
  const applyState = ui.indexOf('await this.shareLinkManager.applyState(savedState');
  assert.ok(applyState > 0 && settle > applyState,
    'the splash must still gate on the flight for this duration to be latency');
  assert.match(sharelink, /const camera = await cameraPromise;/);
});
