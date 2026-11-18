import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthReport } from '../../health/systemHealthCore.mjs';
import { describeOverall, healthView } from './healthView.js';
import { translateAgo, translateDetail, translateLabel } from './healthText.js';

const NOW = 1_800_000_000_000;
const facts = (patch = {}) => ({
  now: NOW,
  server: { appVersion: '1.0.0', nodeVersion: 'v24.1.0', startedAt: NOW - 7_200_000 },
  keys: [{ id: 'openai', title: 'OPENAI', set: true, managed: 'external' }, { id: 'tomtom', title: 'TOMTOM', set: true }, { id: 'opensky', title: 'OPENSKY', set: true }, { id: 'firms', title: 'NASA FIRMS', set: false }],
  auditTail: [{ event: 'keys.tested', provider: 'openai', result: 'ok', at: new Date(NOW - 300_000).toISOString() }, { event: 'keys.tested', provider: 'tomtom', result: 'rejected', at: new Date(NOW - 90_000_000).toISOString() }],
  ais: { status: 'live', lastMessageAt: NOW - 4000 },
  routes: [{ route: '/api/a', failing: true, lastStatus: 502, lastAt: NOW - 60_000, streak: 4 }, { route: '/api/b', failing: false, lastStatus: 200, lastAt: NOW - 20_000, streak: 0 }],
  quotas: { opensky: { remaining: 300, at: NOW - 240_000 }, openskyWarnAt: 400, tomtom: { date: '2026-11-18', used: 830, budget: 1000 } },
  voice: { enabled: true, dailyMinutes: 30, usedSeconds: 1260, judgeEnabled: true, judgeCalls: 37, judgeMax: 300 },
  logs: { server: { entries: 42, bytes: 128_000, maxBytes: 5_242_880, writeFailing: false, lastWriteAt: NOW - 12_000 }, auditEntries: 17 },
  ...patch,
});
const ENGLISH = /\b(ago|Started|Configured|Receiving|Failing|Last answer|left|used|rows|entries|calls today|never|Not configured|No |Turned off|Enabled|Writing|not tested|last test|in a row)\b/;

function details(report) {
  return healthView(report).sections.flatMap((section) => section.items.map((item) => `${item.label} | ${item.detail}`));
}

test('every detail the server can produce is said in Indonesian', () => {
  const variants = [
    facts(),
    facts({ keys: [{ id: 'openai', title: 'OPENAI', set: true }], auditTail: [], ais: { status: 'auth-failed' }, routes: [], quotas: { opensky: null, openskyWarnAt: 400, tomtom: null }, voice: { enabled: false, dailyMinutes: 0, usedSeconds: 120, judgeEnabled: false, judgeCalls: 0, judgeMax: 300 }, logs: { server: { entries: 0, bytes: 0, maxBytes: 5_242_880, writeFailing: true, lastWriteAt: null }, auditEntries: 0 } }),
    facts({ ais: { status: 'missing-key' } }),
    facts({ ais: { status: 'idle' } }),
    facts({ ais: { status: 'reconnecting', lastMessageAt: NOW - 90_000 } }),
    facts({ logs: { server: { entries: 0, bytes: 0, maxBytes: 5_242_880, writeFailing: false, lastWriteAt: null }, auditEntries: 1 } }),
  ];
  for (const variant of variants) {
    for (const line of details(buildHealthReport(variant))) assert.doesNotMatch(line, ENGLISH, line);
  }
});

test('specific translations keep the numbers and the structure', () => {
  const lines = details(buildHealthReport(facts())).join('\n');
  assert.match(lines, /Waktu aktif \| Mulai 2 jam lalu/);
  assert.match(lines, /OpenAI \| Terpasang \(diatur di luar aplikasi\) · uji terakhir berhasil 5 menit lalu/);
  assert.match(lines, /TomTom \| Terpasang \(di penyimpanan aplikasi\) · uji terakhir ditolak 25 jam lalu/);
  assert.match(lines, /NASA FIRMS \| Belum dikonfigurasi/);
  assert.match(lines, /Gagal: HTTP 502, 4 kali berturut-turut · 60 dtk lalu/);
  assert.match(lines, /Jawaban terakhir HTTP 200 · 20 dtk lalu/);
  assert.match(lines, /830 dari 1000 \(83%\) pada 2026-11-18 UTC/);
  assert.match(lines, /21 menit dari 30 menit \(70%\)/);
  assert.match(lines, /37 dari 300 panggilan hari ini/);
  assert.match(lines, /42 baris · 125 KB dari 5 MB · ditulis 12 dtk lalu/);
});

test('unknown details and labels pass through unchanged (better English than a wrong translation)', () => {
  assert.equal(translateDetail('Something new happened'), 'Something new happened');
  assert.equal(translateLabel({ id: 'service./api/x', label: '/api/x' }), '/api/x');
  assert.equal(translateLabel({ id: 'key.firms', label: 'NASA FIRMS' }), 'NASA FIRMS');
  assert.equal(translateAgo('5 h ago and never'), '5 jam lalu and belum pernah');
});

test('describeOverall counts problems and warnings in Indonesian', () => {
  const report = (statuses) => ({ sections: [{ items: statuses.map((status) => ({ status })) }] });
  assert.equal(describeOverall(report(['ok', 'off', 'unknown'])), 'Semua pengecekan baik');
  assert.equal(describeOverall(report(['error', 'error', 'warn'])), '2 masalah · 1 peringatan');
});
