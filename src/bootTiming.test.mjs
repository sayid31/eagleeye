import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  BOOT_MARKS,
  BOOT_TIMING_MAX_MARKS,
  _resetBootTimingForTest,
  clearBootTimingEntries,
  finalizeBootTiming,
  getBootTimingDiagnostics,
  getBootTimingEntries,
  isBootTimingOpen,
  markBoot,
  markLayerPhase,
} from './bootTiming.js';
import { BOOT_PHASES, parseBootMarkName, shapeBootReport } from './bootTimingReport.js';

// Node's real `performance` — same choice trafficTiming.test.mjs makes. A stub
// would not prove the `detail` objects survive structured cloning, which is
// the constraint that actually bites in a browser.
beforeEach(() => {
  clearBootTimingEntries();
  performance.clearMarks();
  performance.clearMeasures();
  _resetBootTimingForTest();
});

test('markBoot writes a parseable name and a structured-clone-safe detail', () => {
  const name = markBoot(BOOT_MARKS.INIT_START);
  assert.equal(name, 'boot:init-start');
  const [entry] = performance.getEntriesByName(name, 'mark');
  assert.ok(entry);
  assert.deepEqual(parseBootMarkName(name), { kind: 'instant', instant: 'init-start' });
  assert.deepEqual(structuredClone(entry.detail), { boot: true, instant: 'init-start' });
});

test('markLayerPhase names the layer, epoch and phase, and clones', () => {
  const name = markLayerPhase('cctv', 4, 'enable');
  assert.equal(name, 'boot:layer:cctv:4:enable');
  const [entry] = performance.getEntriesByName(name, 'mark');
  assert.deepEqual(structuredClone(entry.detail), {
    boot: true, layerId: 'cctv', intentEpoch: 4, phase: 'enable',
  });
});

test('markLayerPhase ignores a layer with no id instead of writing boot:layer:undefined:…', () => {
  assert.equal(markLayerPhase(undefined, 1, 'resolve'), null);
  assert.equal(markLayerPhase(null, 1, 'resolve'), null);
  assert.equal(getBootTimingEntries().length, 0);
});

test('finalizeBootTiming derives only the spans whose endpoint marks landed', () => {
  markBoot(BOOT_MARKS.MODULE_EVAL);
  markBoot(BOOT_MARKS.INIT_START);
  markBoot(BOOT_MARKS.VIEWER_CREATED);
  const result = finalizeBootTiming();
  const names = performance.getEntriesByType('measure').map((entry) => entry.name);
  assert.ok(names.includes('boot:phase:eager-eval'));
  assert.ok(names.includes('boot:phase:bootstrap'));
  assert.ok(names.includes('boot:phase:viewer'));
  assert.ok(!names.includes('boot:phase:ui'), 'ui never opened; it must not be invented');
  assert.equal(result.phases, 3);
  assert.equal(result.totals, 0, 'no view-ready/splash-hidden mark, so no total');
});

test('the timeOrigin-anchored span measures from 0, which no mark could express', () => {
  markBoot(BOOT_MARKS.MODULE_EVAL);
  finalizeBootTiming();
  const [entry] = performance.getEntriesByName('boot:phase:eager-eval', 'measure');
  assert.ok(entry, 'eager-eval needs only its end mark');
  assert.equal(entry.startTime, 0);
  assert.ok(entry.duration > 0, 'time has passed since timeOrigin');
});

test('derived measures carry the deliberate label so a report row cannot lose it', () => {
  markBoot(BOOT_MARKS.SHARE_ARMED);
  markBoot(BOOT_MARKS.SHARE_FIRED);
  finalizeBootTiming();
  const [entry] = performance.getEntriesByName('boot:phase:share-wait', 'measure');
  assert.deepEqual(structuredClone(entry.detail), {
    boot: true, phase: 'share-wait', deliberate: true, decisionRef: '2026-10-29',
  });
});

test('every non-deliberate span is labelled false, not left undefined', () => {
  markBoot(BOOT_MARKS.UI_START);
  markBoot(BOOT_MARKS.UI_END);
  finalizeBootTiming();
  const [entry] = performance.getEntriesByName('boot:phase:ui', 'measure');
  assert.equal(entry.detail.deliberate, false);
  assert.equal(entry.detail.decisionRef, null);
});

test('finalizeBootTiming closes the window, so the manager seam goes inert', () => {
  assert.equal(isBootTimingOpen(), true);
  finalizeBootTiming();
  assert.equal(isBootTimingOpen(), false);
  assert.equal(markBoot(BOOT_MARKS.VIEW_READY), null);
  assert.equal(markLayerPhase('cctv', 9, 'enable'), null, 'a later toggle must not grow the buffer');
});

test('the mark budget is a second belt if the window is somehow left open', () => {
  for (let index = 0; index < BOOT_TIMING_MAX_MARKS + 25; index += 1) {
    markLayerPhase('cctv', index, 'enable');
  }
  const diagnostics = getBootTimingDiagnostics();
  assert.equal(diagnostics.marksEmitted, BOOT_TIMING_MAX_MARKS);
  assert.equal(diagnostics.open, false, 'budget exhausted closes the gate even while the window is open');
  assert.equal(markLayerPhase('cctv', 9999, 'enable'), null);
});

test('clearBootTimingEntries removes only this namespace', () => {
  markBoot(BOOT_MARKS.INIT_START);
  markBoot(BOOT_MARKS.VIEWER_CREATED);
  finalizeBootTiming();
  // trafficTiming writes into the same buffer; clearing ours must not touch it.
  performance.mark('traffic:1:load:fetch-start:4');
  assert.ok(getBootTimingEntries().length >= 3);

  clearBootTimingEntries();

  assert.equal(getBootTimingEntries().length, 0);
  assert.equal(performance.getEntriesByName('traffic:1:load:fetch-start:4', 'mark').length, 1,
    'a sibling namespace must survive our teardown');
  performance.clearMarks('traffic:1:load:fetch-start:4');
});

test('a full emitted boot shapes into a report with no missing spans', () => {
  // Emit every instant a share-less boot produces, in order.
  for (const instant of [
    BOOT_MARKS.MODULE_EVAL, BOOT_MARKS.INIT_START, BOOT_MARKS.VIEWER_CREATED,
    BOOT_MARKS.PHOTOREAL_START, BOOT_MARKS.PHOTOREAL_END,
    BOOT_MARKS.MAPSTACK_START, BOOT_MARKS.MAPSTACK_END,
    BOOT_MARKS.UI_START, BOOT_MARKS.UI_END, BOOT_MARKS.DATA_REGISTERED,
    BOOT_MARKS.FIRST_FRAME, BOOT_MARKS.VIEW_READY, BOOT_MARKS.SPLASH_HIDDEN,
  ]) markBoot(instant);
  finalizeBootTiming();

  const report = shapeBootReport(getBootTimingEntries());
  assert.deepEqual(report.missing, [], 'a share-less boot has no required gaps');
  const required = BOOT_PHASES.filter((spec) => !spec.optional).length;
  assert.equal(report.phases.length, required);
  assert.ok(report.totals.splash >= 0);
  assert.ok(report.totals.interactive >= 0);
  assert.ok(report.instants['first-frame'] > 0);
});

test('getBootTimingDiagnostics reports the budget without needing the buffer', () => {
  const before = getBootTimingDiagnostics();
  assert.equal(before.marksEmitted, 0);
  assert.equal(before.maxMarks, BOOT_TIMING_MAX_MARKS);
  markBoot(BOOT_MARKS.INIT_START);
  assert.equal(getBootTimingDiagnostics().marksEmitted, 1);
});
