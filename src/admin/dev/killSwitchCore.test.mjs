import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PASSWORD_INPUT_LENGTH, killSwitchAuditSummary, parseKillSwitchUpdate } from './killSwitchCore.mjs';
import { MAX_KILL_REASON_LENGTH } from '../../auth/killSwitchStore.mjs';

test('parseKillSwitchUpdate accepts a killable gate, a boolean and a trimmed reason', () => {
  assert.deepEqual(parseKillSwitchUpdate({ gate: 'ai', killed: true, reason: ' biaya ', currentPassword: 'pw' }),
    { ok: true, value: { gate: 'ai', killed: true, reason: 'biaya', currentPassword: 'pw' } });
  assert.deepEqual(parseKillSwitchUpdate({ gate: 'layers', killed: false }),
    { ok: true, value: { gate: 'layers', killed: false, reason: '', currentPassword: '' } }, 'turning back on needs no reason');
});

test('parseKillSwitchUpdate names the offending field', () => {
  const field = (body) => parseKillSwitchUpdate(body).field;
  assert.equal(field(null), 'body');
  assert.equal(field([]), 'body');
  assert.equal(field({ gate: 'open', killed: true, reason: 'abc' }), 'gate');
  assert.equal(field({ gate: 'super', killed: true, reason: 'abc' }), 'gate');
  assert.equal(field({ gate: 'ai', killed: 1, reason: 'abc' }), 'killed');
  assert.equal(field({ gate: 'ai', killed: true, reason: 'ab' }), 'reason', 'killing needs ≥3 characters');
  assert.equal(field({ gate: 'ai', killed: true, reason: 42 }), 'reason');
  assert.equal(field({ gate: 'ai', killed: false, reason: 'x'.repeat(MAX_KILL_REASON_LENGTH + 1) }), 'reason');
  assert.equal(field({ gate: 'ai', killed: true, reason: 'abc', currentPassword: 'p'.repeat(MAX_PASSWORD_INPUT_LENGTH + 1) }), 'currentPassword');
  assert.equal(field({ gate: 'ai', killed: true, reason: 'abc', currentPassword: 7 }), 'currentPassword');
});

test('killSwitchAuditSummary', () => {
  assert.equal(killSwitchAuditSummary({ gate: 'ai', killed: true, reason: 'biaya' }), 'ai off: biaya');
  assert.equal(killSwitchAuditSummary({ gate: 'ai', killed: false, reason: '' }), 'ai on');
});
