import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStall } from './cctvHlsStall.js';
import { HLS_CONNECT_TIMEOUT_MS, HLS_STALL_RESTART_MS } from './cctvConstants.js';

const base = { state: 'live', idle: false, now: 100_000, connectStartedAt: 0, lastProgressAt: 100_000, playhead: 5, lastPlayhead: 5 };

test('connecting past the timeout asks for a no-data rebuild', () => {
  const v = evaluateStall({ ...base, state: 'connecting', now: HLS_CONNECT_TIMEOUT_MS, connectStartedAt: 0 });
  assert.equal(v.action, 'rebuild-no-data');
});

test('connecting just inside the timeout does nothing', () => {
  const v = evaluateStall({ ...base, state: 'recovering', now: HLS_CONNECT_TIMEOUT_MS - 1, connectStartedAt: 0 });
  assert.equal(v.action, null);
  assert.equal(v.connectStartedAt, 0);
});

test('an idle (inactive or hidden) connecting feed restarts its connect clock instead of timing out', () => {
  const v = evaluateStall({ ...base, state: 'connecting', idle: true, now: HLS_CONNECT_TIMEOUT_MS * 5, connectStartedAt: 0 });
  assert.equal(v.action, null);
  assert.equal(v.connectStartedAt, HLS_CONNECT_TIMEOUT_MS * 5);
});

test('a live feed whose playhead moved records progress', () => {
  const v = evaluateStall({ ...base, playhead: 6, lastPlayhead: 5, lastProgressAt: 1 });
  assert.equal(v.action, null);
  assert.equal(v.lastPlayhead, 6);
  assert.equal(v.lastProgressAt, base.now);
});

test('a frozen playhead recovers only after the restart window', () => {
  const early = evaluateStall({ ...base, lastProgressAt: base.now - HLS_STALL_RESTART_MS + 1 });
  assert.equal(early.action, null);
  const late = evaluateStall({ ...base, lastProgressAt: base.now - HLS_STALL_RESTART_MS });
  assert.equal(late.action, 'recover');
});

test('an idle live feed never counts as stalled', () => {
  const v = evaluateStall({ ...base, idle: true, lastProgressAt: 0 });
  assert.equal(v.action, null);
  assert.equal(v.lastProgressAt, base.now);
});

test('chooseRecovery spends each budget separately and then gives up', async () => {
  const { chooseRecovery } = await import('./cctvHlsStall.js');
  const { HLS_MAX_MEDIA_ERROR_RECOVERIES: M, HLS_MAX_NETWORK_ERROR_RECOVERIES: N } = await import('./cctvConstants.js');
  const types = { MEDIA_ERROR: 'media', NETWORK_ERROR: 'network' };
  assert.equal(chooseRecovery('media', { mediaRecoveries: 0, networkRecoveries: N }, types), 'media');
  assert.equal(chooseRecovery('media', { mediaRecoveries: M, networkRecoveries: 0 }, types), null);
  assert.equal(chooseRecovery('network', { mediaRecoveries: M, networkRecoveries: N - 1 }, types), 'network');
  assert.equal(chooseRecovery('network', { mediaRecoveries: 0, networkRecoveries: N }, types), null);
  assert.equal(chooseRecovery('other', { mediaRecoveries: 0, networkRecoveries: 0 }, types), null);
});
