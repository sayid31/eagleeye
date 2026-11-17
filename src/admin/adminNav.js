// src/admin/adminNav.js
/**
 * Menu structure of the /admin dashboard. Pure data so the sidebar, the
 * router and the tests all read one source of truth.
 *
 * `soon` marks entries that are planned but not built yet (none at present).
 * `permission: 'keys'` marks entries only an active super-admin may open
 * (they manage provider keys); the server enforces the same rule.
 *
 * @module admin/adminNav
 */

import { canManageKeys } from '../auth/authRoles.mjs';

/** @typedef {{label: string, path: string, soon?: boolean}} AdminLeaf */
/** @typedef {{id: string, label: string, path: string, permission?: 'keys', children?: AdminLeaf[]}} AdminGroup */

/** @type {AdminGroup[]} */
export const ADMIN_NAV = [
  {
    id: 'server-log',
    label: 'Server Log',
    path: '/server-log',
    children: [
      { label: 'Server Log', path: '/server-log' },
      { label: 'Audit Log', path: '/server-log/audit' },
      { label: 'Kesehatan Sistem', path: '/server-log/health' },
    ],
  },
  {
    id: 'ai-config',
    label: 'Konfigurasi AI',
    path: '/ai',
    children: [
      { label: 'Umum', path: '/ai/general' },
      { label: 'Penyedia AI', path: '/ai/provider' },
      { label: 'Persona', path: '/ai/persona' },
      { label: 'Pemakaian & Biaya', path: '/ai/usage' },
    ],
  },
  { id: 'api-keys', label: 'API Keys', path: '/api-keys', permission: 'keys' },
];

/**
 * Menu groups this actor may see; without an actor, every group.
 * @param {{role?: string, status?: string} | null} [actor]
 * @returns {AdminGroup[]}
 */
export function navForActor(actor) {
  if (!actor) return ADMIN_NAV;
  return ADMIN_NAV.filter((group) => group.permission !== 'keys' || canManageKeys(actor));
}

/**
 * Every page the router must serve, one entry per leaf (of the groups this actor may see).
 * @param {{role?: string, status?: string} | null} [actor]
 * @returns {AdminLeaf[]}
 */
export function adminLeaves(actor) {
  return navForActor(actor).flatMap((group) => group.children ?? [{ label: group.label, path: group.path }]);
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

/**
 * Breadcrumb above the page: group then page, e.g. ['Konfigurasi AI', 'Umum'].
 * A top-level page is one crumb; an unknown path yields none.
 * @param {string} pathname Router path without the `/admin` basename.
 * @returns {string[]}
 */
export function breadcrumbFor(pathname) {
  for (const group of ADMIN_NAV) {
    if (!group.children) {
      if (group.path === pathname) return [group.label];
      continue;
    }
    const leaf = group.children.find((child) => child.path === pathname);
    if (leaf) return leaf.label === group.label ? [group.label] : [group.label, leaf.label];
  }
  return [];
}
