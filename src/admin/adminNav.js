// src/admin/adminNav.js
/**
 * Menu structure of the /admin dashboard. Pure data so the sidebar, the
 * router and the tests all read one source of truth.
 *
 * `soon` marks entries that are planned but not built yet (none at present).
 *
 * @module admin/adminNav
 */

/** @typedef {{label: string, path: string, soon?: boolean}} AdminLeaf */
/** @typedef {{id: string, label: string, path: string, children?: AdminLeaf[]}} AdminGroup */

/** @type {AdminGroup[]} */
export const ADMIN_NAV = [
  {
    id: 'server-log',
    label: 'Server Log',
    path: '/server-log',
    children: [
      { label: 'Server Log', path: '/server-log' },
      { label: 'Audit Log', path: '/server-log/audit' },
      { label: 'System Health', path: '/server-log/health' },
    ],
  },
  {
    id: 'ai-config',
    label: 'AI Configuration',
    path: '/ai',
    children: [
      { label: 'General', path: '/ai/general' },
      { label: 'AI Provider', path: '/ai/provider' },
      { label: 'Persona', path: '/ai/persona' },
      { label: 'Usage & Cost', path: '/ai/usage' },
    ],
  },
  { id: 'api-keys', label: 'API Keys', path: '/api-keys' },
];

/**
 * Every page the router must serve, one entry per leaf.
 * @returns {AdminLeaf[]}
 */
export function adminLeaves() {
  return ADMIN_NAV.flatMap((group) => group.children ?? [{ label: group.label, path: group.path }]);
}

/**
 * First page of a group, used to redirect a bare group path (`/ai`).
 * @param {AdminGroup} group
 * @returns {string}
 */
export function groupLanding(group) {
  return group.children?.[0]?.path ?? group.path;
}

/**
 * Groups whose bare path must redirect to their first page. A group whose
 * first page IS the group path (Server Log) gets no redirect: a route that
 * navigates to its own URL renders nothing and hides the real page route.
 * @returns {AdminGroup[]}
 */
export function groupRedirects() {
  return ADMIN_NAV.filter((group) => group.children && groupLanding(group) !== group.path);
}

/** Page opened when the visitor lands on `/admin` itself. */
export const ADMIN_HOME_PATH = ADMIN_NAV[0].children[0].path;
