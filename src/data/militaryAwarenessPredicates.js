/**
 * Pure decision predicates for the Global Context / Contacts awareness panel.
 *
 * Extracted from `militaryAwareness.js` (Wave 1 split program, item #16) —
 * mechanical relocation of already-pure/already-exported functions, zero
 * behavior change. Every function here takes its inputs as explicit
 * parameters (or reads only the local timing/distance constants below) and
 * never touches the module-level `state` object that `militaryAwareness.js`
 * owns — same purity standard applied to the `radio.js` and `satellites.js`
 * splits (see `radioTunerMath.js`/`satelliteTleLookup.js`).
 *
 * `awarenessNeedsContinuousRender` stayed behind despite being otherwise
 * pure: its default parameters read `state.cameraMoving`/`state.subject`/
 * `state.results` directly, which is a direct module-state dependency by
 * the same standard. `selectNavigationTargets` also stayed behind — it is
 * tightly coupled to the navigation-history state machine that remains in
 * `militaryAwareness.js`, and has no external consumers.
 *
 * Unlike the `radio.js`/`satellites.js` splits, this cluster needs nothing
 * back from `militaryAwareness.js` — the import only runs one way. Every
 * export here is re-exported from `militaryAwareness.js` because the code
 * that stays behind calls almost all of them directly (e.g.
 * `awarenessRefreshIntervalMs` from `scheduleDirectionOverlayUpdate`,
 * `isFlightLayer`/`aircraftClassMatchesFilter` from a dozen call sites), and
 * `militaryAwareness.test.mjs`/`tr3bRegistry.test.mjs` import several of
 * them directly too.
 *
 * @module militaryAwarenessPredicates
 */

const AWARENESS_REFRESH_MS = 750;
/** @constant {number} Refresh cadence while the camera pose is CHANGING.
 *  Owner playtest 2026-08-18: the Contacts direction arrows and card readouts
 *  "feel sluggish when you look around" — at the parked 750 ms cadence the
 *  arrows lag the view by up to three quarters of a second. */
const AWARENESS_MOTION_REFRESH_MS = 175;
/** @constant {number} How long the pose signature must stay UNCHANGED before
 *  the view counts as parked again. The signature is quantized, so a slow drag
 *  crosses a bin only every few frames; without this hysteresis every crossing
 *  read as a motion-end and refreshed at nearly display rate. */
const AWARENESS_MOTION_SETTLE_MS = 250;
const AWARENESS_REEVALUATE_DISTANCE_M = 250;

/**
 * Whether focusing a Context target may take ownership of the camera.
 * Cockpit owns the camera at 20 Hz, so non-aircraft targets remain selectable
 * there but must not start a competing flyTo animation.
 *
 * @param {string} layerId Context target layer id.
 * @param {HTMLElement|null} [body=document.body] Document body to inspect.
 * @returns {boolean} Whether the target may start a camera flight.
 */
export function contextTargetFlyToAllowed(layerId, body = globalThis.document?.body) {
  const nonAircraft = layerId === 'ais-live-vessels' || layerId === 'military-installations';
  return !nonAircraft || !body?.classList?.contains('cockpit-mode');
}

/**
 * Decide whether a source-scoped context clear belongs to the current subject.
 * @param {{layerId?: string}|null} subject Current awareness subject.
 * @param {{layerId?: string}|null} cleared Cleared source detail.
 * @returns {boolean} Whether the current subject should be cleared.
 */
export function awarenessClearMatchesSubject(subject, cleared) {
  return Boolean(subject?.layerId && cleared?.layerId === subject.layerId);
}

/**
 * Refresh cadence for the Contacts direction arrows and card readouts.
 *
 * A MOVING camera earns the snappy cadence; a parked one keeps the cheap 750 ms
 * one. This is safe for requestRenderMode because the cadence is applied inside
 * `scene.preRender`: a faster interval can only ever consume frames the camera
 * movement is ALREADY forcing. A parked scene renders no frames at all, so no
 * extra refresh happens and no timer is introduced — the render governor and
 * the idle-leak fix both depend on parked staying quiet.
 * @param {boolean} cameraMoving Whether the camera pose changed since the last frame.
 * @returns {number} Minimum ms between refreshes.
 */
export function awarenessRefreshIntervalMs(cameraMoving) {
  return cameraMoving ? AWARENESS_MOTION_REFRESH_MS : AWARENESS_REFRESH_MS;
}

/**
 * Decide, for one rendered frame, whether the view counts as MOVING and whether
 * the Contacts readout may refresh.
 *
 * Motion is HYSTERETIC. The pose signature is quantized (~10 m / ~0.06°), so a
 * slow drag crosses a bin only every few frames: treating a single unchanged
 * frame as "parked" made every crossing look like a motion-end and refreshed at
 * nearly display rate. Motion therefore ends only after the pose has been
 * unchanged for AWARENESS_MOTION_SETTLE_MS, and the motion cadence is a HARD
 * floor in every state — no bin-crossing pattern, and no motion-end settle, can
 * refresh faster than AWARENESS_MOTION_REFRESH_MS.
 *
 * @param {object} input
 * @param {number} input.nowMs This frame's clock.
 * @param {number} input.lastRefreshMs When the readout last refreshed.
 * @param {number} input.lastPoseChangeMs When the camera pose last changed bins.
 * @param {boolean} input.wasMoving Whether the previous frame counted as moving.
 * @returns {{moving: boolean, refresh: boolean}}
 */
export function awarenessRefreshDecision({ nowMs, lastRefreshMs, lastPoseChangeMs, wasMoving }) {
  const moving = nowMs - lastPoseChangeMs < AWARENESS_MOTION_SETTLE_MS;
  // The single frame where hysteresis expires: settle the readout at rest
  // instead of leaving it up to a parked interval stale.
  const settling = Boolean(wasMoving) && !moving;
  const sinceRefresh = nowMs - lastRefreshMs;
  const refresh = sinceRefresh >= awarenessRefreshIntervalMs(true)
    && (moving || settling || sinceRefresh >= awarenessRefreshIntervalMs(false));
  return { moving, refresh };
}

/**
 * Decide whether a source-scoped clear was an eviction rather than a deselect.
 *
 * Both arrive on the same events: the owning layer calls the same teardown for
 * "the user clicked away" and "this contact aged out of the feed". Only the
 * origin separates them, and it matters — a deliberate clear takes the Contact
 * panel down, while an eviction must keep it up in its CONTACT LOST state, or
 * the panel disappears out from under its own PREVIOUS/NEXT controls.
 * @param {{reason?: string}|null} cleared Cleared source detail.
 * @returns {boolean} Whether the subject left the feed on its own.
 */
export function awarenessClearIsEviction(cleared) {
  return cleared?.reason === 'evicted';
}

/**
 * Decide whether proximity cohorts need an expensive rescan.
 * @param {object} input Refresh evidence.
 * @param {boolean} input.force Explicit invalidation.
 * @param {boolean} input.hasResults Whether a prior evaluation exists.
 * @param {number} input.movementM Subject displacement since evaluation.
 * @param {boolean} input.sourceRevisionChanged Whether any source state changed.
 * @returns {boolean} Whether cohorts should be evaluated again.
 */
export function awarenessRefreshRequired({ force, hasResults, movementM, sourceRevisionChanged }) {
  return Boolean(
    force
    || !hasResults
    || sourceRevisionChanged
    || !Number.isFinite(movementM)
    || movementM >= AWARENESS_REEVALUATE_DISTANCE_M,
  );
}

export function isFlightLayer(layerId) {
  return layerId === 'flights' || layerId === 'military';
}

function normalizeAircraftClass(value) {
  return String(value || '').trim().toLowerCase();
}

export function aircraftClassMatchesFilter(item, aircraftClass) {
  const requested = normalizeAircraftClass(aircraftClass);
  if (!requested) return true;
  const candidates = [
    item?.aircraftClass,
    item?.klass,
    item?.type,
    item?.typeCode,
    item?.typeName,
  ]
    .map((value) => normalizeAircraftClass(value))
    .filter(Boolean);
  if (!candidates.length) return false;
  return candidates.some((candidate) => candidate === requested || candidate.includes(requested));
}

/**
 * Resolves NEXT availability from the same three branches used by navigation.
 * Forward history remains usable while a feed is unavailable; discovering a
 * new nearby or expanded target requires a known subject cohort.
 * @param {Object} availability Navigation branch availability.
 * @returns {boolean} Whether NEXT has a path that can run.
 */
export function canNavigateAwarenessNext({
  hasForwardHistory = false,
  hasExpandedFlightTarget = false,
  hasNearbyTarget = false,
  subjectCohortUnknown = false,
} = {}) {
  return Boolean(
    hasForwardHistory
    || (!subjectCohortUnknown && (hasExpandedFlightTarget || hasNearbyTarget))
  );
}

/** Retain filter metadata when a production subject enters navigation history. */
export function historySubjectSnapshot(subject, sourceItem = null) {
  const aircraftClass = sourceItem?.aircraftClass
    || sourceItem?.klass
    || sourceItem?.type
    || subject?.aircraftClass
    || null;
  return aircraftClass ? { ...subject, aircraftClass } : { ...subject };
}

/** Find the next history entry compatible with requested navigation filters. */
export function findCompatibleHistoryIndex(history, startIndex, direction, {
  targetLayer = null,
  aircraftClass = null,
  aircraftOnly = false,
  resolveItem = (subject) => subject,
} = {}) {
  const step = direction < 0 ? -1 : 1;
  for (let index = startIndex + step; index >= 0 && index < history.length; index += step) {
    const subject = history[index];
    if (aircraftOnly && !isFlightLayer(subject?.layerId)) continue;
    if (targetLayer && subject?.layerId !== targetLayer) continue;
    if (aircraftClass && !aircraftClassMatchesFilter(resolveItem(subject), aircraftClass)) continue;
    return index;
  }
  return -1;
}

/**
 * Whether an evaluation actually has a contact to point an arrow at.
 *
 * A cohort reports `count: null` when its feed is unavailable or stale, and `0`
 * when the feed is healthy but empty. Only a positive count puts a marker on
 * the compass rim, so anything else means there is nothing to animate.
 * @param {?{cohorts?: Array<{summary?: {count: ?number}}>}} results
 * @returns {boolean}
 */
export function awarenessResultsAreLive(results) {
  const cohorts = Array.isArray(results?.cohorts) ? results.cohorts : [];
  return cohorts.some((cohort) => Number(cohort?.summary?.count) > 0);
}
