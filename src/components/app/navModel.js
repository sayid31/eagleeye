// src/components/app/navModel.js
/**
 * Pure model of a sidebar menu used by AppShell: groups of items. A group with a `title` is a labelled sub-list (its
 * title is a heading, not a link); a group without one lists plain top-level items. A `hidden` item is routable and
 * titled but not listed in the sidebar. All paths are relative to the router basename, like `/users`.
 *
 * @module components/app/navModel
 * @typedef {{id: string, label: string, path: string, icon?: string, page?: string, hidden?: boolean}} NavItem
 * @typedef {{id: string, title: string | null, path?: string, items: NavItem[]}} NavGroup
 *   `path` (titled groups only) is the bare group address, e.g. `/ai`.
 * @typedef {{label: string, href?: string}} Crumb
 */

/** Whether `pathname` is `path` or below it (`/` matches only itself). */
export function pathMatches(pathname, path) {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Every item of every group, in menu order.
 * @param {NavGroup[]} groups
 * @returns {NavItem[]}
 */
export function navItems(groups) {
  return groups.flatMap((group) => group.items);
}

/**
 * The item that `pathname` belongs to, with its group; null for an unknown path. The longest matching path wins,
 * so `/server-log/audit` resolves to Audit Log, not to Server Log (`/server-log`).
 * @param {NavGroup[]} groups
 * @param {string} pathname
 * @returns {{group: NavGroup, item: NavItem} | null}
 */
export function resolveNav(groups, pathname) {
  let best = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (pathMatches(pathname, item.path) && (!best || item.path.length > best.item.path.length)) best = { group, item };
    }
  }
  return best;
}

/**
 * Breadcrumb trail: group title (text, only when the group has one and the page is not named like it), then the
 * page, e.g. `Konfigurasi AI / Umum`; `Server Log` alone for the Server Log page. No crumb is a link.
 * @param {NavGroup[]} groups
 * @param {string} pathname
 * @returns {Crumb[]}
 */
export function breadcrumbTrail(groups, pathname) {
  const found = resolveNav(groups, pathname);
  if (!found) return [];
  const trail = [];
  if (found.group.title && found.group.title !== found.item.label) trail.push({ label: found.group.title });
  trail.push({ label: found.item.label });
  return trail;
}

/**
 * Default document title segment for a path (the page label).
 * @param {NavGroup[]} groups
 * @param {string} pathname
 * @returns {string | null}
 */
export function navTitleFor(groups, pathname) {
  return resolveNav(groups, pathname)?.item.label ?? null;
}

/**
 * Two-letter initials for the avatar from a display name, falling back to the email's local part.
 * @param {{name?: string, email?: string} | null | undefined} user
 * @returns {string}
 */
export function initialsFor(user) {
  const source = String(user?.name ?? '').trim() || String(user?.email ?? '').split('@')[0];
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : [[...words[0]][0], [...words[1]][0]];
  return letters.join('').toLocaleUpperCase('id');
}
