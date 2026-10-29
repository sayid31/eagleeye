/**
 * Timing for the initial share-link restore.
 *
 * Both numbers used to be bare literals in two different files — `1500` in
 * `ui.js` and `3.0` in `sharelink.js` — which made the pair impossible to
 * reason about together even though they are consumed as one wait by anyone
 * opening a shared link. They live here so the measured total has one home.
 *
 * WHY THESE VALUES (superseding DECISIONS 2026-10-08, which kept 1500 ms and
 * 3.0 s and listed lowering them under "Not done"): that entry justified them
 * as letting "a recipient see the shared pose animate in", and as "small next
 * to layer restore". Measurement refuted both halves. `#loading-screen` is
 * opaque and the splash gates on a promise that awaits the flight, so the
 * animation ran entirely behind the cover and was never seen; and
 * `layer-restore` measures 0.2 ms, not something these are small beside. The
 * two holds were 4,522.5 ms of a 6,377.5 ms reload — about 71%.
 *
 * That 71% is the same-day before-capture (the Δ table under "What the first
 * capture said, and what changed" in `docs/PERFORMANCE.md`), measured on this
 * branch and pipeline so the before/after comparison is like-for-like. The 68%
 * of 6,647.4 ms quoted in the prose above that table is the separate 28 October
 * capture that first surfaced the problem. Two runs, same conclusion — cite the
 * Δ table when comparing, since that is the controlled pair.
 *
 * @module shareRestoreTiming
 */

/**
 * How long to hold before applying a shared camera pose.
 *
 * This is a deferred-navigation grace window, NOT mesh warm-up: `ui.js` claims
 * camera authority up front and re-checks `_reassertNavigationHandoff()` when
 * the timer fires, so a navigation issued during the window wins over the
 * restore. Shortened rather than removed because the window is the mechanism
 * that keeps a competing navigation from being stomped.
 *
 * It is deliberately NOT zero: the restore must still lose to a competing
 * navigation, and at 0 ms the handoff re-check collapses into the same task
 * that armed it, so nothing could ever claim authority first.
 *
 * Only programmatic claimants (a scene recipe, tracking carried in the link)
 * can realistically use it — `#loading-screen` lacks `pointer-events: none`
 * until it gains `.hidden`, so the opaque splash swallows every click and drag
 * for the whole window. A human cannot compete in it.
 */
export const SHARE_RESTORE_HOLD_MS = 500;

/**
 * Shared-pose flight duration, in seconds (Cesium `flyTo` takes seconds).
 *
 * Anchored to the durations already in this tree rather than picked by feel:
 * `annotationEngine.js` flies 1.6 s and 1.8 s, and `TILT_DURATION_S` is 0.9 s.
 * 1.2 s sits inside that band for a short reframe while still leaving Cesium a
 * window to begin requesting destination tiles before the first frame lands.
 */
export const SHARE_RESTORE_FLIGHT_S = 1.2;
