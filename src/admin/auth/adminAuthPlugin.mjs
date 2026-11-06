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

// Reason codes only; never an email or any other account detail (logging rule).
const onEvent = (event, detail = {}) => {
  console.warn(`[admin-auth] ${event}${detail.reason ? ` (${detail.reason})` : ''}`);
  const entry = AUTH_LOG_EVENTS[event];
  if (entry) logServerEvent({ ...entry, source: 'admin', message: detail.reason ? `${entry.message} (${detail.reason}).` : entry.message });
};

export function adminAuthPlugin() {
  return {
    name: 'gev-admin-auth',
    configureServer(server) { installAdminAuthRoutes(server.middlewares, { onEvent }); },
    configurePreviewServer(server) { installAdminAuthRoutes(server.middlewares, { onEvent }); },
  };
}
