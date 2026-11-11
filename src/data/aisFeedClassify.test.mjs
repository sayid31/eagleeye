import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aisFetchFailureReason } from './aisFeedClassify.js';

test('aisFetchFailureReason names a fetch timeout with its budget', () => {
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  assert.equal(aisFetchFailureReason(timeout, 20000), 'waktu habis memuat AIS live (>20 dtk)');
});

test('aisFetchFailureReason keeps other failure messages and has a fallback', () => {
  assert.equal(aisFetchFailureReason(new TypeError('Failed to fetch'), 20000), 'Failed to fetch');
  assert.equal(aisFetchFailureReason(new Error('AIS live HTTP 502'), 20000), 'AIS live HTTP 502');
  assert.equal(aisFetchFailureReason(null, 20000), 'Pemuatan AIS live gagal');
  assert.equal(aisFetchFailureReason(new Error(''), 20000), 'Pemuatan AIS live gagal');
});
