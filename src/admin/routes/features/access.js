/**
 * Feature "Akses": accounts and their history (Pengguna, Log Login, Audit, the /admin Ringkasan).
 * Owner of: src/admin/users/**. To add a page of this feature register it here (page id → lazy component; ids are
 * unique across all features) and give it a menu entry in ../../adminNav.js.
 *
 * @module admin/routes/features/access
 */
import { page } from '../pageRef.js';

/** @type {import('../index.js').RouteFeature} */
export const accessRoutes = {
  id: 'access',
  pages: {
    users: page(() => import('../../users/UsersPage.jsx'), 'UsersPage'),
    'users-overview': page(() => import('../../users/UsersOverviewPage.jsx'), 'UsersOverviewPage'),
    'login-log': page(() => import('../../users/LoginLogPage.jsx'), 'LoginLogPage'),
    'account-audit': page(() => import('../../users/AccountAuditPage.jsx'), 'AccountAuditPage'),
  },
};
