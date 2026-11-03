/**
 * The `boot:` User Timing vocabulary, and the pure functions that turn a raw
 * entry list into a readable report.
 *
 * Split from `bootTiming.js` (which owns the emitting side and touches the
 * real `performance` object) so everything here is callable under `node:test`
 * against hand-built entry arrays — no browser, no viewer, no Cesium.
 *
 * The phase table below is the single source of truth for mark names: the
 * emitter derives its measures from it and the harness derives its expected
 * rows from it, so a renamed mark cannot drift between the two.
 *
 * WHY SOME PHASES CARRY `deliberate`/`decisionRef`: several of the slowest
 * windows in a boot are recorded decisions, not defects — the share-restore
 * hold and its camera flight (DECISIONS 2026-10-29, which lowered both after
 * this instrumentation measured them; see `shareRestoreTiming.js`) and the
 * photoreal tileset await (DECISIONS 2026-10-05). Labelling them at the
 * source means a report row reads `share-wait 501 ms (deliberate — DECISIONS
 * 2026-10-29)`, so the number stays visible without inviting anyone to
 * re-litigate a landed decision from a table row.
 *
 * `deliberate` means "chosen, with a recorded reason" — NOT "untouchable". The
 * 2026-10-08 values carried this label and were still lowered once measured;
 * what the label buys is that lowering them required reading the reason first.
 *
 * @module bootTimingReport
 */

export const BOOT_TIMING_PREFIX = 'boot:';

/** Boot instants, as mark-name suffixes. `boot:` + the value is the mark name. */
export const BOOT_MARKS = Object.freeze({
  MODULE_EVAL: 'module-eval',
  INIT_START: 'init-start',
  VIEWER_CREATED: 'viewer-created',
  PHOTOREAL_START: 'photoreal-start',
  PHOTOREAL_END: 'photoreal-end',
  MAPSTACK_START: 'mapstack-start',
  MAPSTACK_END: 'mapstack-end',
  UI_START: 'ui-start',
  UI_END: 'ui-end',
  DATA_REGISTERED: 'data-registered',
  SHARE_ARMED: 'share-armed',
  SHARE_FIRED: 'share-fired',
  SHARE_CAMERA_SETTLED: 'share-camera-settled',
  LAYERS_RESTORED: 'layers-restored',
  FIRST_FRAME: 'first-frame',
  VIEW_READY: 'view-ready',
  SPLASH_HIDDEN: 'splash-hidden',
});

/**
 * Measures derived from pairs of instants. `optional: true` means the window
 * genuinely does not exist on every boot (the share phases only run when the
 * URL carries a share hash), so its absence is not a gap.
 */
export const BOOT_PHASES = Object.freeze([
  // `fromOrigin` anchors the span at `performance.timeOrigin` instead of a
  // mark, because the thing being measured is everything that happened BEFORE
  // the first line of our own code could run: HTML parse, the blocking Cesium
  // script, and the eager evaluation of the entry chunk's whole import graph.
  // There is no mark to put at the start of that — the mark that ends it is
  // the earliest one we are able to emit.
  Object.freeze({ phase: 'eager-eval', fromOrigin: true, end: 'module-eval' }),
  Object.freeze({ phase: 'bootstrap', start: 'module-eval', end: 'init-start' }),
  Object.freeze({ phase: 'viewer', start: 'init-start', end: 'viewer-created' }),
  Object.freeze({
    phase: 'photoreal', start: 'photoreal-start', end: 'photoreal-end',
    deliberate: true, decisionRef: '2026-10-05',
  }),
  Object.freeze({ phase: 'mapstack', start: 'mapstack-start', end: 'mapstack-end' }),
  Object.freeze({ phase: 'ui', start: 'ui-start', end: 'ui-end' }),
  Object.freeze({ phase: 'data-registration', start: 'ui-end', end: 'data-registered' }),
  Object.freeze({
    phase: 'share-wait', start: 'share-armed', end: 'share-fired', optional: true,
    deliberate: true, decisionRef: '2026-10-29',
  }),
  Object.freeze({
    phase: 'share-camera', start: 'share-fired', end: 'share-camera-settled', optional: true,
    deliberate: true, decisionRef: '2026-10-29',
  }),
  Object.freeze({
    phase: 'layer-restore', start: 'share-camera-settled', end: 'layers-restored',
    optional: true,
  }),
]);

/** Whole-boot spans. `interactive` closes earlier than `splash` by design. */
export const BOOT_TOTALS = Object.freeze([
  Object.freeze({ total: 'interactive', start: 'module-eval', end: 'view-ready' }),
  Object.freeze({ total: 'splash', start: 'module-eval', end: 'splash-hidden' }),
]);

/** The six lifecycle phases `manager.js` already tracks, plus the queue wait. */
export const BOOT_LAYER_PHASES = Object.freeze([
  'queued', 'resolve', 'init', 'params', 'enable', 'update', 'settle',
]);

/** Build the mark name for a layer lifecycle phase. */
export function bootLayerMarkName(layerId, intentEpoch, phase) {
  return `${BOOT_TIMING_PREFIX}layer:${layerId}:${intentEpoch}:${phase}`;
}

/**
 * Classify one `boot:`-prefixed entry name.
 *
 * The grammar is deliberately shallow so this stays a pure string function:
 * the second segment being the literal `layer`/`phase`/`total` is what
 * distinguishes those from a plain instant. No boot instant is named any of
 * those three words, and no layer id contains a colon.
 *
 * @param {string} name
 * @returns {{kind:'instant'|'layer'|'phase'|'total', instant?:string, layerId?:string,
 *   intentEpoch?:number, phase?:string, total?:string}|null} `null` for anything
 *   outside the namespace or malformed within it.
 */
export function parseBootMarkName(name) {
  if (typeof name !== 'string' || !name.startsWith(BOOT_TIMING_PREFIX)) return null;
  const parts = name.slice(BOOT_TIMING_PREFIX.length).split(':');
  if (parts.some((part) => part === '')) return null;
  const [head, ...rest] = parts;
  if (head === 'layer') {
    if (rest.length !== 3) return null;
    const intentEpoch = Number(rest[1]);
    if (!Number.isInteger(intentEpoch)) return null;
    return { kind: 'layer', layerId: rest[0], intentEpoch, phase: rest[2] };
  }
  if (head === 'phase') {
    return rest.length === 1 ? { kind: 'phase', phase: rest[0] } : null;
  }
  if (head === 'total') {
    return rest.length === 1 ? { kind: 'total', total: rest[0] } : null;
  }
  return rest.length === 0 ? { kind: 'instant', instant: head } : null;
}

/** Pick the numeric duration off an entry, tolerating a mark (no duration). */
function entryDuration(entry) {
  const duration = Number(entry?.duration);
  return Number.isFinite(duration) ? duration : 0;
}

/**
 * Shape a raw entry list (marks + measures, as `getEntriesByType` returns
 * them) into a report.
 *
 * `missing` is the honesty mechanism: a required phase that never fired is
 * named rather than silently omitted, so a report cannot look complete while
 * hiding a window that failed to open.
 *
 * @param {Array<{name:string, startTime?:number, duration?:number, detail?:Object}>} entries
 * @param {{requireShareRestore?:boolean}} [options] When true, the share and
 *   layer-restore phases count as required — use it for the reload-with-hash
 *   capture, where their absence means the restore path did not run.
 * @returns {{phases:Array, layers:Array, totals:Object, instants:Object, missing:Array<string>}}
 */
export function shapeBootReport(entries, { requireShareRestore = false } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const instants = {};
  const phaseRows = new Map();
  const totals = {};
  const layers = new Map();

  for (const entry of list) {
    const parsed = parseBootMarkName(entry?.name);
    if (!parsed) continue;
    if (parsed.kind === 'instant') {
      instants[parsed.instant] = Number(entry.startTime) || 0;
    } else if (parsed.kind === 'phase') {
      phaseRows.set(parsed.phase, {
        phase: parsed.phase,
        ms: entryDuration(entry),
        deliberate: Boolean(entry.detail?.deliberate),
        decisionRef: entry.detail?.decisionRef ?? null,
      });
    } else if (parsed.kind === 'total') {
      totals[parsed.total] = entryDuration(entry);
    } else {
      const layer = layers.get(parsed.layerId)
        || { layerId: parsed.layerId, intentEpoch: parsed.intentEpoch, phases: {}, totalMs: 0 };
      layer.phases[parsed.phase] = Number(entry.startTime) || 0;
      layers.set(parsed.layerId, layer);
    }
  }

  for (const layer of layers.values()) {
    const stamps = Object.values(layer.phases);
    layer.totalMs = stamps.length > 1 ? Math.max(...stamps) - Math.min(...stamps) : 0;
  }

  const missing = [];
  for (const spec of BOOT_PHASES) {
    if (phaseRows.has(spec.phase)) continue;
    if (spec.optional && !requireShareRestore) continue;
    missing.push(`${BOOT_TIMING_PREFIX}phase:${spec.phase}`);
  }
  for (const spec of BOOT_TOTALS) {
    if (!(spec.total in totals)) missing.push(`${BOOT_TIMING_PREFIX}total:${spec.total}`);
  }

  return {
    phases: BOOT_PHASES.map((spec) => phaseRows.get(spec.phase)).filter(Boolean),
    layers: [...layers.values()].sort((a, b) => b.totalMs - a.totalMs),
    totals,
    instants,
    missing,
  };
}

/** Median of a numeric list. Returns `null` for an empty list. */
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Aggregate N reports from `shapeBootReport` into per-key statistics.
 *
 * Median rather than mean, because `docs/PERFORMANCE.md` already specifies
 * "compare medians" as the control for a capture on this page — the
 * aggregator honors the page's own stated method instead of inventing one.
 *
 * @param {Array<ReturnType<typeof shapeBootReport>>} reports
 * @returns {{n:number, phases:Object, totals:Object, layers:Object, missing:Array<string>}}
 */
export function summarizeBootRuns(reports) {
  const list = Array.isArray(reports) ? reports.filter(Boolean) : [];
  const collect = (samples) => {
    const stats = {};
    for (const [key, values] of samples) {
      if (!values.length) continue;
      stats[key] = { median: median(values), min: Math.min(...values), max: Math.max(...values), n: values.length };
    }
    return stats;
  };
  const push = (map, key, value) => {
    if (!Number.isFinite(value)) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };

  const phaseSamples = new Map();
  const totalSamples = new Map();
  const layerSamples = new Map();
  const labels = new Map();
  const missing = new Set();

  for (const report of list) {
    for (const row of report.phases || []) {
      push(phaseSamples, row.phase, row.ms);
      labels.set(row.phase, { deliberate: Boolean(row.deliberate), decisionRef: row.decisionRef ?? null });
    }
    for (const [key, value] of Object.entries(report.totals || {})) push(totalSamples, key, value);
    for (const layer of report.layers || []) push(layerSamples, layer.layerId, layer.totalMs);
    for (const name of report.missing || []) missing.add(name);
  }

  const phases = collect(phaseSamples);
  for (const [key, label] of labels) {
    if (phases[key]) Object.assign(phases[key], label);
  }

  return {
    n: list.length,
    phases,
    totals: collect(totalSamples),
    layers: collect(layerSamples),
    missing: [...missing],
  };
}
