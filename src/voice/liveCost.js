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
  let warned = false;
  let capped = false;

  const totalUsd = () => estimateLiveCostUsd(seconds, ratePerMin);
  const snapshot = (warnCrossed = false, capCrossed = false) => ({
    tier: 'live',
    modelId,
    ratePerMin,
    perMinute: true,
    seconds,
    totalUsd: totalUsd(),
    warnUsd: limits.warnUsd,
    capUsd: limits.capUsd,
    /** 'ok' | 'warn' | 'cap' — monotonic; never steps back down. */
    level: capped ? 'cap' : warned ? 'warn' : 'ok',
    warnCrossed,
    capCrossed,
    capReached: capped,
    display: formatCostUsd(totalUsd()),
    note: `$${ratePerMin.toFixed(2)}/min live audio — the backend model and its tools are billed separately.`,
  });

  return {
    ratePerMin,
    limits,
    recordSeconds(totalSeconds) {
      const next = Number(totalSeconds);
      if (Number.isFinite(next) && next > seconds) seconds = next;
      const usd = totalUsd();
      let warnCrossed = false;
      let capCrossed = false;
      if (!warned && usd >= limits.warnUsd) { warned = true; warnCrossed = true; }
      if (!capped && usd >= limits.capUsd) { capped = true; capCrossed = true; }
      return snapshot(warnCrossed, capCrossed);
    },
    state: () => snapshot(),
    reset() { seconds = 0; warned = false; capped = false; return snapshot(); },
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
  const advance = (seconds) => {
    const state = tracker.recordSeconds(seconds);
    syncUi();
    if (state.capCrossed && !capFired) { capFired = true; onCap?.(state); }
    return state;
  };

  return {
    tracker,
    state: () => tracker.state(),
    syncUi,
    recordSeconds: advance,
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
