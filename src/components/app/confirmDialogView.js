// src/components/app/confirmDialogView.js
/**
 * Pure rules of ConfirmDialog: when the confirm button may be pressed, given the optional guard inputs (type the
 * subject, a reason, the signed-in password).
 *
 * @module components/app/confirmDialogView
 */

export const MIN_REASON_LENGTH = 3;

/**
 * Whether the typed text equals the subject (trimmed, case-insensitive: emails compare that way on the server).
 * @param {string} typed
 * @param {string} expected
 * @returns {boolean}
 */
export function typedMatches(typed, expected) {
  const wanted = String(expected ?? '').trim().toLowerCase();
  return wanted.length > 0 && String(typed ?? '').trim().toLowerCase() === wanted;
}

/**
 * @param {{
 *   typeToConfirm?: {value: string} | null,
 *   reason?: {required?: boolean, minLength?: number} | null,
 *   password?: {required?: boolean} | null,
 *   values: {typed?: string, reason?: string, password?: string},
 *   busy?: boolean,
 * }} input
 * @returns {{canConfirm: boolean, missing: Array<'typed' | 'reason' | 'password'>}}
 */
export function confirmState({ typeToConfirm = null, reason = null, password = null, values, busy = false }) {
  const missing = [];
  if (typeToConfirm && !typedMatches(values.typed, typeToConfirm.value)) missing.push('typed');
  if (reason?.required !== false && reason) {
    if (String(values.reason ?? '').trim().length < (reason.minLength ?? MIN_REASON_LENGTH)) missing.push('reason');
  }
  if (password && password.required !== false && !String(values.password ?? '')) missing.push('password');
  return { canConfirm: !busy && missing.length === 0, missing };
}
