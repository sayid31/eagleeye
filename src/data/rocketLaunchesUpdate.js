// Moved out of rocketLaunches.js (rocketLaunchesUpdate).

import { stopMissionReplay } from './rocketLaunches.js';
import { API_URL, POST_TLE_RETRY_DELAY_MS } from './rocketLaunchesConstants.js';
import { addLaunchEntity } from './rocketLaunchesEntity.js';
import { focusMission, setSelectedMission } from './rocketLaunchesFocus.js';
import { normalizeRocketLaunches } from './rocketLaunchesNormalize.js';
import { removeMissionOrbitPrimitives } from './rocketLaunchesOrbit.js';
import { renderMissionPanel, renderMissionRoster } from './rocketLaunchesPanel.js';
import { satelliteParamsAfterSpaceMissions, satelliteParamsForSpaceMissions, shouldRetryAfterActiveTle } from './rocketLaunchesPolicy.js';
import { S, _missionOverlayRecords, _replayTracks, _satelliteTelemetry } from './rocketLaunchesState.js';

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

export async function captureSatelliteDependency() {
  if (!S._dataManager || S._satelliteStateBeforeMission) return;
  S._satelliteStateBeforeMission = {
    // Effective visibility: a user enable still mid-activation is intent ON —
    // capturing settled false would restore the user's enable away on exit.
    enabled: S._dataManager.isEffectivelyEnabled?.('satellites')
      ?? S._dataManager.isEnabled('satellites'),
    params: satelliteParamsAfterSpaceMissions(
      S._dataManager.getLayerParams('satellites'),
    ),
  };
  S._dataManager.setLayerParams(
    'satellites',
    satelliteParamsForSpaceMissions(S._satelliteStateBeforeMission.params),
  );
  const token = S._lifecycleToken;
  const activation = Promise.resolve(S._dataManager.setEnabled('satellites', true));
  S._satelliteActivationPromise = activation;
  try {
    const activated = await activation;
    // Space Missions without its satellite dependency is a broken replay
    // surface; fail the mission enable so the manager's fail-closed path and
    // the Context rollback see an honest failure instead of a silent success.
    if (
      token === S._lifecycleToken
      && S._enabled
      && (activated === false || !S._dataManager.isEnabled('satellites'))
    ) {
      throw new Error('Space Missions requires the satellites layer, which failed to start');
    }
  } finally {
    if (token === S._lifecycleToken && S._satelliteActivationPromise === activation) {
      S._satelliteActivationPromise = null;
    }
  }
}

export async function restoreSatelliteDependency() {
  const snapshot = S._satelliteStateBeforeMission;
  if (!snapshot || !S._dataManager) return;
  S._satelliteStateBeforeMission = null;
  S._satelliteActivationPromise = null;
  S._dataManager.setLayerParams(
    'satellites',
    satelliteParamsAfterSpaceMissions(snapshot.params),
  );
  const restored = await S._dataManager.setEnabled('satellites', snapshot.enabled);
  if (
    restored === false
    || S._dataManager.isEnabled('satellites') !== snapshot.enabled
  ) {
    throw new Error('Space Missions could not restore the satellites layer');
  }
}

async function performMissionUpdate(token) {
  try {
    ensureActiveTleLookup(token);
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const launches = normalizeRocketLaunches(await response.json());
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
