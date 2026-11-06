import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aisStreamKeyEvidence } from './aisLiveProxy.mjs';

test('aisStreamKeyEvidence reports idle and connects nothing before the vessel feed was ever used', () => {
  assert.deepEqual(aisStreamKeyEvidence(), { status: 'idle', lastMessageAt: null });
});
