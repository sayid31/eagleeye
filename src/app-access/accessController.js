// src/app-access/accessController.js
/**
 * The map's capability locks, one record per toggle (`layers` | `ai` |
 * `premium`): which are locked and why, applied exactly once each. Fed by the
 * boot plan (`planAccountAccess`) and by server refusals seen on the shared
 * fetch path (`capabilityFetchGuard.js`); drives the access banner and the
 * per-feature effects (`accessEffects.js`).
 *
 * @module app-access/accessController
 */

import { CAPABILITY_GATES } from './capabilityRoutes.js';
import { denialToast } from './capabilityDenial.js';
import { accessBannerModel } from './accessBanner.js';

/** Plan field that says whether each toggle is usable. */
const PLAN_FIELDS = Object.freeze({ layers: 'layers', ai: 'voice', premium: 'keyedBasemaps' });

/**
 * Gates the boot plan leaves off. Pure.
 * @param {{layers: boolean, voice: boolean, keyedBasemaps: boolean}} plan
 * @returns {string[]}
 */
export function lockedGatesOf(plan) {
  return CAPABILITY_GATES.filter((gate) => plan?.[PLAN_FIELDS[gate]] !== true);
}

/**
 * @param {object} params
 * @param {import('../auth/accountAccessPlan.js').AccountAccessPlan} params.plan
 * @param {{[gate: string]: (ctx: {handles: object, runtime: boolean}) => (void | Promise<void>)}} params.effects
 * @param {(model: object | null) => void} params.showBanner Receives an `accessBannerModel` (or `{text}` / null).
 * @param {() => string | null} [params.dismissedKey]
 * @param {(message: string) => void} [params.toast]
 */
export function createAccessController({ plan, effects, showBanner, dismissedKey = () => null, toast = () => {} }) {
  /** @type {Map<string, string>} gate → lock kind */
  const locks = new Map(lockedGatesOf(plan).map((gate) => [gate, 'plan']));
  const applied = new Set();
  const runtimeGates = new Set();
  let handles = null;

  const apply = (gate) => {
    // Effects need the running map; a lock that arrives before attach() waits for it.
    if (applied.has(gate) || !handles) return;
    applied.add(gate);
    const failed = (error) => console.warn(`[access] locking ${gate} failed: ${error.message}`);
    // Synchronous on purpose: the layer guard must be in place before the
    // caller goes on to restore saved layers.
    try {
      Promise.resolve(effects[gate]?.({ handles, runtime: runtimeGates.has(gate) })).catch(failed);
    } catch (error) {
      failed(error);
    }
  };

  const refreshBanner = () => {
    if (plan.mode === 'unknown') return showBanner(plan.banner ? { text: plan.banner } : null);
    return showBanner(accessBannerModel(locks, dismissedKey()));
  };

  return {
    /** @returns {string | null} Lock kind of a gate, or null when it is usable. */
    lockKindOf: (gate) => locks.get(gate) ?? null,
    /** @returns {Map<string, string>} A copy of the current locks. */
    locks: () => new Map(locks),
    refreshBanner,
    /**
     * The running map's handles (data manager, toggle list, map stack); applies
     * every lock still waiting for them. Call once.
     * @param {object} next
     */
    attach(next) {
      handles = { ...next };
      for (const gate of locks.keys()) apply(gate);
    },
    /**
     * Lock a gate after a server refusal. Only the first refusal per gate acts.
     * @param {{gate: string, kind: 'revoked' | 'killed'}} denial
     * @returns {boolean} whether this call locked it.
     */
    deny(denial) {
      if (!CAPABILITY_GATES.includes(denial?.gate) || locks.has(denial.gate)) return false;
      locks.set(denial.gate, denial.kind);
      runtimeGates.add(denial.gate);
      apply(denial.gate);
      refreshBanner();
      toast(denialToast(denial));
      return true;
    },
  };
}
