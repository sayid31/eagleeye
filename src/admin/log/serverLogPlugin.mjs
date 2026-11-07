// src/admin/log/serverLogPlugin.mjs
/**
 * Vite plugin that turns the Server Log on for dev and preview servers:
 * the proxy-failure and refused-admin-access watches (installed first so they
 * see every /api response),
 * the browser ingest + admin routes, and a slow background check of the live
 * AISStream feed so a key AISStream refuses shows up without anyone testing it.
 *
 * @module admin/log/serverLogPlugin
 */

import { readRequestBodyCapped } from '../../server/proxyInfra.mjs';
import { adminDenialMiddleware } from './adminDenialWatch.mjs';
import { installAdminAuditRoutes } from '../audit/adminAuditRoutes.mjs';
import { getProxyFailureTracker, proxyFailureMiddleware } from './proxyFailureWatch.mjs';
import { installServerLogRoutes } from './serverLogRoutes.mjs';
import { getServerLog, logServerEvent } from './serverLogStore.mjs';

const FEED_CHECK_MS = 5 * 60_000;

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
