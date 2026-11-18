import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccessController, lockedGatesOf } from './accessController.js';

const plan = (over = {}) => ({ mode: 'limited', layers: true, voice: true, keyedBasemaps: true, banner: null, ...over });

function setup(planOver, dismissed = null) {
  const calls = [];
  const banners = [];
  const toasts = [];
  const effect = (gate) => (ctx) => { calls.push([gate, ctx.runtime, Boolean(ctx.handles)]); };
  const access = createAccessController({
    plan: plan(planOver),
    effects: { layers: effect('layers'), ai: effect('ai'), premium: effect('premium') },
    showBanner: (model) => banners.push(model),
    dismissedKey: () => dismissed,
    toast: (message) => toasts.push(message),
  });
  return { access, calls, banners, toasts };
}

test('lockedGatesOf maps plan fields to toggles (voice → ai, keyedBasemaps → premium)', () => {
  assert.deepEqual(lockedGatesOf(plan({ voice: false, keyedBasemaps: false })), ['ai', 'premium']);
  assert.deepEqual(lockedGatesOf(plan()), []);
  assert.deepEqual(lockedGatesOf(null), ['layers', 'ai', 'premium']);
});

test('boot locks wait for attach(), then apply once each as non-runtime', () => {
  const { access, calls } = setup({ layers: false, keyedBasemaps: false });
  assert.equal(access.lockKindOf('layers'), 'plan');
  assert.equal(access.lockKindOf('ai'), null);
  assert.deepEqual(calls, []);
  access.attach({ dataManager: {} });
  assert.deepEqual(calls, [['layers', false, true], ['premium', false, true]]);
});

test('a refusal mid-session locks once: effect (runtime), banner refresh, one toast', () => {
  const { access, calls, banners, toasts } = setup({});
  access.attach({});
  assert.equal(access.deny({ gate: 'ai', kind: 'revoked' }), true);
  assert.equal(access.deny({ gate: 'ai', kind: 'revoked' }), false);
  assert.equal(access.deny({ gate: 'admin', kind: 'revoked' }), false);
  assert.deepEqual(calls, [['ai', true, true]]);
  assert.equal(toasts.length, 1);
  assert.deepEqual(banners.at(-1).items, ['Voice & AI']);
  assert.equal(access.lockKindOf('ai'), 'revoked');
});

test('a gate already off at boot is not re-locked by a later refusal (no toast storm)', () => {
  const { access, toasts } = setup({ layers: false });
  access.attach({});
  assert.equal(access.deny({ gate: 'layers', kind: 'killed' }), false);
  assert.deepEqual(toasts, []);
});

test('a refusal before attach() is recorded and applied at attach', () => {
  const { access, calls } = setup({});
  access.deny({ gate: 'premium', kind: 'killed' });
  assert.deepEqual(calls, []);
  access.attach({});
  assert.deepEqual(calls, [['premium', true, true]]);
});

test('banner: unknown plan shows its status line; dismissed set shows nothing; a throwing effect is contained', () => {
  const unknown = setup({ mode: 'unknown', layers: false, voice: false, keyedBasemaps: false, banner: 'Account status could not be checked.' });
  unknown.access.refreshBanner();
  assert.deepEqual(unknown.banners, [{ text: 'Account status could not be checked.' }]);
  const dismissed = setup({ voice: false }, 'ai:o');
  dismissed.access.refreshBanner();
  assert.deepEqual(dismissed.banners, [null]);
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    const broken = createAccessController({ plan: plan({ layers: false }), effects: { layers: () => { throw new Error('boom'); } }, showBanner: () => {} });
    broken.attach({});
    assert.deepEqual(warnings, ['[access] locking layers failed: boom']);
  } finally {
    console.warn = warn;
  }
});
