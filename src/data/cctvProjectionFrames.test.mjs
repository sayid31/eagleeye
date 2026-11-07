import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintProjectionPlaceholder, placeholderStatusText } from './cctvProjectionFrames.js';

test('placeholder status: source message first, then loading vs no-feed', () => {
  assert.equal(placeholderStatusText({ feedConfigured: true }, { message: 'Sumber mati' }), 'SUMBER MATI');
  assert.equal(placeholderStatusText({ feedConfigured: true }, { status: 'degraded' }), 'MEMUAT VIDEO');
  assert.equal(placeholderStatusText({ feedConfigured: false }), 'TANPA FEED');
  assert.equal(placeholderStatusText(null), 'MEMUAT VIDEO');
});

test('the placeholder does not repeat the camera name the card title already shows', () => {
  const texts = [];
  const ctx = new Proxy({ fillText: (text) => texts.push(text), createLinearGradient: () => ({ addColorStop() {} }) }, {
    get: (target, key) => (key in target ? target[key] : () => {}),
    set: () => true,
  });
  paintProjectionPlaceholder(ctx, { name: 'ATCS Mojosongo Barat', city: 'Surakarta', feedConfigured: true });
  assert.deepEqual(texts, ['MEMUAT VIDEO', 'SURAKARTA']);
});
