// src/admin/auth/adminAuthPlugin.mjs
/** Vite plugin: installs the admin login routes in dev and preview servers. */
import { installAdminAuthRoutes } from './adminAuthRoutes.mjs';
import { logServerEvent } from '../log/serverLogStore.mjs';

/** Auth route event → Server Log entry (checklist 1F). Reason codes only, never an account detail. */
export const AUTH_LOG_EVENTS = Object.freeze({
  login_ok: { level: 'info', code: 'admin.login', message: 'Admin signed in with Google.' },
  logout: { level: 'info', code: 'admin.logout', message: 'Admin signed out.' },
  login_rejected: { level: 'warn', code: 'admin.login_denied', message: 'A sign-in to /admin was refused' },
  login_failed: { level: 'error', code: 'admin.login_failed', message: 'Google sign-in could not be completed' },
});

/**
 * Auth route event → Server Log entry and audit-trail entry. Reason codes
 * only; never an email or any other account detail (logging rule).
 * @param {{record: (entry: object) => boolean}} [audit]
 */
export function createAuthEventSink(audit, log = logServerEvent) {
  return (event, detail = {}) => {
    console.warn(`[admin-auth] ${event}${detail.reason ? ` (${detail.reason})` : ''}`);
    const entry = AUTH_LOG_EVENTS[event];
    if (!entry) return;
    log({ ...entry, source: 'admin', message: detail.reason ? `${entry.message} (${detail.reason}).` : entry.message });
    audit?.record({ event: entry.code, source: 'google', result: detail.reason ? String(detail.reason).slice(0, 64).replace(/[^A-Za-z0-9_.:-]/g, '_') : 'ok' });
  };
}

/** @param {{audit?: {record: (entry: object) => boolean}}} [deps] */
export function adminAuthPlugin({ audit } = {}) {
  const onEvent = createAuthEventSink(audit);
  return {
    name: 'gev-admin-auth',
    configureServer(server) { installAdminAuthRoutes(server.middlewares, { onEvent }); },
    configurePreviewServer(server) { installAdminAuthRoutes(server.middlewares, { onEvent }); },
  };
}
