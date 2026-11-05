// src/admin/adminTheme.js
/**
 * Light/dark choice for the admin dashboard. Kept separate from the map
 * app's theme tokens on purpose: /admin is a plain dashboard, not POWER UP.
 *
 * @module admin/adminTheme
 */

export const ADMIN_THEME_KEY = 'gev-admin-theme';
export const ADMIN_THEMES = Object.freeze(['dark', 'light']);

/**
 * Pick the theme to show: a valid saved choice wins, otherwise follow the OS.
 * @param {string | null | undefined} stored
 * @param {boolean} prefersDark
 * @returns {'dark' | 'light'}
 */
export function resolveTheme(stored, prefersDark) {
  if (ADMIN_THEMES.includes(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

/**
 * @param {'dark' | 'light'} theme
 * @returns {'dark' | 'light'}
 */
export function nextTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark';
}
