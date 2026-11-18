// src/admin/routes/features/access.js
/**
 * Feature "Akses": accounts and their activity (users, Log Login, account audit, the /admin overview).
 * Owner of: src/admin/users/**. To add or move a page of this feature edit ONLY this file:
 *  - `pages`: page id → lazy component (ids are unique across all features);
 *  - `nav`: per area, menu groups (`order` sorts them among the other features' groups);
 *  - `redirects`: old path → new path (router paths without the /admin or /dev basename).
 *
 * @module admin/routes/features/access
 */
import { NAV_COPY } from '../../../copy/id/nav.js';
import { page } from '../pageRef.js';

const { items, tabs, groups } = NAV_COPY;

/** The `Aktivitas` item (shared by both areas): Log Login | Audit akun as sub-routes under `/activity`. */
const activityItem = (auditLabel) => ({
  id: 'activity',
  label: items.activity,
  path: '/activity',
  icon: 'activity',
  tabs: [
    { id: 'login', label: tabs.loginLog, path: '/activity/login', page: 'login-log' },
    { id: 'audit', label: auditLabel, path: '/activity/audit', page: 'account-audit' },
  ],
});

/** @type {import('../index.js').RouteFeature} */
export const accessRoutes = {
  id: 'access',
  pages: {
    users: page(() => import('../../users/UsersPage.jsx'), 'UsersPage'),
    'users-overview': page(() => import('../../users/UsersOverviewPage.jsx'), 'UsersOverviewPage'),
    'login-log': page(() => import('../../users/LoginLogPage.jsx'), 'LoginLogPage'),
    'account-audit': page(() => import('../../users/AccountAuditPage.jsx'), 'AccountAuditPage'),
  },
  nav: {
    admin: [{
      order: 10,
      id: 'main',
      title: null,
      items: [
        { id: 'overview', label: items.overview, path: '/', icon: 'overview', page: 'users-overview' },
        { id: 'users', label: items.users, path: '/users', icon: 'users', page: 'users' },
        activityItem(tabs.audit),
      ],
    }],
    dev: [{
      order: 20,
      id: 'access',
      title: groups.access,
      items: [
        { id: 'users', label: items.usersAndAdmins, path: '/users', icon: 'users', page: 'users' },
        activityItem(tabs.accountAudit),
      ],
    }],
  },
  redirects: {
    admin: { '/login-log': '/activity/login', '/audit': '/activity/audit' },
    dev: { '/login-log': '/activity/login', '/audit': '/activity/audit' },
  },
};
