// src/admin/health/systemHealthPlugin.mjs
/**
 * Vite plugin wiring /api/admin/health to the running server's own state:
 * the key store, audit trail, live AIS feed, proxy failure watch, quota
 * snapshots, voice settings/usage and the Server Log. Dev and preview.
 *
 * @module admin/health/systemHealthPlugin
 */

import { getProxyFailureTracker } from '../log/proxyFailureWatch.mjs';
import { getServerLog } from '../log/serverLogStore.mjs';
import { OPENSKY_QUOTA_WARN_REMAINING, openSkyCreditStatus } from '../../data/openSkyProxy.mjs';
import { tomtomBudgetStatus } from '../../data/tomtomProxy.mjs';
import { createVoiceSettingsStore } from '../../voice/voiceSettingsStore.mjs';
import { createVoiceUsageStore } from '../../voice/voiceUsageStore.mjs';
import { judgeDailyMax } from '../../voice/answerJudgeRoute.mjs';
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
  const install = (middlewares) => installSystemHealthRoutes(middlewares, { gather });
  return {
    name: 'gev-system-health',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); },
  };
}
