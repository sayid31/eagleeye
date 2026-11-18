// src/lib/sidebarState.js
/**
 * Remembers whether the desktop sidebar is expanded (localStorage key `gev-sidebar`, "open" | "closed").
 * Replaces shadcn's cookie so nothing extra is sent with every request, map included.
 *
 * @module lib/sidebarState
 */

export const SIDEBAR_STORAGE_KEY = 'gev-sidebar';

/**
 * Saved state; expanded unless the visitor collapsed it. Unreadable storage means expanded.
 * @param {Pick<Storage, 'getItem'> | null | undefined} [storage]
 * @returns {boolean}
 */
export function readSidebarOpen(storage = typeof window === 'undefined' ? null : window.localStorage) {
  try {
    return storage?.getItem(SIDEBAR_STORAGE_KEY) !== 'closed';
  } catch {
    // Best effort: without storage the sidebar starts expanded.
    return true;
  }
}

/**
 * @param {boolean} open
 * @param {Pick<Storage, 'setItem'> | null | undefined} [storage]
 * @returns {boolean} false when the state could not be saved (it then lasts for this visit only).
 */
export function writeSidebarOpen(open, storage = typeof window === 'undefined' ? null : window.localStorage) {
  try {
    storage.setItem(SIDEBAR_STORAGE_KEY, open ? 'open' : 'closed');
    return true;
  } catch {
    // Reported through the return value; the in-memory state still applies.
    return false;
  }
}
