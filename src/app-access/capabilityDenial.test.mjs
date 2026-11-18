import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITY_LABELS, denialToast, lockedResponseFor, readCapabilityDenial } from './capabilityDenial.js';
import { isHudSummaryUnconfigured } from '../hudSummaryResponse.js';

test('403 CAPABILITY_REQUIRED → revoked; 503 FEATURE_DISABLED → killed; the body gate wins', () => {
  assert.deepEqual(readCapabilityDenial(403, { error: 'CAPABILITY_REQUIRED', gate: 'layers' }, 'ai'), { gate: 'layers', kind: 'revoked' });
  assert.deepEqual(readCapabilityDenial(503, { error: 'FEATURE_DISABLED', gate: 'ai' }), { gate: 'ai', kind: 'killed' });
  assert.deepEqual(readCapabilityDenial(403, { error: 'CAPABILITY_REQUIRED' }, 'premium'), { gate: 'premium', kind: 'revoked' }, 'route gate when the body names none');
});

test('other refusals are not capability locks', () => {
  assert.equal(readCapabilityDenial(403, { error: 'ORIGIN_NOT_ALLOWED' }, 'layers'), null);
  assert.equal(readCapabilityDenial(403, { error: 'ADMIN_REQUIRED' }, 'layers'), null);
  assert.equal(readCapabilityDenial(503, { error: 'AUTH_UNAVAILABLE' }, 'layers'), null);
  assert.equal(readCapabilityDenial(503, { error: 'CAPABILITY_REQUIRED', gate: 'layers' }), null, 'code and status must match');
  assert.equal(readCapabilityDenial(403, { error: 'CAPABILITY_REQUIRED', gate: 'admin' }), null, 'only the three toggles');
  assert.equal(readCapabilityDenial(403, null, 'layers'), null);
  assert.equal(readCapabilityDenial(403, 'CAPABILITY_REQUIRED', 'layers'), null);
});

test('toasts name the feature and why', () => {
  assert.equal(denialToast({ gate: 'layers', kind: 'revoked' }), `${CAPABILITY_LABELS.layers} tidak lagi diizinkan admin — dinonaktifkan di halaman ini.`);
  assert.match(denialToast({ gate: 'ai', kind: 'killed' }), /^Voice & AI sedang dimatikan developer/);
});

test('locked responses: HUD summary gets the quiet "not configured" shape, others the server refusal', () => {
  const hud = lockedResponseFor('/api/openai/hud-summary', 'ai', 'plan');
  assert.equal(isHudSummaryUnconfigured(hud.status, hud.body), true);
  assert.deepEqual(lockedResponseFor('/api/opensky', 'layers', 'plan'), { status: 403, body: { error: 'CAPABILITY_REQUIRED', message: 'Not yet allowed by an admin', gate: 'layers' } });
  assert.deepEqual(lockedResponseFor('/api/google/geocode', 'premium', 'killed').status, 503);
  const roundTrip = lockedResponseFor('/api/live/session', 'ai', 'revoked');
  assert.deepEqual(readCapabilityDenial(roundTrip.status, roundTrip.body), { gate: 'ai', kind: 'revoked' });
});
