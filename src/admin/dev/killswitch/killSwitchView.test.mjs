import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialogConfig, gateLabel, gateRow, gateTally, savedToast, updateBody } from './killSwitchView.js';

const NOW = 1_800_000_000_000;

test('gateRow: a never-changed gate is "Menyala" with no reason', () => {
  const row = gateRow({ gate: 'layers', killed: false, reason: null, updatedAt: null, updatedBy: null }, NOW);
  assert.deepEqual([row.status, row.statusLabel, row.lastChange, row.reason, row.absolute], ['ok', 'Menyala', 'Belum pernah diubah.', null, null]);
  assert.equal(row.switchLabel, 'Layer data: menyala untuk semua akun');
});

test('gateRow: a switched-off gate says who, when and why', () => {
  const row = gateRow({ gate: 'ai', killed: true, reason: 'Biaya melonjak', updatedAt: NOW - 3 * 3_600_000, updatedBy: { id: 'u1', emailMasked: 'd***@x.test' } }, NOW);
  assert.equal(row.killed, true);
  assert.equal(row.statusLabel, 'Dimatikan');
  assert.equal(row.lastChange, 'Diubah 3 jam lalu oleh d***@x.test.');
  assert.equal(row.reason, 'Alasan: Biaya melonjak');
  assert.ok(row.absolute);
  assert.match(gateRow({ gate: 'ai', killed: true, reason: null, updatedAt: NOW, updatedBy: null }, NOW).lastChange, /akun yang tidak dikenal/);
});

test('gateTally + gateLabel', () => {
  assert.deepEqual(gateTally([{ gate: 'layers', killed: false }, { gate: 'ai', killed: true }]), { total: 2, on: 1, off: ['Voice & AI'] });
  assert.equal(gateLabel('premium'), 'Peta premium & pencarian');
  assert.equal(gateLabel('x'), 'x');
});

test('dialogConfig: switching off is destructive and needs a reason of ≥3 characters; switching on does not', () => {
  const off = dialogConfig({ gate: 'ai', killed: true });
  assert.equal(off.destructive, true);
  assert.deepEqual([off.reason.required, off.reason.minLength], [true, 3]);
  assert.match(off.impact, /semua orang termasuk Anda/);
  assert.match(off.title, /Matikan Voice & AI untuk semua akun/);
  const on = dialogConfig({ gate: 'ai', killed: false });
  assert.equal(on.destructive, false);
  assert.equal(on.reason.required, false);
  assert.equal(on.password.required, false, 'a Google-only super admin may leave the password empty');
  assert.match(on.actionLabel, /Nyalakan/);
});

test('updateBody trims the reason and always sends a password string; savedToast warns when the audit failed', () => {
  assert.deepEqual(updateBody({ gate: 'ai', killed: true }, { reason: '  boros  ', password: 'pw' }), { gate: 'ai', killed: true, reason: 'boros', currentPassword: 'pw' });
  assert.equal(updateBody({ gate: 'ai', killed: false }, {}).currentPassword, '');
  assert.deepEqual(savedToast({ switch: { gate: 'ai', killed: true }, audit: 'written' }), { kind: 'success', text: 'Voice & AI dimatikan untuk semua akun.' });
  assert.deepEqual(savedToast({ switch: { gate: 'ai', killed: false }, audit: 'written' }), { kind: 'success', text: 'Voice & AI menyala kembali.' });
  assert.equal(savedToast({ switch: { gate: 'ai', killed: true }, audit: 'failed' }).kind, 'warning');
});
