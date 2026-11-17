import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHarnessAppPath } from './harnessAppUrl.mjs';

test('applyHarnessAppPath: default and bare --url point at /app; an explicit path is kept', () => {
  assert.deepEqual(applyHarnessAppPath(['node', 'track-regression.mjs']), ['node', 'track-regression.mjs', '--url', 'http://localhost:4173/app']);
  assert.deepEqual(applyHarnessAppPath(['node', 't', '--url', 'http://localhost:4391']), ['node', 't', '--url', 'http://localhost:4391/app']);
  assert.deepEqual(applyHarnessAppPath(['node', 't', '--url', 'http://localhost:4391/app', '--headful']), ['node', 't', '--url', 'http://localhost:4391/app', '--headful']);
});
