/**
 * Pure model of the /admin Ringkasan: which stat cards to show from `/api/admin/users/stats` and whether the account
 * list is empty (then the page offers "Buat pengguna pertama" instead of a wall of zeros).
 *
 * @module admin/users/overviewView
 */

/** Cards in display order: stats key → icon key (the page maps keys to lucide icons). */
export const OVERVIEW_CARDS = Object.freeze([
  { key: 'active', icon: 'users' },
  { key: 'inactive', icon: 'userX' },
  { key: 'throttled', icon: 'clock' },
  { key: 'mustChangePassword', icon: 'key' },
  { key: 'logins24h', icon: 'login' },
  { key: 'failed24h', icon: 'alert' },
]);

/**
 * @param {Record<string, number> | null | undefined} stats
 * @returns {Array<{key: string, icon: string, value: number}>} Counters default to 0 when the reply lacks one.
 */
export function overviewCards(stats) {
  return OVERVIEW_CARDS.map(({ key, icon }) => ({ key, icon, value: Number.isFinite(stats?.[key]) ? stats[key] : 0 }));
}

/** True when there is no account at all (and nothing to count). @param {{total?: number} | null | undefined} stats */
export function overviewIsEmpty(stats) {
  return Boolean(stats) && !(stats.total > 0);
}
