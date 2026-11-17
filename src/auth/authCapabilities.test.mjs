import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_KEYS, DEFAULT_CAPABILITIES, effectiveCapabilities, normalizeCapabilities, serializeCapabilities,
} from './authCapabilities.mjs';

test('normalizeCapabilities: JSON or object → three booleans; junk → all off', () => {
  assert.deepEqual(CAPABILITY_KEYS, ['layers', 'ai', 'premium']);
  assert.deepEqual(normalizeCapabilities('{"layers":true,"ai":false,"premium":true,"admin":true}'), { layers: true, ai: false, premium: true });
  assert.deepEqual(normalizeCapabilities({ layers: 'yes', ai: 1, premium: true }), { layers: false, ai: false, premium: true }, 'only literal true counts');
  for (const junk of [null, undefined, '', '{broken', '[]', [], 7, 'true']) {
    assert.deepEqual(normalizeCapabilities(junk), { layers: false, ai: false, premium: false }, String(junk));
  }
});

test('default for new accounts: layers + ai on, premium off', () => {
  assert.deepEqual(DEFAULT_CAPABILITIES, { layers: true, ai: true, premium: false });
});

test('effectiveCapabilities: admins hold every toggle; users only theirs; nobody → none', () => {
  assert.deepEqual(effectiveCapabilities({ role: 'admin', capabilities: '{}' }), { layers: true, ai: true, premium: true });
  assert.deepEqual(effectiveCapabilities({ role: 'super_admin' }), { layers: true, ai: true, premium: true });
  assert.deepEqual(effectiveCapabilities({ role: 'user', capabilities: '{"ai":true}' }), { layers: false, ai: true, premium: false });
  assert.deepEqual(effectiveCapabilities(null), { layers: false, ai: false, premium: false });
});

test('serializeCapabilities round-trips through normalize', () => {
  assert.equal(serializeCapabilities({ layers: true, extra: true }), '{"layers":true,"ai":false,"premium":false}');
});
