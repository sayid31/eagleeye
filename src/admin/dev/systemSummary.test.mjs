import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECENT_ERROR_WINDOW_HOURS, buildSystemSummary, countRecentErrors, runtimeOf } from './systemSummary.mjs';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

test('countRecentErrors: error rows inside the window only', () => {
  const entries = [
    { level: 'error', lastAt: NOW - HOUR }, { level: 'error', lastAt: NOW - RECENT_ERROR_WINDOW_HOURS * HOUR },
    { level: 'error', lastAt: NOW - (RECENT_ERROR_WINDOW_HOURS + 1) * HOUR }, { level: 'warn', lastAt: NOW },
  ];
  assert.equal(countRecentErrors(entries, NOW), 2);
  assert.equal(countRecentErrors(entries, NOW, 2), 1);
  assert.equal(countRecentErrors([], NOW), 0);
});

test('runtimeOf: Bun when present, else Node', () => {
  assert.deepEqual(runtimeOf({ versions: { node: '24.14.0' } }), { name: 'Node', version: '24.14.0' });
  assert.deepEqual(runtimeOf({ versions: { node: '24.3.0', bun: '1.3.2' } }), { name: 'Bun', version: '1.3.2' });
});

test('buildSystemSummary: app, auth, key presence, kill switches, log errors, doctor warnings only', () => {
  const summary = buildSystemSummary({
    now: NOW,
    appVersion: '3.1.0',
    runtime: { name: 'Node', version: '24.14.0' },
    startedAt: NOW - 90_000,
    auth: { configured: true, googleSignIn: false },
    keys: [{ id: 'openai', title: 'OPENAI', set: true, managed: 'file', envVars: ['OPENAI_API_KEY'] }, { id: 'tomtom', title: 'TOMTOM', set: false }],
    killSwitches: [{ gate: 'ai', killed: true, reason: 'biaya', updatedAt: NOW - 10, updatedBy: { id: 'u1', emailMasked: 'o***@x.test' } }],
    logEntries: [{ level: 'error', lastAt: NOW - 1000 }],
    readiness: [{ id: 'auth.secret', level: 'ok', params: {} }, { id: 'auth.exposure', level: 'warn', params: { exposed: true } }],
  });
  assert.deepEqual(summary.app, { version: '3.1.0', runtime: { name: 'Node', version: '24.14.0' }, startedAt: NOW - 90_000, uptimeSeconds: 90 });
  assert.deepEqual(summary.auth, { configured: true, googleSignIn: false });
  assert.deepEqual(summary.keys, [{ id: 'openai', title: 'OPENAI', set: true }, { id: 'tomtom', title: 'TOMTOM', set: false }], 'presence only, no env names or sources');
  assert.deepEqual(summary.killSwitches, [{ gate: 'ai', killed: true, reason: 'biaya', updatedAt: NOW - 10 }]);
  assert.deepEqual(summary.serverLog, { recentErrors: 1, windowHours: RECENT_ERROR_WINDOW_HOURS });
  assert.deepEqual(summary.doctor, [{ id: 'auth.exposure', level: 'warn', params: { exposed: true } }]);
});
