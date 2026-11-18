import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerName } from './statusView.js';
import { shouldPoll } from './useAutoRefresh.js';

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
