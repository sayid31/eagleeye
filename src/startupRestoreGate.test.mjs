import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const shareState = fs.readFileSync(new URL('./uiShareState.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');

// ui.js is too DOM/Cesium-bound to instantiate under node:test, so the ordering
// contract is pinned structurally (same approach as firstRunExperience.test.mjs).
test('the splash view-ready gate settles after the camera but before saved layers are awaited', () => {
  const block = ui.slice(ui.indexOf('await this.shareLinkManager.applyState(savedState'));
  const gate = block.indexOf('this._initialViewReadyGate?.settle(');
  const layers = block.indexOf('await (this._layerStateRestorePromise');
  const complete = block.indexOf('this.shareLinkManager.completeInitialRestore()');
  assert.ok(gate > 0, 'view-ready gate must be settled on the success path');
  assert.ok(gate < layers, 'saved layers must not hold the splash');
  assert.ok(layers < complete, 'hash writes stay suppressed until the full restore settles');
});

test('every terminal restore path (failure, destroy) also releases the splash gate', () => {
  const settle = shareState.slice(shareState.indexOf('_settleInitialShareRestore(result)'));
  assert.match(settle, /_initialViewReadyGate\?\.settle\(/);
});

test('the splash composes on the view-ready promise, not the full aggregate', () => {
  const startup = main.slice(main.indexOf('void composeSplashReadiness('), main.indexOf('// Expose for debugging'));
  assert.match(startup, /viewReadyPromise: styleManager\.initialViewReadyPromise/);
});

test('the basemap is never restored from the share link or hash', () => {
  const onRestore = ui.slice(ui.indexOf('onRestore: async (state)'), ui.indexOf('isNavigationCurrent:'));
  assert.doesNotMatch(onRestore, /_setMapStack\(/);
  assert.doesNotMatch(onRestore, /\bmapStack\b\s*[,}]/);
});
