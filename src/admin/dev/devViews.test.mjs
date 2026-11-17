import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doctorLines, formatAgo, formatUptime, gateLabel, killFormError, killSwitchHeadline, providerTitle, usageRows } from './devViews.js';

const NOW = 1_800_000_000_000;

test('formatUptime', () => {
  assert.equal(formatUptime(45), '45 dtk');
  assert.equal(formatUptime(600), '10 mnt');
  assert.equal(formatUptime(3900), '1 j 05 mnt');
  assert.equal(formatUptime(190_000), '2 hari 4 j');
  assert.equal(formatUptime(-5), '0 dtk');
});

test('formatAgo', () => {
  assert.equal(formatAgo(NOW - 10_000, NOW), 'baru saja');
  assert.equal(formatAgo(NOW - 5 * 60_000, NOW), '5 menit lalu');
  assert.equal(formatAgo(NOW - 3 * 3_600_000, NOW), '3 jam lalu');
  assert.equal(formatAgo(NOW - 3 * 86_400_000, NOW), '3 hari lalu');
  assert.equal(formatAgo(null, NOW), '—');
});

test('doctorLines renders every check id in Indonesian; unknown ids fall back to the id', () => {
  const lines = doctorLines([
    { id: 'auth.exposure', level: 'warn', params: { via: 'host', passwordOnlyAdmins: 2 } },
    { id: 'auth.superAdminAccess', level: 'warn', params: { envEmails: 2, ready: 1, noAccount: 1, blocked: 0 } },
    { id: 'auth.secret', level: 'error', params: { problem: 'missing' } },
    { id: 'auth.future', level: 'warn', params: {} },
  ]);
  assert.match(lines[0].text, /HOST.*2 admin.*reverse proxy/);
  assert.match(lines[1].text, /^1 dari 2 email super admin bisa masuk; 1 belum punya akun/);
  assert.equal(lines[2].text, 'BETTER_AUTH_SECRET belum diisi.');
  assert.equal(lines[3].text, 'auth.future');
});

test('killSwitchHeadline + gateLabel', () => {
  assert.equal(killSwitchHeadline([{ gate: 'ai', killed: false }]), 'Semua gate aktif');
  assert.equal(killSwitchHeadline([{ gate: 'layers', killed: true }, { gate: 'ai', killed: true }, { gate: 'premium', killed: false }]), 'Dimatikan: Layer data, Voice & AI');
  assert.equal(gateLabel('premium'), 'Peta premium & search');
  assert.equal(gateLabel('x'), 'x');
});

test('killFormError: reason required (≥3) only when switching off', () => {
  assert.match(killFormError({ killed: true, reason: ' ab ' }), /minimal 3 karakter/);
  assert.equal(killFormError({ killed: true, reason: 'abc' }), null);
  assert.equal(killFormError({ killed: false, reason: '' }), null);
});

test('usageRows: empty states and per-provider rows', () => {
  assert.deepEqual(usageRows({ id: 'tomtom', configured: false, data: null }, NOW), { empty: 'Key belum diisi — provider ini tidak dipakai.' });
  assert.deepEqual(usageRows({ id: 'tomtom', configured: true, data: null }, NOW), { empty: 'Belum ada data sejak server mulai.' });
  const tomtom = usageRows({ id: 'tomtom', configured: true, data: { used: 800, budget: 1000, share: 0.8, date: '2026-11-17' } }, NOW);
  assert.equal(tomtom.rows[0].value, '800 dari 1.000 (80%)');
  const opensky = usageRows({ id: 'opensky', configured: true, data: { remaining: 3000, at: NOW - 60_000, warnAt: 400, ttlMs: 9000 } }, NOW);
  assert.deepEqual(opensky.rows.map((row) => row.value), ['3.000 · baru saja', '9 dtk', '400']);
  const openai = usageRows({ id: 'openai', configured: true, data: { enabled: true, todaySeconds: 600, dailyMinutes: 30, todayUsd: 0.5, periodUsd: 1.25, judgeEnabled: true, judgeCalls: 3, judgeMax: 300 } }, NOW);
  assert.deepEqual(openai.rows.map((row) => row.value), ['Aktif', '10 mnt dari 30 mnt', '~$0.50', '~$1.25', '3 dari 300']);
  assert.equal(providerTitle('openai'), 'OpenAI — voice');
});
