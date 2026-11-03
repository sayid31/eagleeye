// src/voice/voiceCost.js
/**
 * Spend-guard thresholds and the cost readout formatter shared by the GPT-Live
 * per-minute meter (`liveCost.js`).
 *
 * Pure module (no DOM, no network, no imports). The per-minute rate and the
 * meter state machine live in `liveCost.js`; this module owns only the two
 * things that are independent of how a backend bills: the default warn/cap
 * thresholds (and how a "disabled" threshold is spelled) and the compact
 * "~$0.42" display format.
 *
 * @module voice/voiceCost
 */

/**
 * Session spend thresholds, in USD. Deliberately generous — this is a runaway
 * guard (a hot mic left open, a feedback loop), not a budget.
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

/** Format a running cost for the compact UI readout ("~$0.42"). */
export function formatCostUsd(usd) {
  const n = Number.isFinite(Number(usd)) ? Math.max(0, Number(usd)) : 0;
  if (n > 0 && n < 0.01) return '~$0.01';
  return `~$${n.toFixed(2)}`;
}
