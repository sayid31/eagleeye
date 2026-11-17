// src/admin/health/systemHealthPlugin.mjs
/**
 * Vite plugin wiring /api/admin/health to the running server's own state:
 * the key store, audit trail, live AIS feed, proxy failure watch, quota
 * snapshots, voice settings/usage and the Server Log. Dev and preview.
 * The `/dev` system routes (summary, usage, kill switches) share these
 * readers and are mounted here too, so vite.config.js needs no extra plugin.
 *
 * @module admin/health/systemHealthPlugin
 */

import { getProxyFailureTracker } from '../log/proxyFailureWatch.mjs';
import { getServerLog } from '../log/serverLogStore.mjs';
import { OPENSKY_QUOTA_WARN_REMAINING, openSkyCreditStatus, openskyAdaptiveTtlMs } from '../../data/openSkyCredits.mjs';
import { tomtomBudgetStatus } from '../../data/tomtomBudgetStatus.mjs';
import { createVoiceSettingsStore } from '../../voice/voiceSettingsStore.mjs';
import { createVoiceUsageStore } from '../../voice/voiceUsageStore.mjs';
import { judgeDailyMax } from '../../voice/answerJudgeRoute.mjs';
import { authStateFor } from '../../auth/authPlugin.mjs';
import { installDevSystemRoutes } from '../dev/devSystemRoutes.mjs';
import { gatherHealthFacts, installSystemHealthRoutes } from './systemHealthRoutes.mjs';

/**
 * @param {{keyStore: object, audit: object, aisFeedEvidence?: () => object, appVersion: string}} deps
 */
export function systemHealthPlugin({ keyStore, audit, aisFeedEvidence, appVersion }) {
  const startedAt = Date.now();
  const settingsStore = createVoiceSettingsStore();
  const usageStore = createVoiceUsageStore();
  const gather = () => gatherHealthFacts({
    now: () => Date.now(),
    env: process.env,
    appVersion,
    startedAt,
    settingsStore,
    usageStore,
    keyStore,
    audit,
    aisFeedEvidence,
    proxyTracker: getProxyFailureTracker(),
    openSkyCredits: openSkyCreditStatus,
    openSkyWarnAt: OPENSKY_QUOTA_WARN_REMAINING,
    tomtomBudget: tomtomBudgetStatus,
    judgeMax: judgeDailyMax(process.env),
    serverLog: getServerLog(),
  });
  const devSrc = {
    now: () => Date.now(),
    env: process.env,
    appVersion,
    startedAt,
    settingsStore,
    usageStore,
    keyStore,
    openSkyCredits: openSkyCreditStatus,
    openSkyWarnAt: OPENSKY_QUOTA_WARN_REMAINING,
    openSkyTtlMs: openskyAdaptiveTtlMs,
    tomtomBudget: tomtomBudgetStatus,
    judgeMax: judgeDailyMax(process.env),
    serverLog: getServerLog(),
  };
  const install = (server) => {
    installSystemHealthRoutes(server.middlewares, { gather });
    // Resolved per request: the auth stack boots once the server listens.
    installDevSystemRoutes(server.middlewares, { src: devSrc, getState: () => authStateFor(server) });
  };
  return {
    name: 'gev-system-health',
    configureServer(server) { install(server); },
    configurePreviewServer(server) { install(server); },
  };
}
