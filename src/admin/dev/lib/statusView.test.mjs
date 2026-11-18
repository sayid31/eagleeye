import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TONE_CLASSES } from '../../../components/app/statusBadgeView.js';
import { healthBadge, providerName } from './statusView.js';
import { shouldPoll } from './useAutoRefresh.js';

test('every health state has a word, an icon and a tone the badge stylesheet knows (never colour alone)', () => {
  for (const status of ['ok', 'warn', 'error', 'off', 'unknown']) {
    const view = healthBadge(status);
    assert.ok(view.label.length > 1, status);
    assert.ok(view.icon, status);
    assert.ok(Object.hasOwn(TONE_CLASSES, view.tone), `${status} → ${view.tone}`);
  }
  assert.deepEqual(['ok', 'warn', 'error'].map((s) => healthBadge(s).tone), ['success', 'warning', 'destructive']);
});

test('healthBadge: unknown states read as "unknown"; a label override replaces only the word', () => {
  assert.equal(healthBadge('weird').status, 'unknown');
  assert.equal(healthBadge('weird').label, 'Tanpa data');
  assert.equal(healthBadge('ok', 'Siap').label, 'Siap');
  assert.equal(healthBadge('ok', 'Siap').icon, healthBadge('ok').icon);
});

test('providerName prefers the display name over the server ALL-CAPS title', () => {
  assert.equal(providerName('openai', 'OPENAI'), 'OpenAI');
  assert.equal(providerName('google-maps', 'GOOGLE MAPS'), 'Google Maps');
  assert.equal(providerName('new-one', 'NEW ONE'), 'NEW ONE');
  assert.equal(providerName('constructor', undefined), 'constructor', 'prototype keys are not providers');
});

test('auto-refresh polls only while the tab is visible', () => {
  assert.equal(shouldPoll('visible'), true);
  assert.equal(shouldPoll('hidden'), false);
});
