// src/admin/log/serverLogPlugin.mjs
/**
 * Vite plugin that turns the Server Log on for dev and preview servers:
 * the proxy-failure and refused-admin-access watches (installed first so they
 * see every /api response),
 * the browser ingest + admin routes, a slow background check of the live
 * AISStream feed so a key AISStream refuses shows up without anyone testing it,
 * and the console bridge that mirrors every server `console.warn`/`error`
 * into the log (`GEV_SERVER_LOG_CONSOLE=0` turns that bridge off).
 *
 * @module admin/log/serverLogPlugin
 */

import { readRequestBodyCapped } from '../../server/proxyInfra.mjs';
import { adminDenialMiddleware } from './adminDenialWatch.mjs';
import { installConsoleBridge } from './consoleBridge.mjs';
import { installAdminAuditRoutes } from '../audit/adminAuditRoutes.mjs';
import { getProxyFailureTracker, proxyFailureMiddleware } from './proxyFailureWatch.mjs';
import { installServerLogRoutes } from './serverLogRoutes.mjs';
import { getServerLog, logServerEvent } from './serverLogStore.mjs';

const FEED_CHECK_MS = 5 * 60_000;

/** Whether the console bridge is on: default yes, `GEV_SERVER_LOG_CONSOLE=0`/`false`/`off` disables it. */
export function consoleBridgeEnabled(env = process.env) {
  return !/^(0|false|off|no)$/i.test(String(env.GEV_SERVER_LOG_CONSOLE ?? '').trim());
}

/**
 * @param {{audit?: {record: (entry: object) => boolean}, aisFeedEvidence?: () => {status: string}}} [deps]
 */
export function serverLogPlugin({ audit, aisFeedEvidence } = {}) {
  let feedTimer = null;
  const checkFeed = () => {
    const status = aisFeedEvidence?.()?.status;
    if (status === 'auth-failed') {
      logServerEvent({ level: 'error', source: 'keys', code: 'keys.rejected', message: 'AISStream refuses the configured key on the live vessel feed.', detail: { provider: 'aisstream' } });
    }
  };
  const install = (middlewares) => {
    if (consoleBridgeEnabled()) installConsoleBridge(logServerEvent);
    middlewares.use(proxyFailureMiddleware(logServerEvent, getProxyFailureTracker()));
    middlewares.use(adminDenialMiddleware(logServerEvent));
    installServerLogRoutes(middlewares, { log: getServerLog(), readRequestBody: readRequestBodyCapped, audit: (entry) => audit?.record(entry) });
    if (audit) installAdminAuditRoutes(middlewares, { audit });
    if (aisFeedEvidence && !feedTimer) {
      feedTimer = setInterval(() => {
        try { checkFeed(); } catch (error) { console.warn(`[server-log] AIS feed check failed: ${error?.message || error}`); }
      }, FEED_CHECK_MS);
      feedTimer.unref?.();
    }
  };
  return {
    name: 'gev-server-log',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); },
  };
}
