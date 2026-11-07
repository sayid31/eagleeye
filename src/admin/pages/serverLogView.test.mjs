import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_LABELS, describeContext, describeRepeat, formatLogTime } from './serverLogView.js';
import { logQueryString } from '../api/adminLogApi.js';
import { LOG_SOURCES } from '../../admin/log/serverLogCore.mjs';

test('every log source has an owner-facing label', () => {
  for (const source of LOG_SOURCES) assert.ok(SOURCE_LABELS[source], source);
});

test('formatLogTime renders a stable 24h stamp and a dash for junk', () => {
  assert.match(formatLogTime(Date.UTC(2026, 10, 6, 7, 5, 9), 'en-GB'), /06 Nov.*\d{2}:05:09/);
  assert.equal(formatLogTime(NaN), '—');
});

test('describeRepeat only speaks for merged rows', () => {
  assert.equal(describeRepeat({ count: 1, firstAt: 0 }), '');
  assert.match(describeRepeat({ count: 12, firstAt: Date.UTC(2026, 10, 6) }, 'en-GB'), /^×12 sejak 06 Nov/);
});

test('describeContext joins detail fields and client info', () => {
  assert.equal(describeContext({ detail: { tool: 'fly_to_location', seconds: 3 }, client: { browser: 'Chrome 141', version: '0.1.1' } }),
    'tool=fly_to_location · seconds=3 · Chrome 141 · v0.1.1');
  assert.equal(describeContext({}), '');
});

test('logQueryString drops empty filters', () => {
  assert.equal(logQueryString({ level: 'error', source: '', q: 'fly', offset: 0 }), '?level=error&q=fly');
  assert.equal(logQueryString({}), '');
});
