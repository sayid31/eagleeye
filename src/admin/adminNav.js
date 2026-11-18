// src/admin/adminNav.js
/**
 * Menu structure of the two dashboard areas served by the one admin bundle:
 *  - `/admin` (admin + super_admin): Ringkasan · Pengguna · Log Login · Audit.
 *  - `/dev` (super_admin only): Ringkasan sistem · Pengguna & Admin · Log Login · Kill switch · Pemakaian · API Keys ·
 *    Konfigurasi AI (Umum, Penyedia AI, Persona, Pemakaian & Biaya) · Server Log (Server Log, Audit Log,
 *    Kesehatan Sistem) · Audit.
 * Pure data, so the sidebar, the router and the tests read one source of truth. The server guard enforces the same
 * area split; this only decides what to render. Paths are relative to the area basename; `/` is the area home. A
 * titled group is a labelled sub-list in the sidebar; its pages are registered in routes/features/*.js (PAGE_TABLE).
 *
 * @module admin/adminNav
 */

import { isSuperAdminRole } from '../auth/authRoles.mjs';
import { SHELL_COPY } from '../copy/en/shell.js';
import { NAV_COPY } from '../copy/en/nav.js';
import { navItems } from '../components/app/navModel.js';
import { ROUTE_FEATURES } from './routes/index.js';

/** @typedef {'admin' | 'dev'} AdminArea */
/** @typedef {import('../components/app/navModel.js').NavGroup} NavGroup */

const { items, groups } = NAV_COPY;

/** The areas, each mounted at `/<area>`. */
export const ADMIN_AREAS = Object.freeze(['admin', 'dev']);

const top = (id, label, path, icon, page) => ({ id, label, path, icon, page });
const plain = (id, item) => ({ id, title: null, items: [item] });

/** @type {Readonly<Record<AdminArea, NavGroup[]>>} */
export const AREA_NAV = Object.freeze({
  admin: [
    {
      id: 'main',
      title: null,
      items: [
        top('overview', items.overview, '/', 'overview', 'users-overview'),
        top('users', items.users, '/users', 'users', 'users'),
        top('login-log', items.loginLog, '/login-log', 'loginLog', 'login-log'),
        top('audit', items.audit, '/audit', 'audit', 'account-audit'),
      ],
    },
  ],
  dev: [
    {
      id: 'main',
      title: null,
      items: [
        top('overview', items.systemOverview, '/', 'overview', 'dev-overview'),
        top('users', items.usersAndAdmins, '/users', 'users', 'users'),
        top('login-log', items.loginLog, '/login-log', 'loginLog', 'login-log'),
        top('kill-switches', items.killSwitches, '/kill-switches', 'killSwitch', 'dev-kill-switches'),
        top('usage', items.usage, '/usage', 'usage', 'dev-usage'),
        top('api-keys', items.apiKeys, '/api-keys', 'apiKeys', 'api-keys'),
        // Hidden: routable for the keyboard / accessibility gate, never listed in the sidebar.
        { ...top('ui-kit', items.uiKit, '/ui-kit', 'general', 'ui-kit'), hidden: true },
      ],
    },
    {
      id: 'ai-config',
      title: groups.aiConfig,
      path: '/ai',
      items: [
        top('ai-general', items.general, '/ai/general', 'general', 'ai-general'),
        top('ai-provider', items.aiProvider, '/ai/provider', 'aiProvider', 'ai-provider'),
        top('ai-persona', items.persona, '/ai/persona', 'persona', 'ai-persona'),
        top('ai-usage', items.aiUsage, '/ai/usage', 'aiUsage', 'ai-usage'),
      ],
    },
    {
      id: 'server-log',
      title: groups.serverLog,
      path: '/server-log',
      items: [
        top('server-log', items.serverLog, '/server-log', 'logs', 'server-log'),
        top('server-log-audit', items.auditLog, '/server-log/audit', 'auditLog', 'server-log-audit'),
        top('server-log-health', items.health, '/server-log/health', 'health', 'server-log-health'),
      ],
    },
    plain('audit', top('audit', items.audit, '/audit', 'audit', 'account-audit')),
  ],
});

/** Page id → page registration, merged from every feature. */
export const PAGE_TABLE = Object.freeze(Object.assign({}, ...ROUTE_FEATURES.map((feature) => feature.pages)));

/**
 * Whether `pathname` is `prefix` itself or a path below it.
 * @param {string} pathname
 * @param {string} prefix e.g. `/dev`
 * @returns {boolean}
 */
export function pathIsUnder(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Area of a full browser pathname: `/dev…` → `dev`, anything else → `admin`.
 * @param {string} pathname
 * @returns {AdminArea}
 */
export function adminArea(pathname) {
  return pathIsUnder(pathname, '/dev') ? 'dev' : 'admin';
}

/**
 * Router basename for a full browser pathname (`/dev` or `/admin`).
 * @param {string} pathname
 * @returns {string}
 */
export function adminBasename(pathname) {
  return `/${adminArea(pathname)}`;
}

/**
 * Menu groups of an area.
 * @param {AdminArea} area
 * @returns {NavGroup[]}
 */
export function navForArea(area) {
  const nav = ADMIN_AREAS.includes(area) ? AREA_NAV[area] : null;
  if (!nav) throw new Error(`Unknown admin area: ${String(area)}`);
  return nav;
}

/**
 * Every page the router must serve for an area, one entry per item: `{path, page, label}`.
 * @param {AdminArea} area
 * @returns {Array<{path: string, page: string, label: string}>}
 */
export function areaLeaves(area) {
  return navItems(navForArea(area)).map((item) => ({ path: item.path, page: item.page, label: item.label }));
}

/**
 * Page opened when the visitor lands on the area root (`/admin`, `/dev`).
 * @param {AdminArea} area
 * @returns {string}
 */
export function areaHome(area) {
  return navItems(navForArea(area))[0].path;
}

/**
 * Groups of an area whose bare path (`/ai`) must redirect to their first page. A group whose first page IS the group
 * path (Server Log) gets none: a route that navigates to its own URL renders nothing and hides the real page.
 * @param {AdminArea} area
 * @returns {Array<{path: string, to: string}>}
 */
export function groupRedirects(area) {
  return navForArea(area)
    .filter((group) => group.path && group.items[0].path !== group.path)
    .map((group) => ({ path: group.path, to: group.items[0].path }));
}

/**
 * Role shown under the signed-in email; empty for a role with no admin label.
 * @param {unknown} role
 * @returns {string}
 */
export function roleLabel(role) {
  return role === 'super_admin' || role === 'admin' ? SHELL_COPY.roles[role] : '';
}

/**
 * Link to the other area, offered to a super_admin only (an admin has no `/dev`).
 * @param {AdminArea} area
 * @param {unknown} role
 * @returns {{href: string, label: string} | null}
 */
export function areaSwitchFor(area, role) {
  if (!isSuperAdminRole(role)) return null;
  return area === 'dev' ? { href: '/admin', label: SHELL_COPY.openAdmin } : { href: '/dev', label: SHELL_COPY.openDev };
}
