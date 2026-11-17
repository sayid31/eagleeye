// src/admin/dev/devSystemRoutes.mjs
/**
 * The `/dev` system API (super_admin), mounted by systemHealthPlugin right
 * after `/api/admin/health`:
 *  - `GET /api/admin/system`         → Ringkasan sistem (systemSummary.mjs);
 *  - `GET /api/admin/usage`          → Pemakaian & budget (usageReport.mjs);
 *  - `GET/PUT /api/admin/kill-switches` (killSwitchRoutes.mjs).
 * Every reader is injected so the routes are testable without Vite.
 *
 * @module admin/dev/devSystemRoutes
 */

import { sendJson } from '../../auth/authReplies.mjs';
import { registerApiRoute } from '../../auth/apiRouteRegistry.mjs';
import { requireActor } from '../../auth/requireActor.mjs';
import { authReadinessChecks } from '../../auth/authReadiness.mjs';
import { readinessFactsFromDb } from '../../auth/authReadinessFacts.mjs';
import { remainingDailySeconds, summarizeUsage } from '../../voice/voiceUsageCore.mjs';
import { LIVE_VOICE_RATE_PER_MIN } from '../../voice/liveCost.js';
import { bootedState, guarded, sendError, subPath } from './devHttp.mjs';
import { installKillSwitchRoutes } from './killSwitchRoutes.mjs';
import { buildSystemSummary, runtimeOf } from './systemSummary.mjs';
import { USAGE_VOICE_DAYS, buildUsageReport } from './usageReport.mjs';

export const SYSTEM_SUMMARY_ROUTE = '/api/admin/system';
export const USAGE_ROUTE = '/api/admin/usage';

/**
 * Raw facts of the usage page from the running server's own counters.
 * @param {object} src Injected readers (see devSystemPlugin wiring in systemHealthPlugin).
 */
export function gatherUsageFacts(src) {
  const settings = src.settingsStore.read().settings;
  const ledger = src.usageStore.read();
  const today = src.usageStore.today();
  const dailyMinutes = settings.limits?.dailyMinutes ?? 0;
  const opensky = src.openSkyCredits();
  return {
    now: src.now(),
    keys: src.keyStore.status().keys,
    opensky,
    openskyWarnAt: src.openSkyWarnAt,
    openskyTtlMs: opensky ? src.openSkyTtlMs(opensky.remaining) : null,
    tomtom: src.tomtomBudget(),
    voice: {
      enabled: settings.enabled !== false,
      dailyMinutes,
      remainingSeconds: remainingDailySeconds(ledger, today, dailyMinutes),
      summary: summarizeUsage(ledger, today, { days: USAGE_VOICE_DAYS, ratePerMin: LIVE_VOICE_RATE_PER_MIN }),
      judgeEnabled: String(src.env.GEV_VOICE_JUDGE ?? '').toLowerCase() !== 'off',
      judgeMax: src.judgeMax,
    },
  };
}

/**
 * Raw facts of the summary page.
 * @param {object} src Injected readers.
 * @param {object} state Booted auth state.
 */
export function gatherSummaryFacts(src, state) {
  let facts;
  try {
    facts = readinessFactsFromDb(state.db, state.config.superAdminEmails);
  } catch (error) {
    console.error(`[dev] readiness facts unreadable: ${error?.message || error}`);
    facts = { available: false, reason: 'unreadable' };
  }
  return {
    now: src.now(),
    appVersion: src.appVersion,
    runtime: runtimeOf(process),
    startedAt: src.startedAt,
    auth: { configured: state.config.ok === true, googleSignIn: Boolean(state.config.google) },
    keys: src.keyStore.status().keys,
    killSwitches: state.killSwitches.list(),
    logEntries: src.serverLog.query({ level: 'error', limit: Number.MAX_SAFE_INTEGER }).entries,
    readiness: authReadinessChecks({ env: src.env, facts }),
  };
}

/** GET-only super_admin handler answering `build()` as JSON. */
function readOnlyHandler(name, build) {
  return guarded(name, async (req, res) => {
    const admitted = requireActor(req, 'super');
    if (!admitted.ok) return sendError(res, admitted.status, admitted.status === 401 ? 'AUTH_REQUIRED' : 'SUPER_ADMIN_REQUIRED');
    if (subPath(req) !== '/') return sendError(res, 404, 'NOT_FOUND');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendError(res, 405, 'METHOD_NOT_ALLOWED');
    }
    return sendJson(res, 200, await build());
  });
}

/**
 * @param {any} middlewares Connect app.
 * @param {{src: object, getState: () => Promise<object>}} deps `src` = injected readers, `getState` = booted auth state.
 */
export function installDevSystemRoutes(middlewares, { src, getState }) {
  // Registered literally (not through a helper) so the route-gate discovery test can read each gate.
  registerApiRoute(middlewares, SYSTEM_SUMMARY_ROUTE, 'super', readOnlyHandler('system', async () => buildSystemSummary(gatherSummaryFacts(src, await bootedState(getState)))));
  registerApiRoute(middlewares, USAGE_ROUTE, 'super', readOnlyHandler('usage', async () => buildUsageReport(gatherUsageFacts(src))));
  installKillSwitchRoutes(middlewares, { getState });
}
