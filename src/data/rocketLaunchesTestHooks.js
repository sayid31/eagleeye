// Moved out of rocketLaunches.js (rocketLaunchesTestHooks).

import { startMissionReplay, stopMissionReplay } from './rocketLaunches.js';
import { DEFAULT_OVERLAY_HOST } from './rocketLaunchesConstants.js';
import { setSelectedMission } from './rocketLaunchesFocus.js';
import { S } from './rocketLaunchesState.js';

/** Test seam for real layer lifecycle coverage with a recording host. */
export function _setRocketMissionOverlayHostForTest(host = null) {
  S._missionOverlayHost = host ? { ...DEFAULT_OVERLAY_HOST, ...host } : DEFAULT_OVERLAY_HOST;
}

/** Test seam that exercises the real selection/deselection path. */
export function _setSelectedRocketMissionForTest(launchId = null) {
  setSelectedMission(launchId, Boolean(launchId));
}

/**
 * Test seam for the mission-replay render-hold carve-out (perf wave 3).
 * Exercises the real startMissionReplay/stopMissionReplay functions — same
 * path the panel's REPLAY ASCENT/cancel buttons call — without needing a full
 * DOM-driven panel render just to reach them.
 * @param {string} launchId
 * @returns {boolean} Whatever startMissionReplay returns.
 */
export function _startMissionReplayForTest(launchId) {
  return startMissionReplay(launchId);
}

/** Test seam for the mission-replay render-hold carve-out (perf wave 3). */
export function _stopMissionReplayForTest() {
  stopMissionReplay();
}
