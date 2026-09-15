// src/voice/claudeVoiceCost.js
/**
 * Claude model registry + Messages API cost estimation for the Claude/Web
 * Speech voice backend (see docs/CURRENT-STATE.md's Voice Control section).
 *
 * Pure module (no DOM, no network, no imports) so it can be shared by three
 * callers that cannot share anything else:
 *   1. the browser voice UI (`gevClaudeVoice.js`) — live "~$0.03" readout + caps
 *   2. the dev-server proxy (`vite.config.js` → `/api/anthropic/messages`)
 *   3. unit tests (`claudeVoiceCost.test.mjs`)
 *
 * This module mirrors `voiceCost.js`'s shape (tiers, spend guard, tracker) on
 * purpose, so the two backends' cost UI behaves identically to the user. The
 * one structural difference: Claude never sees audio. Speech-to-text and
 * text-to-speech both happen in the browser via the Web Speech API, so Claude
 * is billed for TEXT tokens only — no audio/image rate tiers exist here.
 *
 * @module voice/claudeVoiceCost
 */

/* ------------------------------------------------------------------ *
 * MODEL REGISTRY
 * ------------------------------------------------------------------ */

/**
 * ⚠️ VERIFY AT RELEASE — MODEL IDS AND PRICES ARE EXTERNAL FACTS THAT DRIFT. ⚠️
 *
 * Both model ids and every rate below were read from Anthropic's own model +
 * pricing pages on 2026-09-15:
 *   - https://platform.claude.com/docs/en/about-claude/models/overview
 *   - https://platform.claude.com/docs/en/about-claude/pricing
 *
 * Cross-check at release time (a wrong rate silently mis-sizes the spend cap,
 * and a wrong model id fails the request at call time):
 *   - `standard` MUST stay in sync with ANTHROPIC_VOICE_MODEL / the
 *     ANTHROPIC_VOICE_MODEL_DEFAULT constant in vite.config.js.
 *   - `pro` MUST stay in sync with ANTHROPIC_VOICE_MODEL_PRO likewise.
 *
 * Rates are USD per 1,000,000 tokens (base input / output; prompt-cache
 * write/read rates are not modeled here — this backend does not use
 * `cache_control`, since a short conversational window has little to cache).
 */
export const VOICE_MODEL_RATES_VERIFIED_ON = '2026-09-15';

/** @typedef {'standard'|'pro'} ClaudeVoiceModelTier */

export const VOICE_MODELS = Object.freeze({
  standard: Object.freeze({
    tier: 'standard',
    id: 'claude-haiku-4-5-20251001',
    label: 'STANDARD',
    /** USD per 1M tokens — Claude Haiku 4.5. */
    rates: Object.freeze({
      textInput: 1,
      textOutput: 5,
    }),
  }),
  pro: Object.freeze({
    tier: 'pro',
    id: 'claude-sonnet-5',
    label: 'PRO',
    /** USD per 1M tokens — Claude Sonnet 5. */
    rates: Object.freeze({
      textInput: 2,
      textOutput: 10,
    }),
  }),
});

/** The tier used when nothing (or nonsense) was requested. */
export const DEFAULT_VOICE_TIER = 'standard';

/** Every tier name the UI and the proxy accept. */
export const VOICE_TIERS = Object.freeze(Object.keys(VOICE_MODELS));

/**
 * Map a requested tier name to its model entry, falling back to `standard`.
 *
 * Deliberately total: an unknown, empty, non-string, or hostile value resolves
 * to the default rather than throwing, so a bad querystring degrades to the
 * normal session instead of breaking the mic. Callers that need to know a
 * fallback happened compare `entry.tier` to what they asked for.
 *
 * @param {unknown} tier
 * @returns {{tier: ClaudeVoiceModelTier, id: string, label: string, rates: object}}
 */
export function resolveVoiceModel(tier) {
  // Own-property check, NOT `VOICE_MODELS[key] || default`: inherited keys
  // ('constructor', 'toString', '__proto__') resolve to truthy Object.prototype
  // members, which would sail past a `||` fallback and hand the proxy a bogus
  // entry whose `.id` is undefined.
  return isKnownVoiceTier(tier)
    ? VOICE_MODELS[String(tier).trim().toLowerCase()]
    : VOICE_MODELS[DEFAULT_VOICE_TIER];
}

/** True only for a tier name this build knows (own properties only). */
export function isKnownVoiceTier(tier) {
  const key = typeof tier === 'string' ? tier.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(VOICE_MODELS, key);
}

/**
 * The priciest known rate table, derived (not hardcoded) so it stays correct
 * if the registry gains a tier. Used as the conservative default whenever we
 * do not recognise the model a request actually ran on.
 */
export function mostExpensiveVoiceModel() {
  return Object.values(VOICE_MODELS).reduce((worst, entry) =>
    entry.rates.textOutput > worst.rates.textOutput ? entry : worst
  );
}

/**
 * Resolve the rate table for the model a request ACTUALLY ran on.
 *
 * The tier a client asked for is only a request: `ANTHROPIC_VOICE_MODEL` /
 * `ANTHROPIC_VOICE_MODEL_PRO` can point a tier at any model id, so pricing by
 * tier would silently mis-meter (and overrun the cap) whenever an override is
 * set. Pricing by the id the server echoes back closes that gap.
 *
 * An unrecognised id bills at the most expensive known rates rather than
 * guessing cheap — under-metering is what lets a cap be overrun.
 *
 * @param {unknown} modelId
 * @returns {{tier: string, id: string, label: string, rates: object, recognized: boolean}}
 */
export function resolveVoiceModelById(modelId) {
  const id = typeof modelId === 'string' ? modelId.trim() : '';
  for (const entry of Object.values(VOICE_MODELS)) {
    if (entry.id === id) return { ...entry, recognized: true };
  }
  const worst = mostExpensiveVoiceModel();
  return {
    ...worst,
    // Report the real model so the UI/diagnostics never claim the wrong one.
    id: id || worst.id,
    recognized: false,
  };
}

/* ------------------------------------------------------------------ *
 * SPEND GUARD CONFIG
 * ------------------------------------------------------------------ */

/**
 * Session spend thresholds, in USD. Deliberately generous — this is a runaway
 * guard (a stuck tool loop, a feedback loop), not a budget.
 *
 * `warnUsd`: soft — one visual cue + one console line, session continues.
 * `capUsd`:  hard — the session is closed through the normal stop path.
 *
 * Either may be null/0/Infinity to disable that threshold.
 */
export const VOICE_COST_LIMITS = Object.freeze({
  warnUsd: 2,
  capUsd: 5,
});

/**
 * Serialized sentinel for a disabled threshold.
 *
 * A disabled threshold is Infinity in memory, but `JSON.stringify(Infinity)`
 * is `null`, which reads back as "absent" and silently restores the DEFAULT —
 * so a deliberately disabled cap would quietly re-arm on the next session.
 * Persist this string instead; `normalizeCostLimits` accepts it on the way in.
 */
export const VOICE_COST_LIMIT_OFF = 'off';

/**
 * Normalize a partial limits object against the defaults.
 *
 * Accepted "disabled" spellings: the `'off'` sentinel, Infinity, and a
 * 0/negative number. Absent/undefined/null and unparseable values fall back to
 * the default — a corrupt entry must never disarm the cap.
 */
export function normalizeCostLimits(limits) {
  const clean = (value, fallback) => {
    if (typeof value === 'string' && value.trim().toLowerCase() === VOICE_COST_LIMIT_OFF) {
      return Infinity;
    }
    if (value === Infinity) return Infinity;
    if (value === null || value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return n > 0 ? n : Infinity; // 0/negative = "no threshold"
  };
  return Object.freeze({
    warnUsd: clean(limits?.warnUsd, VOICE_COST_LIMITS.warnUsd),
    capUsd: clean(limits?.capUsd, VOICE_COST_LIMITS.capUsd),
  });
}

/** Convert limits to a JSON-safe shape that round-trips a disabled threshold. */
export function serializeCostLimits(limits) {
  const normalized = normalizeCostLimits(limits);
  const encode = (value) => (Number.isFinite(value) ? value : VOICE_COST_LIMIT_OFF);
  return {
    warnUsd: encode(normalized.warnUsd),
    capUsd: encode(normalized.capUsd),
  };
}

/* ------------------------------------------------------------------ *
 * USAGE → USD
 * ------------------------------------------------------------------ */

const nonNegative = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Estimate the USD cost of one Messages API response's usage.
 *
 * Anthropic's `usage` shape is `{input_tokens, output_tokens, ...cache
 * fields}`. Cache fields are ignored here (see module header — this backend
 * doesn't set `cache_control`); if a response ever reports cache tokens
 * anyway, they are folded into `input_tokens`' billed total by Anthropic
 * already, so no double-count risk exists from leaving them unread.
 *
 * @param {object|null|undefined} usage - `response.usage` from a Messages API reply.
 * @param {object} rates - a `VOICE_MODELS[tier].rates` table (USD per 1M).
 * @returns {number} USD, always finite and >= 0.
 */
export function estimateUsageCostUsd(usage, rates) {
  if (!usage || !rates) return 0;
  const inputTokens = nonNegative(usage.input_tokens);
  const outputTokens = nonNegative(usage.output_tokens);
  const usd =
    (inputTokens * nonNegative(rates.textInput) +
      outputTokens * nonNegative(rates.textOutput)) /
    1_000_000;
  return Number.isFinite(usd) && usd > 0 ? usd : 0;
}

/** Format a running cost for the compact UI readout ("~$0.42"). */
export function formatCostUsd(usd) {
  const n = Number.isFinite(Number(usd)) ? Math.max(0, Number(usd)) : 0;
  if (n > 0 && n < 0.01) return '~$0.01';
  return `~$${n.toFixed(2)}`;
}

/* ------------------------------------------------------------------ *
 * SESSION COST TRACKER (state machine)
 * ------------------------------------------------------------------ */

/**
 * Accumulate per-response usage into a running session cost and latch the two
 * threshold crossings.
 *
 * Each Messages API response's `usage` is PER RESPONSE, not cumulative, so
 * responses sum — including every intermediate tool-loop round-trip (see
 * `gevClaudeVoice.js`'s max-iteration guard for why that loop is bounded).
 *
 * Both crossings are independent one-shot latches: each fires on the first
 * `record()` that carries the total at or past its threshold and never again,
 * so one warning line is logged and the cap stop is requested exactly once —
 * even though `record()` keeps being called while the session tears down.
 *
 * The model binding is fixed at construction and never changes: a tracker
 * belongs to exactly one session, priced against the model that session is
 * actually running on. Pass `modelId` (the id the server echoed back) when it
 * is known — it outranks `tier`, because an env override can point a tier at a
 * different model. `tier` alone is only used before a request exists.
 *
 * @param {{tier?: string, modelId?: string,
 *          limits?: {warnUsd?: number, capUsd?: number}}} [options]
 */
export function createVoiceCostTracker(options = {}) {
  const model = options.modelId
    ? resolveVoiceModelById(options.modelId)
    : { ...resolveVoiceModel(options.tier), recognized: true };
  const limits = normalizeCostLimits(options.limits);

  let totalUsd = 0;
  let responses = 0;
  let warned = false;
  let capped = false;
  let incomplete = false;

  const snapshot = (warnCrossed = false, capCrossed = false) => ({
    tier: model.tier,
    modelId: model.id,
    /** False when the model was unrecognised and billed at worst-case rates. */
    ratesRecognized: model.recognized !== false,
    totalUsd,
    responses,
    warnUsd: limits.warnUsd,
    capUsd: limits.capUsd,
    /** 'ok' | 'warn' | 'cap' — monotonic; never steps back down. */
    level: capped ? 'cap' : warned ? 'warn' : 'ok',
    /** True only on the single record() that crossed the soft threshold. */
    warnCrossed,
    /** True only on the single record() that crossed the hard cap. */
    capCrossed,
    /** True once the cap is latched — the session must be stopped. */
    capReached: capped,
    /**
     * True when at least one billed response never reported usage (the
     * session was torn down mid-response), so the accounting is PARTIAL.
     */
    incomplete,
    /** Compact chip text. The '*' is a see-note mark, NOT a direction claim. */
    display: formatCostUsd(totalUsd) + (incomplete ? '*' : ''),
    /** Prose for the tooltip; null when the accounting is complete. */
    note: incomplete
      ? 'Estimate is incomplete — a response was still in flight when the session ended, so its usage was never reported.'
      : null,
  });

  return {
    model,
    limits,
    /**
     * Fold one response's usage into the session total.
     * @param {object} usage - `response.usage`
     */
    record(usage) {
      const usd = estimateUsageCostUsd(usage, model.rates);
      if (usd > 0) {
        totalUsd += usd;
        responses += 1;
      }
      let warnCrossed = false;
      let capCrossed = false;
      if (!warned && totalUsd >= limits.warnUsd) {
        warned = true;
        warnCrossed = true;
      }
      if (!capped && totalUsd >= limits.capUsd) {
        capped = true;
        capCrossed = true;
      }
      return snapshot(warnCrossed, capCrossed);
    },
    /** Current state without folding in new usage. */
    state: () => snapshot(),
    /**
     * Record that a billed response will never report its usage (torn down
     * mid-response). Flags the accounting as incomplete rather than
     * fabricating a token count for it.
     */
    markIncomplete() {
      incomplete = true;
      return snapshot();
    },
    /** Reset for a new session (same model/limits). */
    reset() {
      totalUsd = 0;
      responses = 0;
      warned = false;
      capped = false;
      incomplete = false;
      return snapshot();
    },
  };
}
