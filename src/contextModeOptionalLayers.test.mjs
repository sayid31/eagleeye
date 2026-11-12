// Owner decision 2026-11-11: Space Missions matches orbits from its own TLE
// feed, so Satellites is an optional layer beside it, not a dependency.
// Split from contextModePolicy.test.mjs to keep that file within its size budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextAllowedLayerIds, shouldExitContextForLayerChange } from './contextModePolicy.js';

test('Satellites is optional beside Space Missions: switching it off never ends the mission', () => {
  for (const origin of ['user', 'voice']) {
    assert.equal(shouldExitContextForLayerChange({
      contextMode: 'space-missions',
      globalContextEnabled: false,
      change: { type: 'visibility', layerId: 'satellites', enabled: false, origin },
    }), false, origin);
  }
  assert.equal(contextAllowedLayerIds('space-missions').has('satellites'), true, 'the user may still keep or add it');
});
