// src/admin/dev/devText.js
/**
 * Messages of the `/dev` system API (devHttp.mjs: `{error: CODE, message}` replies). Server side only: the pages never
 * show these; they word an error with `errorMessage()` from src/copy/id/errors.js, and every other UI string of the
 * system pages lives in src/copy/id/system.js and systemLogs.js.
 *
 * @module admin/dev/devText
 */

/** API error code → message (server replies and client fallbacks). */
export const DEV_ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'Isian tidak valid.',
  INVALID_JSON: 'Body bukan JSON yang valid.',
  BODY_TOO_LARGE: 'Body terlalu besar.',
  METHOD_NOT_ALLOWED: 'Metode tidak didukung.',
  NOT_FOUND: 'Endpoint tidak ada.',
  REAUTH_FAILED: 'Password salah.',
  REAUTH_REQUIRED: 'Masukkan password Anda, atau masuk ulang dengan Google lalu coba lagi dalam 10 menit.',
  AUTH_UNAVAILABLE: 'Login sedang tidak tersedia; lihat Server Log.',
  INTERNAL_ERROR: 'Terjadi error di server; lihat Server Log.',
  SUPER_ADMIN_REQUIRED: 'Hanya super admin yang boleh mengakses ini.',
  AUTH_REQUIRED: 'Sesi berakhir; masuk lagi.',
});
