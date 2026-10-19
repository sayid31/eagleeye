import test from 'node:test';
import assert from 'node:assert/strict';
import { panelsToCollapse } from './railPlan.js';

test('opening DISPLAY collapses every other open side panel', () => {
  assert.deepEqual(
    panelsToCollapse('pp-toggles', ['data-panel', 'global-context-panel', 'cctv-panel']),
    ['data-panel', 'global-context-panel'],
  );
});

test('opening Layer data or Scenes only collapses the floating panels', () => {
  assert.deepEqual(
    panelsToCollapse('data-panel', ['scene-panel', 'pp-toggles', 'global-context-panel']),
    ['pp-toggles', 'global-context-panel'],
  );
});

test('the camera panel and unknown ids are left alone', () => {
  assert.deepEqual(panelsToCollapse('cctv-panel', ['data-panel', 'pp-toggles']), []);
  assert.deepEqual(panelsToCollapse('nope', ['data-panel']), []);
});

test('an already-closed panel is not asked to collapse', () => {
  assert.deepEqual(panelsToCollapse('pp-toggles', []), []);
});
