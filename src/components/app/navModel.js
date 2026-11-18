// src/components/app/navModel.js
/**
 * Pure model of a sidebar menu used by AppShell: groups of items, an item optionally having tabs (sub-routes shown as
 * tabs on the page, not in the sidebar). All paths are relative to the router basename, like `/users`.
 *
 * @module components/app/navModel
 * @typedef {{id: string, label: string, path: string, page?: string}} NavTab
 * @typedef {{id: string, label: string, path: string, icon?: string, page?: string, tabs?: NavTab[]}} NavItem
 * @typedef {{id: string, title: string | null, items: NavItem[]}} NavGroup
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
 * The item (and tab) that `pathname` belongs to, with its group; null for an unknown path.
 * The longest matching path wins, so `/usage/ai` resolves to the tab, not just the item.
 * @param {NavGroup[]} groups
 * @param {string} pathname
 * @returns {{group: NavGroup, item: NavItem, tab: NavTab | null} | null}
 */
export function resolveNav(groups, pathname) {
  let best = null;
  for (const group of groups) {
    for (const item of group.items) {
      const candidates = [{ tab: null, path: item.path }, ...(item.tabs ?? []).map((tab) => ({ tab, path: tab.path }))];
      for (const candidate of candidates) {
        if (pathMatches(pathname, candidate.path) && (!best || candidate.path.length > best.length)) {
          best = { group, item, tab: candidate.tab, length: candidate.path.length };
        }
      }
    }
  }
  return best ? { group: best.group, item: best.item, tab: best.tab } : null;
}

/**
 * Breadcrumb trail: group title (text, only when the group has one), page, tab. The last crumb is the current page and
 * has no href; earlier crumbs link only when they are pages themselves.
 * @param {NavGroup[]} groups
 * @param {string} pathname
 * @returns {Crumb[]}
 */
export function breadcrumbTrail(groups, pathname) {
  const found = resolveNav(groups, pathname);
  if (!found) return [];
  const trail = [];
  if (found.group.title) trail.push({ label: found.group.title });
  trail.push(found.tab ? { label: found.item.label, href: found.item.path } : { label: found.item.label });
  if (found.tab) trail.push({ label: found.tab.label });
  return trail;
}

/**
 * Default document title segment for a path (the tab label when there is one, else the page label).
 * @param {NavGroup[]} groups
 * @param {string} pathname
 * @returns {string | null}
 */
export function navTitleFor(groups, pathname) {
  const found = resolveNav(groups, pathname);
  if (!found) return null;
  return found.tab ? `${found.item.label}: ${found.tab.label}` : found.item.label;
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
