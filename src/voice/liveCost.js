// src/voice/liveCost.js
/**
 * GPT-Live (`gpt-live-1`) per-MINUTE session cost meter.
 *
 * The OpenAI Realtime meter (`voiceCost.js`) prices per-TOKEN off each
 * `response.done` usage object. GPT-Live bills differently — a flat **$0.05 per
 * minute of live audio, charged per second** (the delegated backend model and
 * the tools it calls are billed separately, which this meter does NOT try to
 * estimate) — so it needs its own tracker rather than a tier in that registry.
 *
 * Pure with respect to pricing + threshold latching (`createLiveCostTracker`),
 * with a thin DOM painter (`paintLiveCostUi`) and a wall-clock meter wrapper
 * (`createLiveCostMeter`) that the controller delegates to so `gevLiveSession.js`
 * stays focused on transport. Formatting and the spend-limit normaliser are
 * reused from `voiceCost.js` so the readout and caps match the other backends.
 *
 * @module voice/liveCost
 */

import { formatCostUsd, normalizeCostLimits, VOICE_COST_LIMITS } from './voiceCost.js';

/**
 * ⚠️ VERIFY AT RELEASE — an external price that drifts. Read from OpenAI's
 * GPT-Live pricing on 2026-10-29: $0.05 per minute of live audio, billed per
 * second (not rounded up). A wrong rate silently mis-sizes the spend cap.
 */
export const LIVE_VOICE_RATES_VERIFIED_ON = '2026-10-29';
export const LIVE_VOICE_MODEL_ID = 'gpt-live-1';
export const LIVE_VOICE_RATE_PER_MIN = 0.05;

/**
 * Screenshot-reader (`gpt-5.6-luna`, behind /api/live/vision) token pricing,
 * read the same day: $0.20 per 1M input tokens, $1.20 per 1M output tokens. The
 * reader is a separate one-shot call billed per-token, not part of the
 * per-minute audio stream — but a "what am I looking at" read is still real
 * spend on this session, so it is folded into the SAME meter via `recordExtraUsd`.
 */
export const VISION_READER_MODEL_ID = 'gpt-5.6-luna';
export const VISION_RATE_IN_PER_MTOK = 0.2;
export const VISION_RATE_OUT_PER_MTOK = 1.2;
// Fallback when the Responses call returns no usage object: a documented ~1080p
// read is ≈$0.0005, so a read is never silently counted as free.
export const VISION_READ_FALLBACK_USD = 0.0005;

const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * USD for a run of live audio. Total, not incremental — a non-finite or
 * non-positive duration/rate bills $0 rather than NaN.
 * @param {number} seconds
 * @param {number} [ratePerMin]
 * @returns {number}
 */
export function estimateLiveCostUsd(seconds, ratePerMin = LIVE_VOICE_RATE_PER_MIN) {
  const s = Number(seconds);
  const r = Number(ratePerMin);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(r) || r <= 0) return 0;
  return (s / 60) * r;
}

/**
 * USD for one screenshot-reader call from its Responses `usage`. Tolerates the
 * two common field spellings; missing/junk counts bill $0 (the caller supplies
 * its own fallback). Pure.
 * @param {{input_tokens?: number, output_tokens?: number, prompt_tokens?: number, completion_tokens?: number}} [usage]
 * @param {{inPerMTok?: number, outPerMTok?: number}} [rates]
 * @returns {number}
 */
export function estimateVisionCostUsd(usage, rates = {}) {
  const rin = positive(rates.inPerMTok, VISION_RATE_IN_PER_MTOK);
  const rout = positive(rates.outPerMTok, VISION_RATE_OUT_PER_MTOK);
  const inTok = Number(usage?.input_tokens ?? usage?.prompt_tokens);
  const outTok = Number(usage?.output_tokens ?? usage?.completion_tokens);
  const i = Number.isFinite(inTok) && inTok > 0 ? inTok : 0;
  const o = Number.isFinite(outTok) && outTok > 0 ? outTok : 0;
  return (i / 1e6) * rin + (o / 1e6) * rout;
}

/**
 * Accumulate elapsed live-audio seconds into a running USD total and latch the
 * warn/cap crossings exactly once each, mirroring the Realtime tracker's
 * snapshot shape so the same UI painter can read either.
 *
 * `recordSeconds` takes the TOTAL elapsed seconds (not a delta) and is
 * monotonic: a smaller value (a late or duplicate usage event) never rolls the
 * meter backward.
 *
 * @param {{ratePerMin?: number, modelId?: string,
 *          limits?: {warnUsd?: number, capUsd?: number}}} [options]
 */
export function createLiveCostTracker(options = {}) {
  const ratePerMin = positive(options.ratePerMin, LIVE_VOICE_RATE_PER_MIN);
  const modelId = options.modelId || LIVE_VOICE_MODEL_ID;
  const limits = normalizeCostLimits(options.limits || VOICE_COST_LIMITS);

  let seconds = 0;
  // Per-token spend from screenshot-reader calls, summed separately from the
  // per-minute audio total but counted into the same running USD + caps.
  let extrasUsd = 0;
  let warned = false;
  let capped = false;

  const totalUsd = () => estimateLiveCostUsd(seconds, ratePerMin) + extrasUsd;
  const snapshot = (warnCrossed = false, capCrossed = false) => ({
    tier: 'live',
    modelId,
    ratePerMin,
    perMinute: true,
    seconds,
    extrasUsd,
    totalUsd: totalUsd(),
    warnUsd: limits.warnUsd,
    capUsd: limits.capUsd,
    /** 'ok' | 'warn' | 'cap' — monotonic; never steps back down. */
    level: capped ? 'cap' : warned ? 'warn' : 'ok',
    warnCrossed,
    capCrossed,
    capReached: capped,
    display: formatCostUsd(totalUsd()),
    note: `$${ratePerMin.toFixed(2)}/min live audio plus any screenshot-reader calls — the delegated backend model is billed separately.`,
  });

  // Re-latch warn/cap off the current total and snapshot. Shared by both inputs
  // (elapsed audio seconds and reader extras) so a cap can trip from either.
  const evaluate = () => {
    const usd = totalUsd();
    let warnCrossed = false;
    let capCrossed = false;
    if (!warned && usd >= limits.warnUsd) { warned = true; warnCrossed = true; }
    if (!capped && usd >= limits.capUsd) { capped = true; capCrossed = true; }
    return snapshot(warnCrossed, capCrossed);
  };

  return {
    ratePerMin,
    limits,
    recordSeconds(totalSeconds) {
      const next = Number(totalSeconds);
      if (Number.isFinite(next) && next > seconds) seconds = next;
      return evaluate();
    },
    /** Add a one-off per-token charge (e.g. a screenshot read). Ignores junk. */
    recordExtraUsd(usd) {
      const add = Number(usd);
      if (Number.isFinite(add) && add > 0) extrasUsd += add;
      return evaluate();
    },
    state: () => snapshot(),
    reset() { seconds = 0; extrasUsd = 0; warned = false; capped = false; return snapshot(); },
  };
}

/**
 * Paint the shared cost readout (`#gev-voice-cost-value`) from a tracker state.
 * No-op when there is no `ui.costValue` (e.g. headless tests).
 * @param {object|null} ui
 * @param {object} state A `createLiveCostTracker` snapshot.
 */
export function paintLiveCostUi(ui, state) {
  if (!ui?.costValue) return;
  ui.costValue.textContent = state.display;
  ui.costValue.dataset.level = state.level;
  ui.costValue.title =
    `Estimated session cost on ${state.modelId} — $${state.ratePerMin.toFixed(2)}/min live audio, ` +
    `${Math.round(state.seconds)}s elapsed. Warns at ${formatCostUsd(state.warnUsd)}, ` +
    `ends the session at ${formatCostUsd(state.capUsd)}. ${state.note}`;
}

/**
 * Wall-clock meter the controller delegates to. `start()` resets and begins a
 * 1 s repaint tick; `recordSeconds()` folds in an authoritative server duration
 * (from `session.usage.updated`) on top of the wall-clock estimate; `onCap`
 * fires once when the hard cap is crossed so the controller can end the session.
 *
 * Browser timer/clock are injected (defaulting to real globals) for tests; the
 * default `setInterval` is unref'd where supported so a forgotten meter never
 * keeps a Node test process alive.
 *
 * @param {object} params
 * @param {object|null} [params.ui]
 * @param {object} [params.limits]
 * @param {number} [params.ratePerMin]
 * @param {string} [params.modelId]
 * @param {(state: object) => void} [params.onCap]
 * @param {() => number} [params.now]
 * @param {(fn: Function, ms: number) => any} [params.setIntervalFn]
 * @param {(id: any) => void} [params.clearIntervalFn]
 */
export function createLiveCostMeter({
  ui = null,
  limits,
  ratePerMin,
  modelId,
  onCap,
  now = () => Date.now(),
  setIntervalFn,
  clearIntervalFn,
} = {}) {
  const tracker = createLiveCostTracker({ ratePerMin, modelId, limits });
  const si = setIntervalFn || ((fn, ms) => { const id = setInterval(fn, ms); id?.unref?.(); return id; });
  const ci = clearIntervalFn || ((id) => clearInterval(id));
  let timer = null;
  let startMs = 0;
  let capFired = false;

  const syncUi = () => paintLiveCostUi(ui, tracker.state());
  const applyState = (state) => {
    syncUi();
    if (state.capCrossed && !capFired) { capFired = true; onCap?.(state); }
    return state;
  };
  const advance = (seconds) => applyState(tracker.recordSeconds(seconds));

  return {
    tracker,
    state: () => tracker.state(),
    syncUi,
    recordSeconds: advance,
    /** Fold a screenshot-reader charge into the meter (repaints + cap check). */
    recordExtraUsd: (usd) => applyState(tracker.recordExtraUsd(usd)),
    start() {
      capFired = false;
      tracker.reset();
      startMs = now();
      syncUi();
      timer = si(() => advance((now() - startMs) / 1000), 1000);
    },
    stop() {
      if (timer != null) { ci(timer); timer = null; }
    },
  };
}
