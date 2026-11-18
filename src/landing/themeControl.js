// src/landing/themeControl.js
/**
 * Pure model of the landing's Terang / Gelap / Sistem control. The DOM wiring lives in landingChrome.js; the
 * preference rules (key, normalisation, OS fallback) are the shared ones in src/lib/themeCore.js.
 *
 * @module landing/themeControl
 */

import { THEME_PREFERENCES, normalizePreference } from '../lib/themeCore.js';

/** Accessible names of the three choices (also used as `aria-label`: the buttons are icon-only). */
export const THEME_LABELS = Object.freeze({ light: 'Terang', dark: 'Gelap', system: 'Sistem' });

/**
 * State of each button for the current preference.
 * @param {unknown} preference
 * @returns {Array<{value: 'light' | 'dark' | 'system', label: string, pressed: boolean}>}
 */
export function themeControlModel(preference) {
  const current = normalizePreference(preference);
  return THEME_PREFERENCES.map((value) => ({ value, label: THEME_LABELS[value], pressed: value === current }));
}
