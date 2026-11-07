import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLayoutRelevantMutation } from './panelLayoutMutations.js';

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
