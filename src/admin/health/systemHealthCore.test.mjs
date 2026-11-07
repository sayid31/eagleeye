import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ago, buildHealthReport, lastKeyTests, overallStatus } from './systemHealthCore.mjs';

const NOW = Date.UTC(2026, 10, 7, 10);
const baseFacts = (over = {}) => ({
  now: NOW,
  server: { appVersion: '0.1.1', nodeVersion: 'v24.14.0', startedAt: NOW - 3600_000 },
  keys: [
    { id: 'openai', title: 'OPENAI', set: true, managed: 'file' },
    { id: 'google-maps', title: 'GOOGLE MAPS', set: false, managed: null },
    { id: 'tomtom', title: 'TOMTOM', set: true, managed: 'external' },
  ],
  auditTail: [
    { at: new Date(NOW - 120_000).toISOString(), event: 'keys.tested', provider: 'openai', result: 'ok' },
    { at: new Date(NOW - 999_000).toISOString(), event: 'keys.tested', provider: 'openai', result: 'rejected' },
  ],
  ais: { status: 'live', lastMessageAt: NOW - 5000 },
  routes: [{ route: '/api/tomtom', lastStatus: 200, lastAt: NOW - 1000, streak: 0, failing: false }],
  quotas: { opensky: { remaining: 3000, at: NOW - 60_000 }, openskyWarnAt: 400, tomtom: { date: '2026-11-07', used: 100, budget: 40000 } },
  voice: { enabled: true, dailyMinutes: 0, usedSeconds: 300, judgeEnabled: true, judgeCalls: 3, judgeMax: 300 },
  logs: { server: { entries: 12, bytes: 4096, maxBytes: 5 * 1048576, writeFailing: false, lastWriteAt: NOW - 1000 }, auditEntries: 40 },
  ...over,
});
const find = (report, id) => report.sections.flatMap((s) => s.items).find((i) => i.id === id);

test('ago renders seconds, minutes, hours and days', () => {
  assert.equal(ago(NOW - 30_000, NOW), '30 s ago');
  assert.equal(ago(NOW - 600_000, NOW), '10 min ago');
  assert.equal(ago(NOW - 7_200_000, NOW), '2 h ago');
  assert.equal(ago(NOW - 3 * 86_400_000, NOW), '3 d ago');
  assert.equal(ago(null, NOW), 'never');
});

test('lastKeyTests keeps the newest test per provider', () => {
  assert.equal(lastKeyTests(baseFacts().auditTail).openai.result, 'ok');
});

test('a healthy server reports ok with every section present', () => {
  const report = buildHealthReport(baseFacts());
  assert.equal(report.status, 'ok');
  assert.deepEqual(report.sections.map((s) => s.id), ['server', 'keys', 'feeds', 'services', 'quotas', 'voice', 'logs']);
  assert.equal(find(report, 'key.openai').status, 'ok');
  assert.match(find(report, 'key.openai').detail, /last test ok 2 min ago/);
  assert.equal(find(report, 'key.google-maps').status, 'off');
  assert.equal(find(report, 'key.tomtom').status, 'unknown');
  assert.match(find(report, 'key.tomtom').detail, /\(set outside this app\) · not tested yet/);
  assert.equal(find(report, 'feed.ais').status, 'ok');
});

test('failures surface with the right level and drive the overall status', () => {
  const report = buildHealthReport(baseFacts({
    auditTail: [{ at: new Date(NOW).toISOString(), event: 'keys.tested', provider: 'openai', result: 'rejected' }],
    ais: { status: 'auth-failed' },
    routes: [{ route: '/api/overpass', lastStatus: 502, lastAt: NOW, streak: 4, failing: true }],
    quotas: { opensky: { remaining: 100, at: NOW }, openskyWarnAt: 400, tomtom: { date: '2026-11-07', used: 36000, budget: 40000 } },
    voice: { enabled: true, dailyMinutes: 10, usedSeconds: 600, judgeEnabled: true, judgeCalls: 300, judgeMax: 300 },
    logs: { server: { entries: 1, bytes: null, maxBytes: 1, writeFailing: true, lastWriteAt: null }, auditEntries: 0 },
  }));
  assert.equal(report.status, 'error');
  assert.equal(find(report, 'key.openai').status, 'error');
  assert.equal(find(report, 'feed.ais').status, 'error');
  assert.match(find(report, 'service./api/overpass').detail, /Failing: HTTP 502 4× in a row/);
  assert.equal(find(report, 'quota.opensky').status, 'warn');
  assert.equal(find(report, 'quota.tomtom').status, 'warn');
  assert.equal(find(report, 'voice.minutes').status, 'error');
  assert.equal(find(report, 'voice.judge').status, 'warn');
  assert.equal(find(report, 'log.server').status, 'error');
});

test('no evidence yet is unknown or off, never an error', () => {
  const report = buildHealthReport(baseFacts({ ais: null, routes: [], quotas: { opensky: null, openskyWarnAt: 400, tomtom: null }, voice: { enabled: false, dailyMinutes: 0, usedSeconds: 0, judgeEnabled: false, judgeCalls: 0, judgeMax: 300 } }));
  assert.equal(report.status, 'ok');
  assert.equal(find(report, 'feed.ais').status, 'off');
  assert.equal(find(report, 'service.none').status, 'unknown');
  assert.equal(find(report, 'quota.tomtom').status, 'unknown');
  assert.equal(find(report, 'voice.judge').status, 'off');
});

test('overallStatus ignores off and unknown', () => {
  assert.equal(overallStatus([{ items: [{ status: 'off' }, { status: 'unknown' }] }]), 'ok');
  assert.equal(overallStatus([{ items: [{ status: 'ok' }, { status: 'warn' }] }]), 'warn');
});
