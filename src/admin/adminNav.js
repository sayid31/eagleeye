// src/admin/adminNav.js
/**
 * Menu structure of the two dashboard areas served by the one admin bundle:
 *  - `/admin` (admin + super_admin): people — the `user` accounts.
 *  - `/dev` (super_admin only): the system, plus everything `/admin` has.
 * Pure data so the sidebar, the router and the tests all read one source of
 * truth. The server guard enforces the same area split; this only decides
 * what to render.
 *
 * A leaf with `page` renders that built page (AdminApp maps the id to a
 * component); a leaf without one renders the placeholder until it is built.
 * Paths are relative to the area basename; `/` is the area's own landing page.
 *
 * @module admin/adminNav
 */

import { isSuperAdminRole } from '../auth/authRoles.mjs';

/** @typedef {'admin' | 'dev'} AdminArea */
/** @typedef {{label: string, path: string, page?: string}} AdminLeaf */
/** @typedef {{id: string, label: string, path: string, page?: string, children?: AdminLeaf[]}} AdminGroup */

/** The areas, each mounted at `/<area>`. */
export const ADMIN_AREAS = Object.freeze(['admin', 'dev']);

/** @type {Readonly<Record<AdminArea, AdminGroup[]>>} */
export const AREA_NAV = Object.freeze({
  admin: [
    { id: 'overview', label: 'Ringkasan', path: '/', page: 'users-overview' },
    { id: 'users', label: 'Pengguna', path: '/users', page: 'users' },
    { id: 'login-log', label: 'Log Login', path: '/login-log', page: 'login-log' },
    { id: 'audit', label: 'Audit', path: '/audit', page: 'account-audit' },
  ],
  dev: [
    { id: 'overview', label: 'Ringkasan sistem', path: '/', page: 'dev-overview' },
    { id: 'users', label: 'Pengguna & Admin', path: '/users', page: 'users' },
    { id: 'login-log', label: 'Log Login', path: '/login-log', page: 'login-log' },
    { id: 'kill-switches', label: 'Kill switch', path: '/kill-switches', page: 'dev-kill-switches' },
    { id: 'usage', label: 'Pemakaian', path: '/usage', page: 'dev-usage' },
    { id: 'api-keys', label: 'API Keys', path: '/api-keys', page: 'api-keys' },
    {
      id: 'ai-config',
      label: 'Konfigurasi AI',
      path: '/ai',
      children: [
        { label: 'Umum', path: '/ai/general', page: 'ai-general' },
        { label: 'Penyedia AI', path: '/ai/provider', page: 'ai-provider' },
        { label: 'Persona', path: '/ai/persona', page: 'ai-persona' },
        { label: 'Pemakaian & Biaya', path: '/ai/usage', page: 'ai-usage' },
      ],
    },
    {
      id: 'server-log',
      label: 'Server Log',
      path: '/server-log',
      children: [
        { label: 'Server Log', path: '/server-log', page: 'server-log' },
        { label: 'Audit Log', path: '/server-log/audit', page: 'server-log-audit' },
        { label: 'Kesehatan Sistem', path: '/server-log/health', page: 'server-log-health' },
      ],
    },
    { id: 'audit', label: 'Audit', path: '/audit', page: 'account-audit' },
  ],
});

const AREA_LABEL = Object.freeze({ admin: 'Admin', dev: 'Dev' });
const ROLE_LABEL = Object.freeze({ super_admin: 'Super admin', admin: 'Admin' });

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
 * @returns {AdminGroup[]}
 */
export function navForArea(area) {
  const nav = ADMIN_AREAS.includes(area) ? AREA_NAV[area] : null;
  if (!nav) throw new Error(`Unknown admin area: ${String(area)}`);
  return nav;
}

/**
 * Every page the router must serve for an area, one entry per leaf.
 * @param {AdminArea} area
 * @returns {AdminLeaf[]}
 */
export function areaLeaves(area) {
  return navForArea(area).flatMap((group) => group.children ?? [{ label: group.label, path: group.path, page: group.page }]);
}

/**
 * Page opened when the visitor lands on the area root (`/admin`, `/dev`).
 * @param {AdminArea} area
 * @returns {string}
 */
export function areaHome(area) {
  return areaLeaves(area)[0].path;
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
 * Groups of an area whose bare path must redirect to their first page. A
 * group whose first page IS the group path (Server Log) gets no redirect: a
 * route that navigates to its own URL renders nothing and hides the real page.
 * @param {AdminArea} area
 * @returns {AdminGroup[]}
 */
export function groupRedirects(area) {
  return navForArea(area).filter((group) => group.children && groupLanding(group) !== group.path);
}

/**
 * Breadcrumb above the page: group then page, e.g. ['Konfigurasi AI', 'Umum'].
 * A top-level page is one crumb; an unknown path yields none.
 * @param {AdminArea} area
 * @param {string} pathname Router path without the area basename.
 * @returns {string[]}
 */
export function breadcrumbFor(area, pathname) {
  for (const group of navForArea(area)) {
    if (!group.children) {
      if (group.path === pathname) return [group.label];
      continue;
    }
    const leaf = group.children.find((child) => child.path === pathname);
    if (leaf) return leaf.label === group.label ? [group.label] : [group.label, leaf.label];
  }
  return [];
}

/**
 * Sub-label shown next to the brand ("Admin" / "Dev").
 * @param {AdminArea} area
 * @returns {string}
 */
export function areaLabel(area) {
  return AREA_LABEL[area];
}

/**
 * Role shown under the signed-in email; empty for a role with no admin label.
 * @param {unknown} role
 * @returns {string}
 */
export function roleLabel(role) {
  return Object.hasOwn(ROLE_LABEL, role) ? ROLE_LABEL[role] : '';
}

/**
 * Link to the other area, offered to a super_admin only (an admin has no `/dev`).
 * @param {AdminArea} area
 * @param {unknown} role
 * @returns {{href: string, label: string} | null}
 */
export function areaSwitchFor(area, role) {
  if (!isSuperAdminRole(role)) return null;
  return area === 'dev' ? { href: '/admin', label: 'Buka area Admin' } : { href: '/dev', label: 'Buka area Dev' };
}
