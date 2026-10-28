import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOOT_LAYER_PHASES,
  BOOT_MARKS,
  BOOT_PHASES,
  BOOT_TIMING_PREFIX,
  BOOT_TOTALS,
  bootLayerMarkName,
  parseBootMarkName,
  shapeBootReport,
  summarizeBootRuns,
} from './bootTimingReport.js';

const mark = (name, startTime, detail) => ({ name, startTime, entryType: 'mark', detail });
const measure = (name, duration, detail) => ({ name, startTime: 0, duration, entryType: 'measure', detail });

/** A report with every required span present, so `missing` is empty. */
function completeEntries() {
  const entries = [mark(`${BOOT_TIMING_PREFIX}module-eval`, 120)];
  for (const spec of BOOT_PHASES) {
    if (spec.optional) continue;
    entries.push(measure(`${BOOT_TIMING_PREFIX}phase:${spec.phase}`, 10, {
      boot: true, phase: spec.phase, deliberate: Boolean(spec.deliberate), decisionRef: spec.decisionRef ?? null,
    }));
  }
  for (const spec of BOOT_TOTALS) {
    entries.push(measure(`${BOOT_TIMING_PREFIX}total:${spec.total}`, 900));
  }
  return entries;
}

test('parseBootMarkName classifies each shape in the namespace', () => {
  assert.deepEqual(parseBootMarkName('boot:init-start'), { kind: 'instant', instant: 'init-start' });
  assert.deepEqual(parseBootMarkName('boot:phase:ui'), { kind: 'phase', phase: 'ui' });
  assert.deepEqual(parseBootMarkName('boot:total:splash'), { kind: 'total', total: 'splash' });
  assert.deepEqual(parseBootMarkName('boot:layer:cctv:3:enable'), {
    kind: 'layer', layerId: 'cctv', intentEpoch: 3, phase: 'enable',
  });
});

test('parseBootMarkName rejects anything outside the namespace or malformed within it', () => {
  // Another namespace's entries must never be read as ours — trafficTiming
  // writes into the same buffer.
  assert.equal(parseBootMarkName('traffic:1:load:fetch-start:4'), null);
  assert.equal(parseBootMarkName('boot:'), null);
  assert.equal(parseBootMarkName('boot:layer:cctv:3'), null, 'a layer mark needs all three parts');
  assert.equal(parseBootMarkName('boot:layer:cctv:notanumber:enable'), null);
  assert.equal(parseBootMarkName('boot:layer::3:enable'), null, 'an empty segment is malformed');
  assert.equal(parseBootMarkName('boot:phase:ui:extra'), null);
  assert.equal(parseBootMarkName(''), null);
  assert.equal(parseBootMarkName(undefined), null);
  assert.equal(parseBootMarkName(42), null);
});

test('bootLayerMarkName round-trips through the parser for every tracked phase', () => {
  for (const phase of BOOT_LAYER_PHASES) {
    const name = bootLayerMarkName('ais-live-vessels', 7, phase);
    assert.deepEqual(parseBootMarkName(name), {
      kind: 'layer', layerId: 'ais-live-vessels', intentEpoch: 7, phase,
    });
  }
});

test('BOOT_LAYER_PHASES covers the manager\'s own six phases plus the queue wait', () => {
  // These six strings are literals in manager.js's _doToggle; the seventh is
  // the intent record's initial phase. A rename there must break here.
  for (const phase of ['resolve', 'init', 'params', 'enable', 'update', 'settle', 'queued']) {
    assert.ok(BOOT_LAYER_PHASES.includes(phase), `${phase} must be tracked`);
  }
  assert.equal(BOOT_LAYER_PHASES.length, 7);
});

test('every phase and total spec names marks that exist in BOOT_MARKS', () => {
  const instants = new Set(Object.values(BOOT_MARKS));
  for (const spec of [...BOOT_PHASES, ...BOOT_TOTALS]) {
    if (!spec.fromOrigin) assert.ok(instants.has(spec.start), `${spec.start} must be a known mark`);
    assert.ok(instants.has(spec.end), `${spec.end} must be a known mark`);
  }
});

test('exactly one phase is anchored at timeOrigin, because only one can be', () => {
  const fromOrigin = BOOT_PHASES.filter((spec) => spec.fromOrigin);
  assert.equal(fromOrigin.length, 1);
  assert.equal(fromOrigin[0].phase, 'eager-eval');
  assert.equal(fromOrigin[0].end, BOOT_MARKS.MODULE_EVAL);
});

test('shapeBootReport orders phase rows by the spec, not by arrival', () => {
  const entries = completeEntries().reverse();
  const report = shapeBootReport(entries);
  const expected = BOOT_PHASES.filter((spec) => !spec.optional).map((spec) => spec.phase);
  assert.deepEqual(report.phases.map((row) => row.phase), expected);
});

test('shapeBootReport carries deliberate + decisionRef through to the row', () => {
  const report = shapeBootReport([
    measure('boot:phase:photoreal', 310, { deliberate: true, decisionRef: '2026-10-05' }),
  ]);
  const row = report.phases.find((entry) => entry.phase === 'photoreal');
  assert.equal(row.ms, 310);
  assert.equal(row.deliberate, true);
  assert.equal(row.decisionRef, '2026-10-05');
});

test('a phase with no detail is reported as not deliberate rather than unknown', () => {
  const report = shapeBootReport([measure('boot:phase:ui', 42)]);
  const row = report.phases.find((entry) => entry.phase === 'ui');
  assert.equal(row.deliberate, false);
  assert.equal(row.decisionRef, null);
});

test('a required phase that never fired is named in missing, not silently dropped', () => {
  const entries = completeEntries().filter((entry) => entry.name !== 'boot:phase:ui');
  const report = shapeBootReport(entries);
  assert.deepEqual(report.missing, ['boot:phase:ui']);
  assert.ok(!report.phases.some((row) => row.phase === 'ui'));
});

test('optional share phases are absent-but-fine on a boot with no share hash', () => {
  const report = shapeBootReport(completeEntries());
  assert.deepEqual(report.missing, []);
});

test('with requireShareRestore the same absence becomes a reported gap', () => {
  const report = shapeBootReport(completeEntries(), { requireShareRestore: true });
  assert.deepEqual(report.missing.sort(), [
    'boot:phase:layer-restore', 'boot:phase:share-camera', 'boot:phase:share-wait',
  ]);
});

test('layer rows span first to last phase stamp and sort slowest first', () => {
  const report = shapeBootReport([
    mark(bootLayerMarkName('cctv', 1, 'queued'), 100),
    mark(bootLayerMarkName('cctv', 1, 'resolve'), 180),
    mark(bootLayerMarkName('cctv', 1, 'settle'), 400),
    mark(bootLayerMarkName('radio', 2, 'queued'), 100),
    mark(bootLayerMarkName('radio', 2, 'settle'), 150),
  ]);
  assert.deepEqual(report.layers.map((layer) => layer.layerId), ['cctv', 'radio']);
  assert.equal(report.layers[0].totalMs, 300);
  assert.equal(report.layers[1].totalMs, 50);
  // The queue wait must stay separable from the module parse cost.
  assert.equal(report.layers[0].phases.resolve - report.layers[0].phases.queued, 80);
});

test('a layer seen in exactly one phase reports 0 rather than NaN', () => {
  const report = shapeBootReport([mark(bootLayerMarkName('traffic', 1, 'queued'), 100)]);
  assert.equal(report.layers[0].totalMs, 0);
});

test('shapeBootReport tolerates junk input without throwing', () => {
  for (const input of [undefined, null, 'nope', 7, [null, {}, { name: 42 }]]) {
    const report = shapeBootReport(input);
    assert.ok(Array.isArray(report.phases));
    assert.ok(Array.isArray(report.layers));
  }
});

test('summarizeBootRuns takes the median, per docs/PERFORMANCE.md\'s own control', () => {
  const runs = [300, 100, 200].map((ms) => shapeBootReport([measure('boot:total:splash', ms)]));
  const summary = summarizeBootRuns(runs);
  assert.equal(summary.totals.splash.median, 200, 'median, not the 200 mean coincidence');
  assert.equal(summary.totals.splash.min, 100);
  assert.equal(summary.totals.splash.max, 300);
  assert.equal(summary.totals.splash.n, 3);
  assert.equal(summary.n, 3);
});

test('summarizeBootRuns averages the middle pair on an even sample count', () => {
  const runs = [10, 20, 30, 100].map((ms) => shapeBootReport([measure('boot:total:splash', ms)]));
  assert.equal(summarizeBootRuns(runs).totals.splash.median, 25);
});

test('summarizeBootRuns keeps the deliberate label on the aggregate row', () => {
  const runs = [1500, 1502].map((ms) => shapeBootReport([
    measure('boot:phase:share-wait', ms, { deliberate: true, decisionRef: '2026-10-08' }),
  ]));
  const row = summarizeBootRuns(runs).phases['share-wait'];
  assert.equal(row.median, 1501);
  assert.equal(row.deliberate, true, 'a label that survives one run but not the aggregate is useless');
  assert.equal(row.decisionRef, '2026-10-08');
});

test('summarizeBootRuns unions missing marks across runs', () => {
  const summary = summarizeBootRuns([
    { phases: [], totals: {}, layers: [], missing: ['boot:phase:ui'] },
    { phases: [], totals: {}, layers: [], missing: ['boot:phase:ui', 'boot:total:splash'] },
  ]);
  assert.deepEqual(summary.missing.sort(), ['boot:phase:ui', 'boot:total:splash']);
});

test('summarizeBootRuns handles no runs and junk without throwing', () => {
  for (const input of [[], undefined, null, [null, undefined]]) {
    const summary = summarizeBootRuns(input);
    assert.deepEqual(summary.phases, {});
    assert.deepEqual(summary.totals, {});
  }
});
