// src/admin/users/usersErrors.mjs
/**
 * Indonesian wording of every error code the account-management API answers
 * with (plan/auth/04 §Kontrak API). Server wording (`message` field) for API clients and
 * browser clients that read `message`; the admin UI itself renders copy/id/errors.js. Pure.
 *
 * @module admin/users/usersErrors
 */

export const USER_ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'Data yang dikirim tidak valid.',
  INVALID_JSON: 'Body permintaan harus JSON yang valid.',
  BODY_TOO_LARGE: 'Body permintaan terlalu besar.',
  NOT_FOUND: 'Akun tidak ditemukan.',
  METHOD_NOT_ALLOWED: 'Metode tidak didukung untuk alamat ini.',
  AUTH_REQUIRED: 'Login diperlukan.',
  ADMIN_REQUIRED: 'Hanya admin yang boleh mengakses ini.',
  SUPER_ADMIN_REQUIRED: 'Hanya super admin yang boleh melakukan ini.',
  TARGET_FORBIDDEN: 'Anda tidak boleh mengubah akun ini.',
  TARGET_IS_SUPER_ADMIN: 'Akun super admin hanya diatur lewat env dan CLI.',
  CANNOT_ACT_ON_SELF: 'Aksi ini tidak bisa dilakukan pada akun Anda sendiri.',
  ROLE_NOT_ASSIGNABLE: 'Anda tidak boleh memberikan role ini.',
  EMAIL_TAKEN: 'Email sudah dipakai akun lain.',
  SUPER_ADMIN_EMAIL_RESERVED: 'Email ini dicadangkan untuk super admin.',
  PASSWORD_WEAK: 'Password terlalu lemah.',
  REAUTH_FAILED: 'Password Anda salah.',
  REAUTH_REQUIRED: 'Masuk ulang dengan Google dulu (maksimal 10 menit sebelum aksi ini), lalu coba lagi.',
  CONFIRM_EMAIL_MISMATCH: 'Email konfirmasi tidak cocok dengan email akun.',
  AUTH_UNAVAILABLE: 'Layanan login sedang tidak tersedia.',
  INTERNAL_ERROR: 'Terjadi kesalahan di server; lihat Server Log.',
});

const PASSWORD_REASONS = Object.freeze({
  too_short: (min) => `Password minimal ${min} karakter.`,
  too_long: () => 'Password maksimal 128 karakter.',
  matches_identity: () => 'Password tidak boleh sama dengan email atau nama.',
});

const FIELD_LABELS = Object.freeze({
  email: 'email', name: 'nama', role: 'role', capabilities: 'izin fitur', password: 'password', generate: 'generate',
  currentPassword: 'password Anda', confirmEmail: 'email konfirmasi', q: 'pencarian', status: 'status', userId: 'pengguna',
  success: 'hasil', range: 'rentang waktu', action: 'aksi', targetId: 'akun', source: 'sumber', id: 'id akun',
});

/**
 * Message for an API error payload (`{error, field?, reason?, min?}`) or a bare code.
 * @param {string | {error?: string, code?: string, field?: string, reason?: string, min?: number}} problem
 * @returns {string}
 */
export function userErrorMessage(problem) {
  const detail = typeof problem === 'string' ? { error: problem } : (problem ?? {});
  const code = detail.error ?? detail.code ?? 'INTERNAL_ERROR';
  if (code === 'PASSWORD_WEAK' && PASSWORD_REASONS[detail.reason]) return PASSWORD_REASONS[detail.reason](detail.min);
  if (code === 'INVALID_INPUT' && FIELD_LABELS[detail.field]) return `Isian ${FIELD_LABELS[detail.field]} tidak valid.`;
  return USER_ERROR_MESSAGES[code] ?? 'Permintaan gagal.';
}
