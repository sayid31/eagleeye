// src/admin/auth/adminAuthPlugin.mjs
/** Vite plugin: installs the admin login routes in dev and preview servers. */
import { installAdminAuthRoutes } from './adminAuthRoutes.mjs';

// Reason codes only; never an email or any other account detail (logging rule).
const onEvent = (event, detail = {}) => console.warn(`[admin-auth] ${event}${detail.reason ? ` (${detail.reason})` : ''}`);

export function adminAuthPlugin() {
  return {
    name: 'gev-admin-auth',
    configureServer(server) { installAdminAuthRoutes(server.middlewares, { onEvent }); },
    configurePreviewServer(server) { installAdminAuthRoutes(server.middlewares, { onEvent }); },
  };
}
