// Moved out of militaryAwareness.js (militaryAwarenessNavigation).

import flightsLayer from './flights.js';
import militaryFlightsLayer from './militaryFlights.js';
import { aircraftClassMatchesFilter, canNavigateAwarenessNext, contextTargetFlyToAllowed, findCompatibleHistoryIndex, isFlightLayer } from './militaryAwarenessPredicates.js';
import { announceNavigationAuthority } from '../navigationPolicy.js';
import militaryInstallationsLayer from './militaryInstallations.js';
import aisLiveVesselsLayer from './aisLiveVessels.js';
import * as Cesium from 'cesium';
import { AWARENESS_MAX_FLIGHT_SEARCH_RADIUS_M, AWARENESS_RADIUS_M, AWARENESS_RELATIONSHIP, findByDoublingRadius, getAwarenessNavigationTargets } from './militaryAwarenessEngine.js';
import { VESSEL_FOCUS_RADIUS_M, state } from './militaryAwarenessConstants.js';
import { releaseAircraftTracking } from './militaryAwarenessDependencies.js';
import { selectSubject } from './militaryAwarenessSubject.js';

/** Focus a nearby example through the source layer that owns its selection. */
function focusNearbyTarget(layerId, id, { origin = 'programmatic' } = {}) {
  if (!layerId || !id) return false;
  if (layerId === 'flights') {
    return flightsLayer.refocusTrackedById?.(id, { origin }) || flightsLayer.trackById(id, { origin });
  }
  if (layerId === 'military') {
    return militaryFlightsLayer.refocusTrackedById?.(id, { origin }) || militaryFlightsLayer.trackById(id, { origin });
  }
  if (layerId === 'military-installations') {
    if (!contextTargetFlyToAllowed(layerId)) return selectKnownContextTarget(layerId, id);
    // focusById flies the camera; it never assigns a tracked entity, so the
    // stamp has to be announced here.
    announceNavigationAuthority('context-installation-focus');
    return militaryInstallationsLayer.focusById(id);
  }
  if (layerId !== 'ais-live-vessels' || !aisLiveVesselsLayer.selectById(id)) return false;

  const vessel = aisLiveVesselsLayer.getAllPositions(12000).find((item) => String(item.id) === String(id));
  if (!contextTargetFlyToAllowed(layerId) || !vessel?.position || !state.viewer) return true;
  announceNavigationAuthority('context-vessel-focus');
  state.viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(vessel.position, VESSEL_FOCUS_RADIUS_M),
    { duration: 1.4 },
  );
  return true;
}

export function subjectKey(subject) {
  return subject ? `${subject.layerId}:${subject.id}` : '';
}

function normalizeContextId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedSubjectKey(subject) {
  if (!subject) return '';
  return `${normalizeContextId(subject.layerId)}:${normalizeContextId(subject.id)}`;
}

function resetNavigationVisitedCycle() {
  state.navigationVisited.clear();
  const currentKey = subjectKey(state.subject);
  if (currentKey) state.navigationVisited.add(currentKey);
}

/** @returns {{historyKeys: string[], navigationVisitedKeys: string[], historyLength: number, navigationIndex: number, suppressedHistoryKey: string|null, pendingSelectionKey: string|null}} */
export function _getAwarenessNavigationStateForTest() {
  return {
    historyKeys: state.navigationHistory.map(subjectKey),
    navigationVisitedKeys: [...state.navigationVisited],
    historyLength: state.navigationHistory.length,
    navigationIndex: state.navigationIndex,
    suppressedHistoryKey: state.suppressedHistoryKey,
    pendingSelectionKey: state.pendingSelectionKey,
  };
}

function selectKnownContextTarget(layerId, id) {
  const key = `${layerId}:${id}`;
  const known = [
    state.subject,
    ...state.navigationHistory,
    ...(state.results?.cohorts || []).flatMap((cohort) => (
      cohort.id === layerId ? (cohort.summary.navigationNearest || cohort.summary.nearest || []) : []
    )),
  ].find((item) => item && `${item.layerId || layerId}:${item.id || item.mmsi}` === key);
  if (!known?.position) return false;
  if (contextTargetFlyToAllowed(layerId)) releaseAircraftTracking();
  selectSubject({
    ...known,
    layerId,
    id: String(known.id || known.mmsi),
    label: known.label || known.name || known.callsign || String(id),
    position: Cesium.Cartesian3.clone(known.position),
  });
  return true;
}

export function requestFocus(layerId, id, preserveHistory = false, { origin = 'programmatic' } = {}) {
  const key = `${layerId}:${id}`;
  state.pendingSelectionKey = key;
  if (preserveHistory) state.suppressedHistoryKey = key;
  const focused = focusNearbyTarget(layerId, id, { origin });
  state.pendingSelectionKey = null;
  state.suppressedHistoryKey = null;
  return focused;
}

function focusSubject(subject, preserveHistory = false, options = {}) {
  if (!subject) return false;
  return requestFocus(subject.layerId, subject.id, preserveHistory, options);
}

export function focusCurrentSubject(options = {}) {
  return focusSubject(state.subject, true, options);
}

function selectNavigationTargets(sourceCohorts, subject, visitedKeys, {
  targetLayer = null,
  aircraftClass = null,
  aircraftOnly = false,
} = {}) {
  let targets = getAwarenessNavigationTargets(sourceCohorts, subject, visitedKeys);
  if (aircraftOnly) {
    targets = targets.filter((target) => isFlightLayer(target.layerId));
  }
  if (targetLayer) {
    targets = targets.filter((target) => target.layerId === targetLayer);
  }
  if (aircraftClass) {
    targets = targets.filter((target) => aircraftClassMatchesFilter(target.item, aircraftClass));
  }
  return targets;
}

/**
 * Resolve the source-owned aircraft that currently owns Cesium tracking.
 * Both flight layers may briefly retain local state during a cross-layer
 * handoff, so the viewer's normalized tracked identity is the tie-breaker.
 * @returns {{layerId: string, id: string, label: string, position: Cesium.Cartesian3}|null}
 *   Detached awareness subject, or null when no flight owns the follow camera.
 */
export function currentTrackedFlightSubject() {
  const trackedKey = normalizeContextId(state.viewer?.trackedEntity?.gevTrackedId);
  if (!trackedKey) return null;
  const subjects = [
    flightsLayer.getTrackedSubject?.(),
    militaryFlightsLayer.getTrackedSubject?.(),
  ];
  return subjects.find((subject) => normalizedSubjectKey(subject) === trackedKey) || null;
}

function alternativeFlightAvailable({
  targetLayer = null,
  aircraftClass = null,
} = {}) {
  if (!isFlightLayer(state.subject?.layerId) || !state.subject?.position) return false;
  if (targetLayer && !isFlightLayer(targetLayer)) return false;

  const flights = targetLayer === 'military'
    ? []
    : flightsLayer.getNearby(
      state.subject.position,
      AWARENESS_MAX_FLIGHT_SEARCH_RADIUS_M,
      2,
      { includeHidden: true },
    ).filter((item) => aircraftClassMatchesFilter(item, aircraftClass));

  const military = targetLayer === 'flights'
    ? []
    : militaryFlightsLayer.getNearby(
      state.subject.position,
      AWARENESS_MAX_FLIGHT_SEARCH_RADIUS_M,
      2,
      { includeHidden: true },
    ).filter((item) => aircraftClassMatchesFilter(item, aircraftClass));

  return [
    ['flights', flights],
    ['military', military],
  ].some(([layerId, items]) => items.some((item) => (
    `${layerId}:${item.icao24 || item.id}` !== subjectKey(state.subject)
  )));
}

function closestFlightWithinRadius(radiusM, visitedKeys, excludeVisited, {
  targetLayer = null,
  aircraftClass = null,
} = {}) {
  if (!state.subject?.position) return null;
  const visited = new Set(visitedKeys);
  if (targetLayer && !isFlightLayer(targetLayer)) return null;
  const candidates = [
    ...(targetLayer === 'military' ? [] : flightsLayer.getNearby(
      state.subject.position,
      radiusM,
      25000,
      { includeHidden: true },
    )
      .filter((item) => aircraftClassMatchesFilter(item, aircraftClass))
      .map((item) => ({ layerId: 'flights', id: String(item.icao24), item }))),
    ...(targetLayer === 'flights' ? [] : militaryFlightsLayer.getNearby(
      state.subject.position,
      radiusM,
      5000,
      { includeHidden: true },
    )
      .filter((item) => aircraftClassMatchesFilter(item, aircraftClass))
      .map((item) => ({ layerId: 'military', id: String(item.icao24), item }))),
  ].filter((target) => {
    const key = `${target.layerId}:${target.id}`;
    if (key === subjectKey(state.subject)) return false;
    return !excludeVisited || !visited.has(key);
  });
  candidates.sort((a, b) => (
    (a.item.distanceM ?? a.item.distance ?? Infinity)
    - (b.item.distanceM ?? b.item.distance ?? Infinity)
  ));
  return candidates[0] || null;
}

function findExpandedFlightTarget(options = {}) {
  if (!isFlightLayer(state.subject?.layerId)) return null;
  let visitedKeys = [...state.navigationVisited];
  const search = () => findByDoublingRadius(
    (radiusM) => closestFlightWithinRadius(radiusM, visitedKeys, true, options),
    {
      initialRadiusM: AWARENESS_RADIUS_M,
      maxRadiusM: AWARENESS_MAX_FLIGHT_SEARCH_RADIUS_M,
    },
  );
  const target = search();
  if (target) return target;
  resetNavigationVisitedCycle();
  visitedKeys = [...state.navigationVisited];
  return search();
}

function subjectCohortFeedUnknown() {
  const cohort = state.results?.cohorts?.find((item) => item.id === state.subject?.layerId);
  return cohort?.summary?.relationship === AWARENESS_RELATIONSHIP.UNKNOWN
    && cohort.summary.count === null;
}

export function canNavigateNext({
  targetLayer = null,
  aircraftClass = null,
} = {}) {
  return canNavigateAwarenessNext({
    hasForwardHistory: findCompatibleHistoryIndex(
      state.navigationHistory,
      state.navigationIndex,
      1,
      { targetLayer, aircraftClass, resolveItem: historySubjectItem },
    ) !== -1,
    hasNearbyTarget: selectNavigationTargets(
      state.results?.cohorts,
      state.subject,
      [...state.navigationVisited],
      { targetLayer, aircraftClass },
    ).length > 0,
    hasExpandedFlightTarget: alternativeFlightAvailable({
      targetLayer,
      aircraftClass,
    }),
    subjectCohortUnknown: subjectCohortFeedUnknown(),
  });
}

/**
 * Walk navigation history for the next entry that can still be focused.
 *
 * A history entry only holds a SNAPSHOT of a contact; the live contact behind
 * it can be evicted from its layer at any time (the cull that drives
 * CONTACT LOST). Focusing an evicted entry fails, so stepping over it is the
 * only way PREVIOUS/NEXT survives a lost subject — stopping at the first dead
 * entry strands the operator there for the rest of the session, because the
 * index never advances past it.
 *
 * `state.navigationIndex` moves only on a successful focus: a caller that
 * falls through to the live cohort must still splice forward history from the
 * position the operator actually occupies.
 * @param {number} direction Walk direction (negative = previous).
 * @param {{targetLayer: string|null, aircraftClass: string|null}} filters Navigation filters.
 * @returns {boolean} Whether a history entry was focused.
 */
function focusCompatibleHistory(direction, {
  targetLayer,
  aircraftClass,
  aircraftOnly,
  origin = 'programmatic',
}) {
  let cursor = state.navigationIndex;
  for (;;) {
    const historyIndex = findCompatibleHistoryIndex(
      state.navigationHistory,
      cursor,
      direction,
      { targetLayer, aircraftClass, aircraftOnly, resolveItem: historySubjectItem },
    );
    if (historyIndex === -1) return false;
    if (focusSubject(state.navigationHistory[historyIndex], true, { origin })) {
      state.navigationIndex = historyIndex;
      return true;
    }
    // Contact evicted since it entered history — step over it. The scan is
    // strictly monotonic, so this terminates at the end of history.
    cursor = historyIndex;
  }
}

export function navigateHistory(direction, {
  targetLayer = null,
  aircraftClass = null,
  aircraftOnly = false,
  origin = 'programmatic',
} = {}) {
  if (focusCompatibleHistory(direction, {
    targetLayer, aircraftClass, aircraftOnly, origin,
  })) return true;

  if (direction < 0) return false;

  let targets = selectNavigationTargets(
    state.results?.cohorts,
    state.subject,
    [...state.navigationVisited],
    { targetLayer, aircraftClass, aircraftOnly },
  );
  const targetHistoryFullyVisited = targets.length > 0 && targets.every((target) => target.visited);
  const subjectCohortUnknown = subjectCohortFeedUnknown();
  if (targetHistoryFullyVisited && isFlightLayer(state.subject?.layerId) && !subjectCohortUnknown) {
    const expanded = findExpandedFlightTarget({ targetLayer, aircraftClass });
    if (expanded) {
      return requestFocus(expanded.candidate.layerId, expanded.candidate.id, false, { origin });
    }
  }
  if (targetHistoryFullyVisited) {
    resetNavigationVisitedCycle();
    targets = selectNavigationTargets(
      state.results?.cohorts,
      state.subject,
      [...state.navigationVisited],
      { targetLayer, aircraftClass, aircraftOnly },
    );
  }
  const hasNearbyFlight = targets.some((target) => isFlightLayer(target.layerId));
  if (isFlightLayer(state.subject?.layerId) && !hasNearbyFlight && !subjectCohortUnknown) {
    const expanded = findExpandedFlightTarget({ targetLayer, aircraftClass });
    if (expanded) {
      return requestFocus(expanded.candidate.layerId, expanded.candidate.id, false, { origin });
    }
  }
  if (subjectCohortFeedUnknown()) return false;
  const candidate = targets[0];
  if (!candidate) return false;
  return requestFocus(candidate.layerId, candidate.id, false, { origin });
}

function historySubjectItem(subject) {
  if (!subject) return null;
  const cohort = state.results?.cohorts?.find((item) => item.id === subject.layerId);
  const items = cohort?.summary?.navigationNearest || cohort?.summary?.nearest || [];
  return items.find((item) => String(item?.icao24 || item?.mmsi || item?.id) === String(subject.id))
    || subject;
}

export function historySourceItem(subject) {
  if (!isFlightLayer(subject?.layerId) || !subject?.position) return null;
  // The current sweep already holds this contact's record. Reusing it keeps
  // selection O(1) against the cohort instead of paying a fresh full-layer
  // proximity scan per selection — the burst cost when NEXT walks a cohort.
  const cohort = state.results?.cohorts?.find((item) => item.id === subject.layerId);
  const items = cohort?.summary?.navigationNearest || cohort?.summary?.nearest || [];
  const fromSweep = items.find(
    (item) => String(item?.icao24 || item?.id) === String(subject.id),
  );
  if (fromSweep) return fromSweep;
  const layer = subject.layerId === 'military' ? militaryFlightsLayer : flightsLayer;
  return layer.getNearby(subject.position, 1000, 25, { includeHidden: true })
    .find((item) => String(item?.icao24 || item?.id) === String(subject.id)) || null;
}

export function navigationState() {
  return {
    canPrevious: state.navigationIndex > 0,
    canFocus: Boolean(state.subject),
    canNext: canNavigateNext(),
  };
}
