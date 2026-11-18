// src/landing/mobileMenu.js
/**
 * Pure state rules of the landing's narrow-screen menu, a disclosure button (not a modal): it toggles a panel, has no
 * focus trap, Esc and choosing a link close it, and Esc hands focus back to the button when it was inside the panel.
 *
 * @module landing/mobileMenu
 */

export const MENU_LABELS = Object.freeze({ open: 'Buka menu', close: 'Tutup menu' });

/**
 * Attributes the button and header must carry for a state.
 * @param {boolean} open
 * @returns {{expanded: 'true' | 'false', label: string, headerOpen: 'true' | 'false'}}
 */
export function menuAttributes(open) {
  return { expanded: open ? 'true' : 'false', label: open ? MENU_LABELS.close : MENU_LABELS.open, headerOpen: open ? 'true' : 'false' };
}

/**
 * Next open state after a user action.
 * @param {boolean} open
 * @param {'toggle' | 'escape' | 'link' | 'outside'} action
 * @returns {boolean}
 */
export function nextMenuState(open, action) {
  if (action === 'toggle') return !open;
  return action === 'escape' || action === 'link' || action === 'outside' ? false : open;
}

/**
 * Whether Esc should move focus back to the menu button: only when the menu was open and focus sat inside the panel
 * (or on the button itself, where focus already is).
 * @param {{open: boolean, focusInsideNav: boolean}} state
 * @returns {boolean}
 */
export function shouldReturnFocus({ open, focusInsideNav }) {
  return open && focusInsideNav;
}
