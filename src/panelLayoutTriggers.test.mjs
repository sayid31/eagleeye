import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OBSTACLE_WIDTH_STEP_PX, createObstacleSizeGate, isLayoutRelevantMutation, isLayoutRelevantResize } from './panelLayoutTriggers.js';

const TEXT = { nodeType: 3 };
const EL = { nodeType: 1 };

test('text-only writes (textContent, typewriter) do not trigger a layout pass', () => {
  assert.equal(isLayoutRelevantMutation([{ type: 'childList', addedNodes: [TEXT], removedNodes: [TEXT] }]), false);
  assert.equal(isLayoutRelevantMutation([{ type: 'characterData' }]), false);
  assert.equal(isLayoutRelevantMutation([]), false);
});

test('attribute changes and element insertions/removals do', () => {
  assert.equal(isLayoutRelevantMutation([{ type: 'attributes', attributeName: 'class' }]), true);
  assert.equal(isLayoutRelevantMutation([{ type: 'childList', addedNodes: [EL], removedNodes: [] }]), true);
  assert.equal(isLayoutRelevantMutation([{ type: 'childList', addedNodes: [], removedNodes: [EL] }]), true);
  assert.equal(isLayoutRelevantMutation([{ type: 'childList', addedNodes: [TEXT] }, { type: 'attributes' }]), true);
});

test('both stack observers filter records and no longer watch characterData', () => {
  const mixin = readFileSync(new URL('./panelAdaptiveLayoutMixin.js', import.meta.url), 'utf8');
  assert.equal((mixin.match(/if \(isLayoutRelevantMutation\(records\)\)/g) || []).length, 2);
  assert.doesNotMatch(mixin, /characterData: true/);
});

test('an obstacle easing its width frame by frame triggers once per step, not per frame', () => {
  const chip = {};
  const gate = createObstacleSizeGate();
  const obstacles = new Set([chip]);
  let passes = 0;
  // A split-flap chip easing from 300 px to 360 px in 1 px frames.
  for (let w = 300; w <= 360; w += 1) {
    if (isLayoutRelevantResize([{ target: chip, contentRect: { width: w, height: 26 } }], obstacles, gate)) passes += 1;
  }
  assert.equal(passes, 1 + Math.floor(60 / OBSTACLE_WIDTH_STEP_PX), 'first sighting + one pass per accumulated step');
  assert.equal(isLayoutRelevantResize([{ target: chip, contentRect: { width: 360, height: 40 } }], obstacles, gate), true, 'any height change counts');
});

test('stack and panel resizes always count, even batched with a gated obstacle', () => {
  const chip = {}; const panel = {};
  const gate = createObstacleSizeGate();
  const obstacles = new Set([chip]);
  isLayoutRelevantResize([{ target: chip, contentRect: { width: 300, height: 26 } }], obstacles, gate);
  assert.equal(isLayoutRelevantResize([
    { target: chip, contentRect: { width: 301, height: 26 } },
    { target: panel, contentRect: { width: 240, height: 500 } },
  ], obstacles, gate), true);
  assert.equal(isLayoutRelevantResize([{ target: chip, contentRect: { width: 302, height: 26 } }], obstacles, gate), false);
});

test('both stacks gate their obstacles', () => {
  const mixin = readFileSync(new URL('./panelAdaptiveLayoutMixin.js', import.meta.url), 'utf8');
  assert.equal((mixin.match(/if \(isLayoutRelevantResize\(entries, obstacles, gate\)\)/g) || []).length, 2);
});
