// src/components/app/pageTitle.js
/**
 * Document title convention: "<page> · EagleEye View". Pure so it can be tested without a DOM.
 *
 * @module components/app/pageTitle
 */
import { APP_NAME } from '../../copy/en/common.js';

export const TITLE_SEPARATOR = ' · ';

/**
 * @param {string | null | undefined} page Page title; empty means the app name alone.
 * @returns {string}
 */
export function documentTitle(page) {
  const text = String(page ?? '').trim();
  return text ? `${text}${TITLE_SEPARATOR}${APP_NAME}` : APP_NAME;
}
