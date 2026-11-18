import test from 'node:test';
import assert from 'node:assert/strict';
import { backingSize, frameDelta, MAX_DPR, MAX_FRAME_SECONDS, shouldAnimate, SPIN_SPEED, START_LON, yawAt } from './hero-globe.runtime.js';

test('shouldAnimate runs only while on screen, tab visible and motion allowed', () => {
  assert.equal(shouldAnimate({ visible: true, tabHidden: false, reducedMotion: false }), true);
  assert.equal(shouldAnimate({ visible: false, tabHidden: false, reducedMotion: false }), false, 'off-screen');
  assert.equal(shouldAnimate({ visible: true, tabHidden: true, reducedMotion: false }), false, 'hidden tab');
  assert.equal(shouldAnimate({ visible: true, tabHidden: false, reducedMotion: true }), false, 'prefers-reduced-motion');
});

test('backingSize caps the pixel ratio at 2 and never goes below 1', () => {
  assert.deepEqual(backingSize(500, 3), { dpr: MAX_DPR, pixels: 1000 });
  assert.deepEqual(backingSize(500, 1.5), { dpr: 1.5, pixels: 750 });
  assert.deepEqual(backingSize(500, 0), { dpr: 1, pixels: 500 });
  assert.deepEqual(backingSize(500, undefined), { dpr: 1, pixels: 500 });
  assert.equal(backingSize(0, 2).pixels, 1);
});

test('yawAt starts on START_LON (it faces the viewer) and spins at SPIN_SPEED', () => {
  assert.ok(Math.abs(yawAt(0) + (START_LON * Math.PI) / 180) < 1e-12);
  assert.ok(Math.abs(yawAt(10) - yawAt(0) - 10 * SPIN_SPEED) < 1e-12);
  assert.ok((2 * Math.PI) / SPIN_SPEED > 100, 'one revolution takes longer than 100 s (slow, calm)');
});

test('frameDelta converts ms to s and clamps stalls and clock going backwards', () => {
  assert.ok(Math.abs(frameDelta(1000, 1016) - 0.016) < 1e-12);
  assert.equal(frameDelta(0, 60_000), MAX_FRAME_SECONDS);
  assert.equal(frameDelta(500, 400), 0);
});
