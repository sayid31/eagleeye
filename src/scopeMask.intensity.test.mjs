// Scope mask intensity dial — a plain [0,1] multiplier on the painted outside
// alpha, independent of the terminus/override band in scopeMask.js (that band
// stays 94..100 by design; see scopeMask.test.mjs). Split into its own file
// because scopeMask.test.mjs is already over the 400-line test budget (Rule 8).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setScopeMaskOpacity,
  getScopeMaskOpacity,
  resolvePaintedAlpha,
  _resetScopeMaskForTest,
} from './scopeMask.js';

beforeEach(() => _resetScopeMaskForTest());

test('the intensity dial defaults to 1 (today\'s shipped look, unchanged)', () => {
  assert.equal(getScopeMaskOpacity(), 1);
});

test('setScopeMaskOpacity clamps into [0,1]', () => {
  setScopeMaskOpacity(0.5);
  assert.equal(getScopeMaskOpacity(), 0.5);

  setScopeMaskOpacity(-3);
  assert.equal(getScopeMaskOpacity(), 0, 'a negative scale floors to 0, not NaN');

  setScopeMaskOpacity(9);
  assert.equal(getScopeMaskOpacity(), 1, 'a scale above 1 ceilings to 1');

  setScopeMaskOpacity(Number.NaN);
  assert.equal(getScopeMaskOpacity(), 0, 'a non-numeric scale is treated as 0, not left stale');
});

test('resolvePaintedAlpha multiplies the terminus alpha by the intensity scale', () => {
  assert.equal(resolvePaintedAlpha(0.94, 1), 0.94, '100% intensity leaves the terminus unchanged');
  assert.equal(resolvePaintedAlpha(0.94, 0), 0, '0% intensity paints nothing extra');
  assert.equal(resolvePaintedAlpha(1, 0.5), 0.5);
  assert.equal(resolvePaintedAlpha(0.8, 0.25), 0.2);
});

test('resolvePaintedAlpha clamps out-of-range inputs instead of propagating them', () => {
  assert.equal(resolvePaintedAlpha(2, 1), 1, 'a terminus alpha above 1 is clamped before multiplying');
  assert.equal(resolvePaintedAlpha(-1, 1), 0, 'a negative terminus alpha floors to 0');
  assert.equal(resolvePaintedAlpha(0.9, 2), 0.9, 'a scale above 1 is clamped before multiplying');
  assert.equal(resolvePaintedAlpha(0.9, -1), 0, 'a negative scale floors to 0');
  assert.equal(resolvePaintedAlpha(Number.NaN, 1), 0, 'non-numeric inputs resolve to 0, not NaN');
});
