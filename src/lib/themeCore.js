// src/lib/themeCore.js
/**
 * Theme preference logic shared by the React surfaces and the inline anti-flash script: one localStorage key
 * (`gev-theme`) holds `light` or `dark` (an explicit pick) or is absent/`system` (no pick yet: follow the OS).
 * The React toggle and the landing control offer only light/dark; `system` stays a valid stored value because older
 * visits wrote it. Pure; no React, no DOM globals
 * at import time, so node:test can run it.
 *
 * @module lib/themeCore
 */

export const THEME_STORAGE_KEY = 'gev-theme';
export const THEME_PREFERENCES = Object.freeze(['light', 'dark', 'system']);
/** The two choices the React toggle offers; `system` is only the "no explicit choice yet" state. */
export const THEME_CHOICES = Object.freeze(['light', 'dark']);
export const DEFAULT_THEME_PREFERENCE = 'system';
export const DARK_CLASS = 'dark';
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * A saved value if it is one of the three preferences, otherwise `system`.
 * @param {unknown} value
 * @returns {'light' | 'dark' | 'system'}
 */
export function normalizePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : DEFAULT_THEME_PREFERENCE;
}

/**
 * The theme to paint: an explicit choice wins, `system` follows the OS.
 * @param {unknown} preference
 * @param {boolean} prefersDark Whether the OS asks for a dark scheme.
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(preference, prefersDark) {
  const normalized = normalizePreference(preference);
  if (normalized === 'system') return prefersDark ? 'dark' : 'light';
  return normalized;
}

/**
 * Read the saved preference; storage that is missing or throws (private mode, blocked cookies) means `system`.
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * @returns {'light' | 'dark' | 'system'}
 */
export function readStoredPreference(storage) {
  try {
    return normalizePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    // Reading is best effort: without storage the visitor simply gets the OS theme.
    return DEFAULT_THEME_PREFERENCE;
  }
}

/**
 * Save the preference.
 * @param {Pick<Storage, 'setItem'> | null | undefined} storage
 * @param {unknown} preference
 * @returns {boolean} false when it could not be saved (the choice then lasts for this visit only).
 */
export function writeStoredPreference(storage, preference) {
  try {
    storage.setItem(THEME_STORAGE_KEY, normalizePreference(preference));
    return true;
  } catch {
    // Reported through the return value: the caller keeps the in-memory choice.
    return false;
  }
}

/**
 * Paint a resolved theme on the root element: the `dark` class (token switch) and `color-scheme` (native controls,
 * scrollbars).
 * @param {{classList: {toggle: (name: string, force: boolean) => unknown}, style: {colorScheme: string}}} root
 * @param {'light' | 'dark'} resolved
 */
export function applyTheme(root, resolved) {
  root.classList.toggle(DARK_CLASS, resolved === 'dark');
  root.style.colorScheme = resolved;
}

/**
 * Inline script for the `<head>` of admin.html, login.html and landing.html, placed BEFORE any stylesheet so the first
 * paint already has the right theme (no flash). Mirrors resolveTheme/applyTheme above; src/lib/theme.test.mjs runs it
 * in a simulated browser and checks that the three HTML files embed exactly this text. If a CSP is ever added, give
 * this script a nonce or hash.
 */
export const THEME_INIT_SCRIPT = `(function(){var p='system';try{p=localStorage.getItem('${THEME_STORAGE_KEY}')||'system'}catch(e){p='system'}if(p!=='light'&&p!=='dark')p='system';var d=p==='dark'||(p==='system'&&typeof matchMedia==='function'&&matchMedia('${DARK_MEDIA_QUERY}').matches);var r=document.documentElement;r.classList.toggle('${DARK_CLASS}',d);r.style.colorScheme=d?'dark':'light'})();`;
