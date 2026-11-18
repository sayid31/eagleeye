// src/admin/adminNav.js
/**
 * Composes the menu, the page table and the legacy redirects of the two dashboard areas from the route features
 * (src/admin/routes/features/*.js, listed in routes/index.js). This file owns no page: to add or move one, edit the
 * feature file that owns it.
 *  - `/admin` (admin + super_admin): Ringkasan · Pengguna · Aktivitas (tabs Log Login | Audit).
 *  - `/dev` (super_admin only): Ringkasan sistem; Akses; Kendali; Konfigurasi; Sistem.
 * Pure data, so the sidebar, the router and the tests read one source of truth. The server guard enforces the same
 * area split; this only decides what to render. Paths are relative to the area basename; `/` is the area home.
 *
 * @module admin/adminNav
 */

import { isSuperAdminRole } from '../auth/authRoles.mjs';
import { SHELL_COPY } from '../copy/id/shell.js';
import { navItems } from '../components/app/navModel.js';
import { ROUTE_FEATURES } from './routes/index.js';

/** @typedef {'admin' | 'dev'} AdminArea */
/** @typedef {import('../components/app/navModel.js').NavGroup & {order: number}} NavGroup */
/** @typedef {import('../components/app/navModel.js').NavItem} NavItem */

/** The areas, each mounted at `/<area>`. */
export const ADMIN_AREAS = Object.freeze(['admin', 'dev']);

function composeNav(area, features) {
  return features
    .flatMap((feature) => feature.nav[area])
    .sort((a, b) => a.order - b.order);
}

/** @type {Readonly<Record<AdminArea, NavGroup[]>>} */
export const AREA_NAV = Object.freeze({
  admin: composeNav('admin', ROUTE_FEATURES),
  dev: composeNav('dev', ROUTE_FEATURES),
});

/** Legacy path → new path per area, merged from every feature. */
export const AREA_REDIRECTS = Object.freeze(Object.fromEntries(ADMIN_AREAS.map((area) => [
  area, Object.freeze(Object.assign({}, ...ROUTE_FEATURES.map((feature) => feature.redirects[area]))),
])));

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
 * Every routable page of an area, one entry per item without tabs and one per tab: `{path, page, label, item, tab?}`.
 * @param {AdminArea} area
 * @returns {Array<{path: string, page: string, label: string}>}
 */
export function areaLeaves(area) {
  return navItems(navForArea(area)).flatMap((item) => (item.tabs
    ? item.tabs.map((tab) => ({ path: tab.path, page: tab.page, label: tab.label }))
    : [{ path: item.path, page: item.page, label: item.label }]));
}

/**
 * Legacy path → new path of an area (old bookmarks keep working; the router answers them with a redirect).
 * @param {AdminArea} area
 * @returns {Readonly<Record<string, string>>}
 */
export function redirectsFor(area) {
  navForArea(area);
  return AREA_REDIRECTS[area];
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
