/**
 * Client-side checks and messages of the change-password form. Pure; the
 * server enforces the same policy (`validatePassword` in a Better Auth hook).
 *
 * @module login/changePasswordView
 */

import { PASSWORD_MAX, PASSWORD_MIN_ADMIN, PASSWORD_MIN_USER } from '../auth/passwordPolicy.mjs';

export const CHANGE_PASSWORD_ERRORS = Object.freeze({
  INVALID_PASSWORD: 'Password saat ini salah.',
  PASSWORD_WEAK: 'Password baru terlalu pendek atau sama dengan email/nama.',
  PASSWORD_TOO_SHORT: 'Password baru terlalu pendek.',
  PASSWORD_TOO_LONG: `Password baru maksimal ${PASSWORD_MAX} karakter.`,
});

/**
 * @param {{currentPassword: string, newPassword: string, confirm: string}} input
 * @returns {string | null} A message, or null when the form may be sent.
 */
export function changePasswordProblem({ currentPassword, newPassword, confirm }) {
  if (!currentPassword) return 'Isi password saat ini.';
  if (newPassword !== confirm) return 'Kedua password baru tidak sama.';
  if (newPassword === currentPassword) return 'Password baru harus berbeda.';
  if ([...newPassword].length > PASSWORD_MAX) return CHANGE_PASSWORD_ERRORS.PASSWORD_TOO_LONG;
  // The role's exact minimum (12 or 15) is enforced by the server, which answers PASSWORD_WEAK.
  return [...newPassword].length < PASSWORD_MIN_USER ? `Password baru minimal ${PASSWORD_MIN_USER} karakter (admin: ${PASSWORD_MIN_ADMIN}).` : null;
}
