import test from 'node:test';
import assert from 'node:assert/strict';
import { S } from './rocketLaunchesState.js';
import { syncReplaySpeedControl } from './rocketLaunchesReplayControls.js';
import { REPLAY_SPEED_MIN, REPLAY_SPEED_MAX } from './rocketOrbitMath.js';

/** Panel stub exposing only the two nodes syncReplaySpeedControl reads. */
function stubPanel() {
  const input = { value: '', props: {}, style: { setProperty(k, v) { input.props[k] = v; } } };
  const output = { textContent: '' };
  return {
    input,
    output,
    querySelector(selector) {
      if (selector === '[data-mission-replay-speed]') return input;
      if (selector === '[data-mission-replay-speed-output]') return output;
      return null;
    },
  };
}

test('syncReplaySpeedControl maps the speed range onto a 0-100% slider progress', () => {
  const priorPanel = S._missionPanel;
  const priorSpeed = S._replaySpeed;
  try {
    const panel = stubPanel();
    S._missionPanel = panel;

    S._replaySpeed = REPLAY_SPEED_MIN;
    syncReplaySpeedControl();
    assert.equal(panel.input.props['--replay-speed-progress'], '0%');

    S._replaySpeed = REPLAY_SPEED_MAX;
    syncReplaySpeedControl();
    assert.equal(panel.input.props['--replay-speed-progress'], '100%');
    assert.equal(panel.output.textContent, `${REPLAY_SPEED_MAX}×`);
    assert.equal(panel.input.value, String(REPLAY_SPEED_MAX));
  } finally {
    S._missionPanel = priorPanel;
    S._replaySpeed = priorSpeed;
  }
});
