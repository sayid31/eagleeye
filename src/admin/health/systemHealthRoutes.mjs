// src/admin/health/systemHealthRoutes.mjs
/**
 * GET /api/admin/health — gathers the facts System Health shows (no provider
 * call is made) and returns `buildHealthReport`. Behind `requireAdminSession`.
 * Sources are injected so the route is testable without a Vite server.
 *
 * @module admin/health/systemHealthRoutes
 */

import { requireAdminSession } from '../auth/requireAdminSession.mjs';
import { buildHealthReport } from './systemHealthCore.mjs';

/** How many audit rows to scan for the last test per provider. */
const AUDIT_SCAN = 500;

/**
 * @param {import('connect').Server} middlewares
 * @param {object} deps
 * @param {() => object} deps.gather Returns the raw facts (see buildHealthReport).
 * @param {(req: any) => {ok: boolean, status?: number, error?: string}} [deps.guard]
 */
export function installSystemHealthRoutes(middlewares, { gather, guard = (req) => requireAdminSession(req) }) {
  middlewares.use('/api/admin/health', (req, res) => {
    const send = (status, payload) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(payload));
    };
    const admitted = guard(req);
    if (!admitted.ok) return send(admitted.status, { error: admitted.error });
    if (req.method !== 'GET') return send(405, { error: 'Method not allowed' });
    try {
      return send(200, buildHealthReport(gather()));
    } catch (error) {
      console.warn(`[system-health] report failed: ${error?.message || error}`);
      return send(500, { error: 'System Health could not be built; see the server console.' });
    }
  });
}

/**
 * Collect facts from the running server. Every reader is injected.
 * @param {object} src
 * @returns {object} facts for buildHealthReport
 */
export function gatherHealthFacts(src) {
  const settings = src.settingsStore.read().settings;
  const ledger = src.usageStore.read();
  const today = ledger.days[src.usageStore.today()] ?? {};
  const env = src.env;
  return {
    now: src.now(),
    server: { appVersion: src.appVersion, nodeVersion: process.version, startedAt: src.startedAt },
    keys: src.keyStore.status().keys,
    auditTail: src.audit.list(AUDIT_SCAN),
    ais: src.aisFeedEvidence?.() ?? null,
    routes: src.proxyTracker.snapshot(),
    quotas: { opensky: src.openSkyCredits(), openskyWarnAt: src.openSkyWarnAt, tomtom: src.tomtomBudget() },
    voice: {
      enabled: settings.enabled !== false,
      dailyMinutes: settings.limits?.dailyMinutes ?? 0,
      usedSeconds: today.seconds ?? 0,
      judgeEnabled: String(env.GEV_VOICE_JUDGE ?? '').toLowerCase() !== 'off',
      judgeCalls: today.judgeCalls ?? 0,
      judgeMax: src.judgeMax,
    },
    logs: { server: src.serverLog.stats(), auditEntries: src.audit.list(Number.MAX_SAFE_INTEGER).length },
  };
}
