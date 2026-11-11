// Moved out of rocketLaunches.js (rocketLaunchesUpdate).

import { stopMissionReplay } from './rocketLaunches.js';
import { ACTIVE_TLE_FIRST_BUILD_WAIT_MS, API_URL, POST_TLE_RETRY_DELAY_MS } from './rocketLaunchesConstants.js';
import { addLaunchEntity } from './rocketLaunchesEntity.js';
import { focusMission, setSelectedMission } from './rocketLaunchesFocus.js';
import { normalizeRocketLaunches } from './rocketLaunchesNormalize.js';
import { removeMissionOrbitPrimitives } from './rocketLaunchesOrbit.js';
import { renderMissionPanel, renderMissionRoster } from './rocketLaunchesPanel.js';
import { shouldRetryAfterActiveTle } from './rocketLaunchesPolicy.js';
import { S, _missionOverlayRecords, _replayTracks, _satelliteTelemetry } from './rocketLaunchesState.js';

/**
 * Wait for `promise` to settle, but no longer than `ms`. Never rejects.
 * @param {Promise<unknown>} promise
 * @param {number} ms
 * @returns {Promise<boolean>} true when it settled in time.
 */
export function settleWithin(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms); });
  const settled = Promise.resolve(promise).then(() => true, () => true);
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
}

export function clearPostTleRetry() {
  if (S._retryTimer) clearTimeout(S._retryTimer);
  S._retryTimer = null;
}

function schedulePostTleRetry(token) {
  if (S._retryTimer || token !== S._lifecycleToken || !shouldRetryAfterActiveTle({
    enabled: S._enabled,
    retryCount: S._postTleRetryCount,
    activeTleText: S._activeTleText,
    renderedTleText: S._renderedTleText,
  })) return;
  S._postTleRetryCount++;
  S._retryTimer = setTimeout(() => {
    S._retryTimer = null;
    if (S._enabled && token === S._lifecycleToken) requestMissionUpdate();
  }, POST_TLE_RETRY_DELAY_MS);
}

function ensureActiveTleLookup(token) {
  if (S._activeTleText) return Promise.resolve(S._activeTleText);
  if (S._activeTlePromise && S._activeTlePromiseToken === token) return S._activeTlePromise;
  const request = fetch('/api/celestrak/active')
    .then((activeResponse) => {
      if (!activeResponse.ok) throw new Error(`HTTP ${activeResponse.status}`);
      return activeResponse.text();
    })
    .then((text) => {
      if (!S._enabled || token !== S._lifecycleToken) return null;
      S._activeTleText = text;
      S._focusAfterActiveLookup = Boolean(S._selectedLaunchId);
      schedulePostTleRetry(token);
      return text;
    })
    .catch((error) => {
      if (S._enabled && token === S._lifecycleToken) {
        console.warn('[Data:RocketLaunches] Active satellite lookup unavailable:', error.message);
      }
      return null;
    })
    .finally(() => {
      if (S._activeTlePromise === request) {
        S._activeTlePromise = null;
        S._activeTlePromiseToken = 0;
      }
    });
  S._activeTlePromise = request;
  S._activeTlePromiseToken = token;
  return request;
}

async function performMissionUpdate(token) {
  try {
    const activeLookup = ensureActiveTleLookup(token);
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const launches = normalizeRocketLaunches(await response.json());
    // Orbit matches come from the active TLE feed (the Satellite layer's
    // catalog only when the user has it on), so give a cached feed a moment
    // to land in this build; a slower one is picked up by the post-TLE retry.
    if (!S._activeTleText) await settleWithin(activeLookup, ACTIVE_TLE_FIRST_BUILD_WAIT_MS);
    if (!S._enabled || token !== S._lifecycleToken || !S._dataSource) return;
    const activeTleText = S._activeTleText;
    if (S._replayCameraLaunchId) stopMissionReplay();
    S._launches = launches;
    removeMissionOrbitPrimitives();
    S._dataSource.entities.removeAll();
    _missionOverlayRecords.clear();
    _satelliteTelemetry.clear();
    _replayTracks.clear();
    S._orbitMatches = 0;
    launches.forEach((launch) => addLaunchEntity(launch, activeTleText));
    S._renderedTleText = activeTleText;
    if (S._renderedTleText === S._activeTleText) clearPostTleRetry();
    S._count = launches.length;
    renderMissionRoster();
    if (!S._selectedLaunchId || !launches.some((launch) => launch.id === S._selectedLaunchId)) {
      setSelectedMission(null, false);
    } else {
      setSelectedMission(S._selectedLaunchId, true);
      if (S._focusAfterActiveLookup) {
        focusMission(launches.find((launch) => launch.id === S._selectedLaunchId));
      }
    }
    S._focusAfterActiveLookup = false;
    renderMissionPanel();
    S._lastUpdate = Date.now();
    S._lastError = null;
  } catch (error) {
    if (S._enabled && token === S._lifecycleToken) {
      S._lastError = error.message;
      console.warn('[Data:RocketLaunches] Fetch error:', error);
    }
  }
}

function requestMissionUpdate() {
  if (!S._enabled) return Promise.resolve();
  const token = S._lifecycleToken;
  S._updateDirty = true;
  if (S._updatePromise && S._updatePromiseToken === token) return S._updatePromise;
  let request;
  request = (async () => {
    while (S._enabled && token === S._lifecycleToken && S._updateDirty) {
      S._updateDirty = false;
      await performMissionUpdate(token);
    }
  })().finally(() => {
    if (S._updatePromise === request) {
      S._updatePromise = null;
      S._updatePromiseToken = 0;
    }
  });
  S._updatePromise = request;
  S._updatePromiseToken = token;
  return request;
}

export function updateRocketLaunchesLayer() {
    return requestMissionUpdate();
  }
