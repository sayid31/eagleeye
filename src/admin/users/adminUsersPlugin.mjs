// src/admin/users/adminUsersPlugin.mjs
/**
 * Vite plugin (dev + preview) mounting the account-management API:
 * `/api/admin/users`, `/api/admin/login-log` and the account source of
 * `/api/admin/audit`. Register it right after `authPlugin` and before
 * `serverLogPlugin` (whose legacy audit handler it falls through to).
 *
 * @module admin/users/adminUsersPlugin
 */

import { authStateFor } from '../../auth/authPlugin.mjs';
import { installAdminLogRoutes } from './adminLogRoutes.mjs';
import { installAdminUsersRoutes } from './usersRoutes.mjs';

/**
 * @param {{stateFor?: (server: any) => Promise<object>}} [options]
 * @returns {import('vite').Plugin}
 */
export function adminUsersPlugin({ stateFor = authStateFor } = {}) {
  const install = (server) => {
    // Resolved per request: the auth stack boots once the server listens.
    const getState = () => stateFor(server);
    installAdminUsersRoutes(server.middlewares, { getState });
    installAdminLogRoutes(server.middlewares, { getState });
  };
  return {
    name: 'gev-admin-users',
    configureServer(server) { install(server); },
    configurePreviewServer(server) { install(server); },
  };
}
