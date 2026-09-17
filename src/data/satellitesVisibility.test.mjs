import assert from 'node:assert/strict';
import test from 'node:test';
import { satelliteVisualsVisible, satellitesNeedContinuousRender } from './satellites.js';

test('restoring Satellite presentation preferences cannot show a disabled layer', () => {
  assert.equal(satelliteVisualsVisible(false, true), false);
  assert.equal(satelliteVisualsVisible(false, false), false);
});

test('enabled Satellite layers honor their point and orbit presentation preferences', () => {
  assert.equal(satelliteVisualsVisible(true, true), true);
  assert.equal(satelliteVisualsVisible(true, false), false);
});

// Orbital motion never stops (unlike a parked traffic dot or an AIS billboard
// between polls) — the gate is "is anything moving ON SCREEN", not "is
// anything moving" (always true). anyPointOnScreen defaults true (fail
// toward continuous) until the horizon+frustum scan piggybacked on
// _propagateAll() completes its first pass.
test('satellitesNeedContinuousRender mirrors showPoints AND the on-screen scan', () => {
  assert.equal(
    satellitesNeedContinuousRender({ showPoints: false, anyPointOnScreen: true }),
    false,
    'hidden points need no repaint no matter what is orbiting overhead',
  );
  assert.equal(
    satellitesNeedContinuousRender({ showPoints: true, anyPointOnScreen: false }),
    false,
    'nothing on screen to animate — safe to go idle',
  );
  assert.equal(
    satellitesNeedContinuousRender({ showPoints: true, anyPointOnScreen: true }),
    true,
  );
  assert.equal(
    satellitesNeedContinuousRender({ showPoints: false, anyPointOnScreen: false }),
    false,
  );
});
