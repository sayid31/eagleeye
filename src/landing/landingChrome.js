// src/landing/landingChrome.js
/**
 * DOM wiring of the landing header: the theme control and the narrow-screen menu. State rules are pure and tested in
 * themeControl.js / mobileMenu.js; this file only reads and writes attributes.
 *
 * @module landing/landingChrome
 */

import { applyTheme, DARK_MEDIA_QUERY, readStoredPreference, resolveTheme, writeStoredPreference } from '../lib/themeCore.js';
import { menuAttributes, nextMenuState, shouldReturnFocus } from './mobileMenu.js';
import { themeControlModel } from './themeControl.js';

function safeStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn(`[landing] localStorage unavailable, the theme choice lasts for this visit only: ${error.message}`);
    return null;
  }
}

/** Wire the Terang/Gelap/Sistem buttons; "Sistem" also follows OS changes while selected. */
export function mountThemeControl(root = document) {
  const group = root.querySelector('.ld-theme');
  if (!group) return;
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  const storage = safeStorage();
  let preference = readStoredPreference(storage);
  const paint = () => {
    applyTheme(document.documentElement, resolveTheme(preference, media.matches));
    for (const state of themeControlModel(preference)) {
      group.querySelector(`[data-theme-value="${state.value}"]`)?.setAttribute('aria-pressed', String(state.pressed));
    }
  };
  group.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-value]');
    if (!button) return;
    preference = button.dataset.themeValue;
    writeStoredPreference(storage, preference);
    paint();
  });
  media.addEventListener('change', paint);
  paint();
}

/** Wire the disclosure button of the narrow-screen menu. */
export function mountMobileMenu(root = document) {
  const header = root.querySelector('.ld-header');
  const button = header?.querySelector('.ld-menu-btn');
  const nav = header?.querySelector('.ld-panel');
  if (!header || !button || !nav) return;
  let open = false;
  const render = () => {
    const attrs = menuAttributes(open);
    button.setAttribute('aria-expanded', attrs.expanded);
    button.setAttribute('aria-label', attrs.label);
    header.dataset.menuOpen = attrs.headerOpen;
  };
  const apply = (action) => {
    open = nextMenuState(open, action);
    render();
  };
  button.addEventListener('click', () => apply('toggle'));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) apply('link');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open) return;
    const returnFocus = shouldReturnFocus({ open, focusInsidePanel: header.contains(document.activeElement) });
    apply('escape');
    if (returnFocus) button.focus();
  });
  document.addEventListener('click', (event) => {
    if (open && !header.contains(event.target)) apply('outside');
  });
  render();
}
