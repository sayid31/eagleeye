// Moved out of militaryAwareness.js (militaryAwarenessSources).

import { AWARENESS_RADIUS_M, summarizeAwarenessCohort } from './militaryAwarenessEngine.js';
import flightsLayer from './flights.js';
import militaryFlightsLayer from './militaryFlights.js';
import aisLiveVesselsLayer from './aisLiveVessels.js';
import militaryInstallationsLayer from './militaryInstallations.js';
import { AWARENESS_MAX_EXAMPLES, AWARENESS_MAX_NAVIGATION_EXAMPLES, AWARENESS_QUERY_LIMIT, DEPENDENCIES, SOURCE_LABEL, state } from './militaryAwarenessConstants.js';

function sourceState(layerId) {
  const lifecycle = state.dataManager?.getLayerLifecycleState?.(layerId) || null;
  const enabled = lifecycle?.enabled === true || state.dataManager?.isEnabled(layerId) === true;
  const enabling = lifecycle?.lifecycleState === 'enabling';
  const moduleStats = state.dataManager?.layers?.get(layerId)?.module?.getStats?.() || {};
  const stats = enabling
    ? { ...moduleStats, loading: true, status: 'loading' }
    : moduleStats;
  // A deferred source that has started but not settled is not evidence of an
  // empty cohort. Keep it explicitly unavailable so the panel cannot flash a
  // false all-clear, even if a lifecycle adapter briefly reports the requested
  // visibility intent as enabled.
  //
  // `enabling` and the never-answered predicate cover two DIFFERENT windows, and
  // both are needed because these dependencies do not settle the same way.
  //
  //   - military-installations is covered by `enabling` alone. Its enable() is
  //     SYNCHRONOUS and the manager awaits update(), which owns the first
  //     Overpass fetch, so the lifecycle stays `enabling` for that whole window
  //     however long the fetch takes. Confirmed live: a held 17 s first fetch
  //     read `enabling` across 34 samples with the panel non-numeric throughout,
  //     and a failing one settled to `enabled` with status 'unavailable'. Its
  //     getStats() has no `loading` status to offer in any case —
  //     setInstallationStatus is only ever called with
  //     zoom-in/ready/stale/empty/unavailable.
  //   - ais-live-vessels is what the predicate below is FOR. Its enable() and
  //     update() both resolve as soon as the first /api/ais-live poll answers,
  //     so the lifecycle settles to `enabled` — but until the server-side socket
  //     delivers a position, firstConnectPhase is 'loading' and getStats()
  //     reports loading: true, lastUpdate: null, count 0, and an UNDEFINED
  //     status. That zero is an absence of evidence, not evidence of absence,
  //     and neither the lifecycle nor the status list can tell.
  //
  // Deliberately `loading === true` and not truthiness: layers that never report
  // a busy flag (flights, military) must keep answering for themselves, and a
  // source that HAS answered once (lastUpdate set) keeps its last real count
  // through every later poll rather than blanking to `?` on each refresh.
  const neverAnswered = stats.loading === true && !stats.lastUpdate;
  const unavailable = enabling
    || !enabled
    || neverAnswered
    || ['unavailable', 'zoom-in'].includes(stats.status)
    || Boolean(stats.error && stats.count === 0);
  return { available: !unavailable, stale: Boolean(stats.stale), stats };
}

export function collectSourceStates() {
  return Object.fromEntries(DEPENDENCIES.map((layerId) => [layerId, sourceState(layerId)]));
}

export function sourceRevision(sourceStates) {
  return DEPENDENCIES.map((layerId) => {
    const source = sourceStates[layerId];
    const stats = source?.stats || {};
    return [
      layerId,
      source?.available,
      source?.stale,
      stats.lastUpdate || null,
      stats.count ?? null,
      stats.status || null,
      stats.error || null,
    ];
  }).map((parts) => parts.join(':')).join('|');
}

function isSame(subject, item, prefix, key) {
  return subject?.layerId === prefix && String(subject.id) === String(item?.[key]);
}

/**
 * Summarize viewport-backed installations without implying radius-complete coverage.
 * @param {Array<object>} items Loaded installation matches.
 * @param {object} source Current source availability and staleness.
 * @returns {object} Awareness summary with viewport-honest reasoning.
 */
export function summarizeInstallationViewport(items, source) {
  const summary = summarizeAwarenessCohortForNavigation(items, source);
  if (summary.count === null) return summary;
  return {
    ...summary,
    reason: summary.count
      ? 'kecocokan terpetakan dari viewport yang dimuat'
      : 'feed viewport bukan survei lengkap 250 km',
  };
}

function summarizeAwarenessCohortForNavigation(items, source, {
  displayLimit = AWARENESS_MAX_EXAMPLES,
  navigationLimit = AWARENESS_MAX_NAVIGATION_EXAMPLES,
} = {}) {
  const summary = summarizeAwarenessCohort(items, { ...source, limit: navigationLimit });
  if (summary.count === null) return summary;
  return {
    ...summary,
    nearest: summary.nearest.slice(0, displayLimit),
    navigationNearest: summary.nearest,
  };
}

/**
 * The per-layer counts the Contacts panel is showing, as one flat block.
 *
 * Three honest numbers were reaching the operator at once: this cohort count
 * (the panel), `analyst_query`'s count of CURRENTLY-LOADED records, and the
 * layer-wide loaded total in the coverage note. After the camera dives to a
 * tracked contact the flights layer reloads by viewport, so the loaded set can
 * hold a fraction of the cohort — 8 against the panel's 42 in the field. The
 * numbers are all correct and the disagreement still reads as chaos.
 *
 * Derived from the same snapshot the panel renders (`cohort.summary.count` via
 * `buildAwarenessContextSnapshot`), so the two cannot drift apart. A cohort
 * whose feed cannot answer reports 'unknown' rather than a misleading zero.
 * @param {object|null} snapshot `getContextSnapshot()` result.
 * @returns {{centeredOn: string|null, radiusKm: number|null, aircraft: number|string,
 *   flights: number|string, military: number|string, vessels: number|string}|null}
 *   Panel-equivalent counts.
 */
export function contactsWindowFromSnapshot(snapshot) {
  if (!snapshot?.subject) return null;
  const countFor = (cohortId) => {
    const cohort = Array.isArray(snapshot.cohorts)
      ? snapshot.cohorts.find((item) => item?.id === cohortId)
      : null;
    return Number.isFinite(cohort?.count) ? cohort.count : 'unknown';
  };
  const flights = countFor('flights');
  const military = countFor('military');
  return {
    centeredOn: snapshot.subject.label || snapshot.subject.id || null,
    radiusKm: Number.isFinite(snapshot.radiusM)
      ? Math.round(snapshot.radiusM / 1000)
      : null,
    aircraft: Number.isFinite(flights) && Number.isFinite(military)
      ? flights + military
      : 'unknown',
    flights,
    military,
    vessels: countFor('ais-live-vessels'),
  };
}

/** Build the read-only Awareness snapshot shared with compact HUD consumers. */
export function buildAwarenessContextSnapshot(results, navigation = {}, { subjectPresent = true } = {}) {
  if (!results) return null;
  return {
    subject: { ...results.subject },
    // Whether the subject is still reported by its source. The cockpit Contact
    // readout holds its last-known values behind a CONTACT LOST cue when this
    // is false, rather than presenting frozen geometry as a live reading.
    subjectPresent: subjectPresent !== false,
    evaluatedAt: results.evaluatedAt,
    radiusM: results.radiusM,
    cohorts: results.cohorts.map((cohort) => ({
      id: cohort.id,
      label: cohort.label,
      source: cohort.source,
      coverage: cohort.coverage || null,
      relationship: cohort.summary.relationship,
      count: cohort.summary.count,
      reason: cohort.summary.reason,
      nearest: cohort.summary.nearest.slice(),
    })),
    navigation: { ...navigation },
  };
}

/**
 * THE aircraft-proximity engine. One computation, two consumers: the Contacts
 * panel window and the voice analyst's entity-centred "how many nearby".
 *
 * They used to be separate. The panel read live billboard positions through
 * `getNearby` with a 20 000 cap; the analyst re-derived its own answer from
 * last-fix coordinates over a 2 000-record slice. Same question, same centre,
 * two numbers — and in the owner's trial the spoken answer (15) and the panel
 * (111) disagreed badly enough that the model narrated the difference away.
 * Routing both through here makes them the same number BY CONSTRUCTION, so
 * they cannot drift again.
 *
 * The subject is excluded from its own window, which is why the panel reads
 * "contacts around X" rather than "including X".
 * @param {Cesium.Cartesian3} position Window centre.
 * @param {object} [options]
 * @param {number} [options.radiusM=AWARENESS_RADIUS_M] Window radius.
 * @param {object|null} [options.subject=null] Contact at the centre, excluded.
 * @returns {{flights: Array, military: Array, aircraft: number}|null} Cohorts
 *   plus the combined aircraft count, or null without a position.
 */
export function collectAircraftProximityWindow(position, {
  radiusM = AWARENESS_RADIUS_M,
  subject = null,
} = {}) {
  if (!position) return null;
  const flights = flightsLayer
    .getNearby(position, radiusM, AWARENESS_QUERY_LIMIT, { includeHidden: true })
    .filter((item) => !subject || !isSame(subject, item, 'flights', 'icao24'));
  const military = militaryFlightsLayer
    .getNearby(position, radiusM, AWARENESS_QUERY_LIMIT, { includeHidden: true })
    .filter((item) => !subject || !isSame(subject, item, 'military', 'icao24'));
  return { flights, military, aircraft: flights.length + military.length };
}

export function evaluateSubject(subject, sourceStates = collectSourceStates()) {
  const position = subject?.position;
  if (!position) return null;
  const flightsState = sourceStates.flights;
  const militaryState = sourceStates.military;
  const vesselsState = sourceStates['ais-live-vessels'];
  const installationsState = sourceStates['military-installations'];
  // Same engine the voice analyst calls — see collectAircraftProximityWindow.
  const { flights, military } = collectAircraftProximityWindow(position, { subject });
  const vessels = aisLiveVesselsLayer.getNearby(position, AWARENESS_RADIUS_M, AWARENESS_QUERY_LIMIT)
    .filter((item) => !isSame(subject, item, 'ais-live-vessels', 'mmsi'));
  const installations = militaryInstallationsLayer.getNearby(position, AWARENESS_RADIUS_M, AWARENESS_QUERY_LIMIT)
    .filter((item) => !isSame(subject, item, 'military-installations', 'id'));
  return {
    subject,
    evaluatedAt: Date.now(),
    radiusM: AWARENESS_RADIUS_M,
    cohorts: [
      { id: 'flights', label: 'Penerbangan', source: flightsState.stats.source || SOURCE_LABEL.flights, summary: summarizeAwarenessCohortForNavigation(flights, flightsState) },
      { id: 'military', label: 'Penerbangan militer', source: militaryState.stats.source || SOURCE_LABEL.military, summary: summarizeAwarenessCohortForNavigation(military, militaryState) },
      { id: 'ais-live-vessels', label: 'Kapal AIS', source: vesselsState.stats.source || SOURCE_LABEL['ais-live-vessels'], summary: summarizeAwarenessCohortForNavigation(vessels, vesselsState) },
      {
        id: 'military-installations',
        label: 'Instalasi terpetakan',
        source: installationsState.stats.source || SOURCE_LABEL['military-installations'],
        coverage: 'HANYA VIEWPORT SAAT INI',
        summary: summarizeInstallationViewport(installations, installationsState),
      },
    ],
  };
}
