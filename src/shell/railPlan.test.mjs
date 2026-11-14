import test from 'node:test';
import assert from 'node:assert/strict';
import { panelsToCollapse } from './railPlan.js';

test('opening DISPLAY collapses every other open rail panel, the camera panel included', () => {
  assert.deepEqual(
    panelsToCollapse('pp-toggles', ['data-panel', 'global-context-panel', 'cctv-panel']),
    ['data-panel', 'cctv-panel', 'global-context-panel'],
  );
});

test('opening Layer data closes Scenes and the floating panels too', () => {
  assert.deepEqual(
    panelsToCollapse('data-panel', ['scene-panel', 'pp-toggles', 'global-context-panel']),
    ['scene-panel', 'pp-toggles', 'global-context-panel'],
  );
});

test('opening the camera panel closes Layer data, and Layer data closes the camera panel', () => {
  assert.deepEqual(panelsToCollapse('cctv-panel', ['data-panel', 'pp-toggles']), ['data-panel', 'pp-toggles']);
  assert.deepEqual(panelsToCollapse('data-panel', ['cctv-panel']), ['cctv-panel']);
});

test('unknown ids and panels outside the rail are left alone', () => {
  assert.deepEqual(panelsToCollapse('nope', ['data-panel']), []);
  assert.deepEqual(panelsToCollapse('data-panel', ['radio-panel']), []);
});

test('an already-closed panel is not asked to collapse', () => {
  assert.deepEqual(panelsToCollapse('pp-toggles', []), []);
});
