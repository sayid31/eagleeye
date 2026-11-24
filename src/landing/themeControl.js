// src/landing/themeControl.js
/**
 * Pure model of the landing's Light / Dark control. The DOM wiring lives in landingChrome.js; the preference rules
 * (key, normalisation, OS fallback) are the shared ones in src/lib/themeCore.js. There is no System button: with
 * nothing stored (or a stored `system`) the OS theme is painted and the matching button is shown as pressed.
 *
 * @module landing/themeControl
 */

import { THEME_CHOICES, resolveTheme } from '../lib/themeCore.js';

/** Accessible names of the two choices (also used as `aria-label`: the buttons are icon-only). */
export const THEME_LABELS = Object.freeze({ light: 'Light', dark: 'Dark' });

/**
 * State of each button: the pressed one is the theme currently painted.
 * @param {unknown} preference Stored preference (`light`, `dark`, or anything else = follow the OS).
 * @param {boolean} prefersDark Whether the OS asks for a dark scheme.
 * @returns {Array<{value: 'light' | 'dark', label: string, pressed: boolean}>}
 */
export function themeControlModel(preference, prefersDark) {
  const painted = resolveTheme(preference, prefersDark);
  return THEME_CHOICES.map((value) => ({ value, label: THEME_LABELS[value], pressed: value === painted }));
}
