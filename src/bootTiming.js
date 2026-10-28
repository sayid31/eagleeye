/**
 * Boot-path User Timing emitter.
 *
 * Shaped after `src/data/trafficTiming.js` — same `performance.mark` +
 * `performance.measure` pattern, same clear-only-my-prefix teardown, same
 * structured-clone-safe `detail` objects. The vocabulary (mark names, phase
 * pairs, layer-phase list) lives in `bootTimingReport.js` so the emitter and
 * the reader cannot disagree about a name.
 *
 * DELIBERATE DIVERGENCE FROM `trafficTiming.js`: THESE MARKS SHIP IN
 * PRODUCTION. `TRAFFIC_TIMING_ENABLED` is `import.meta.env.DEV &&
 * ?trafficDebug=1`, and that gate is right for traffic, which installs
 * listeners, a moveEnd remover, correlated trace objects and instrumented
 * twins of its own code paths. Boot timing installs none of that — it is ~17
 * one-time `performance.mark()` calls plus ~11 measures, unmeasurable against
 * the ~2.4 s cold boot they measure (see `docs/PERFORMANCE.md`). And
 * DEV-gating would make `dist/`
 * unmeasurable, which is exactly where the cost being investigated lives (the
 * parser-blocking Cesium script exists only in the built `index.html`). A
 * different cost profile earns a different gate. Please do not "fix" this
 * into DEV-only.
 *
 * NO `console.*` ANYWHERE IN THIS MODULE, BY CONSTRUCTION. `performance.mark`
 * writes to the entry buffer and never to the console, so the clean-console
 * gates in `scripts/track-regression.mjs` are untouched. A log line here
 * would break them.
 *
 * @module bootTiming
 */

import {
  BOOT_MARKS,
  BOOT_PHASES,
  BOOT_TIMING_PREFIX,
  BOOT_TOTALS,
  bootLayerMarkName,
} from './bootTimingReport.js';

/**
 * Second belt on the mark budget. The boot window closes on its own at
 * `splash-hidden`, but `_setVisibilityIntentPhase` in the data manager runs
 * for every layer toggle for the whole life of the page — so a bug that left
 * the window open must not be able to grow the entry buffer without bound.
 */
export const BOOT_TIMING_MAX_MARKS = 512;

let bootWindowOpen = true;
let marksEmitted = 0;

/** Whether boot marks are still being recorded. The manager branches on this. */
export function isBootTimingOpen() {
  return bootWindowOpen && marksEmitted < BOOT_TIMING_MAX_MARKS;
}

/** Diagnostics for the capture harness and the inertness test. */
export function getBootTimingDiagnostics() {
  return { open: isBootTimingOpen(), marksEmitted, maxMarks: BOOT_TIMING_MAX_MARKS };
}

/** Reopen the window and zero the counter. Test seam only. */
export function _resetBootTimingForTest() {
  bootWindowOpen = true;
  marksEmitted = 0;
}

function canEmit() {
  return typeof performance?.mark === 'function' && isBootTimingOpen();
}

/**
 * Record one boot instant.
 * @param {string} instant One of `BOOT_MARKS`' values.
 * @returns {string|null} The mark name, or `null` if the window is closed.
 */
export function markBoot(instant) {
  if (!canEmit()) return null;
  const name = `${BOOT_TIMING_PREFIX}${instant}`;
  marksEmitted += 1;
  performance.mark(name, { detail: { boot: true, instant } });
  return name;
}

/**
 * Record one layer lifecycle phase. Called from the data manager's existing
 * phase seam, so it must stay cheap and must never throw.
 * @param {string} layerId
 * @param {number} intentEpoch
 * @param {string} phase One of `BOOT_LAYER_PHASES`.
 * @returns {string|null}
 */
export function markLayerPhase(layerId, intentEpoch, phase) {
  if (!canEmit() || !layerId) return null;
  const name = bootLayerMarkName(layerId, intentEpoch, phase);
  marksEmitted += 1;
  performance.mark(name, { detail: { boot: true, layerId, intentEpoch, phase } });
  return name;
}

/** True when an endpoint mark exists in the buffer. */
function hasMark(instant) {
  return performance
    .getEntriesByName(`${BOOT_TIMING_PREFIX}${instant}`, 'mark').length > 0;
}

function measureSpan(prefix, key, spec) {
  if (!hasMark(spec.end)) return false;
  // A `fromOrigin` span starts at numeric 0, which the User Timing spec reads
  // as `timeOrigin` — the only way to express "everything before our first
  // line of code", for which no mark can exist.
  if (!spec.fromOrigin && !hasMark(spec.start)) return false;
  performance.measure(`${BOOT_TIMING_PREFIX}${prefix}:${key}`, {
    start: spec.fromOrigin ? 0 : `${BOOT_TIMING_PREFIX}${spec.start}`,
    end: `${BOOT_TIMING_PREFIX}${spec.end}`,
    detail: {
      boot: true,
      phase: key,
      deliberate: Boolean(spec.deliberate),
      decisionRef: spec.decisionRef ?? null,
    },
  });
  return true;
}

/**
 * Close the boot window and derive every measure whose endpoint marks landed.
 *
 * Spans with a missing endpoint are skipped rather than faked; the reader
 * reports them under `missing`, which is where the honesty lives.
 *
 * @returns {{phases:number, totals:number}} How many measures were emitted.
 */
export function finalizeBootTiming() {
  if (typeof performance?.measure !== 'function') {
    bootWindowOpen = false;
    return { phases: 0, totals: 0 };
  }
  let phases = 0;
  let totals = 0;
  for (const spec of BOOT_PHASES) {
    if (measureSpan('phase', spec.phase, spec)) phases += 1;
  }
  for (const spec of BOOT_TOTALS) {
    if (measureSpan('total', spec.total, spec)) totals += 1;
  }
  bootWindowOpen = false;
  return { phases, totals };
}

/**
 * Clear only this module's entries, leaving every other namespace (notably
 * `traffic:`) standing. Same shape as `clearTrafficTimingEntries()`.
 */
export function clearBootTimingEntries() {
  if (typeof performance?.getEntriesByType !== 'function') return;
  for (const type of ['mark', 'measure']) {
    const names = new Set(
      performance.getEntriesByType(type)
        .filter((entry) => entry.name.startsWith(BOOT_TIMING_PREFIX))
        .map((entry) => entry.name),
    );
    for (const name of names) {
      if (type === 'mark') performance.clearMarks(name);
      else performance.clearMeasures(name);
    }
  }
}

/** Every `boot:` entry currently in the buffer, marks and measures together. */
export function getBootTimingEntries() {
  if (typeof performance?.getEntriesByType !== 'function') return [];
  return [
    ...performance.getEntriesByType('mark'),
    ...performance.getEntriesByType('measure'),
  ].filter((entry) => entry.name.startsWith(BOOT_TIMING_PREFIX));
}

export { BOOT_MARKS };
