// src/copy/en/errors.js
/**
 * One place that turns an API error into a sentence a person can act on. The UI never shows a raw code or an HTTP
 * status ("503 FEATURE_DISABLED"); it shows `errorMessage(...)`. Accepts a bare code, an API payload
 * (`{error|code, field?, reason?, min?}`), a `Response`-like `{status}`, or an Error carrying `.code`/`.status`/`.field`
 * (what the api modules throw). Resolution: known code → status class → generic sentence.
 *
 * @module copy/en/errors
 */

export const ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'Data yang dikirim tidak valid. Periksa isian lalu coba lagi.',
  INVALID_JSON: 'Permintaan tidak bisa dibaca. Muat ulang halaman lalu coba lagi.',
  JSON_REQUIRED: 'Permintaan tidak bisa dibaca. Muat ulang halaman lalu coba lagi.',
  BAD_REQUEST: 'Permintaan tidak valid. Muat ulang halaman lalu coba lagi.',
  FIELD_NOT_ALLOWED: 'Ada isian yang tidak boleh diubah.',
  BODY_TOO_LARGE: 'Data yang dikirim terlalu besar.',
  RESPONSE_TOO_LARGE: 'Jawaban dari server terlalu besar untuk ditampilkan.',
  NOT_FOUND: 'Data yang dicari tidak ditemukan. Mungkin sudah dihapus.',
  PROVIDER_NOT_FOUND: 'Penyedia ini tidak dikenal.',
  UNKNOWN_ACTION: 'Aksi ini tidak dikenal.',
  METHOD_NOT_ALLOWED: 'Aksi ini tidak didukung. Muat ulang halaman lalu coba lagi.',
  AUTH_REQUIRED: 'Sesi Anda berakhir. Masuk lagi untuk melanjutkan.',
  UNAUTHORIZED: 'Sesi Anda berakhir. Masuk lagi untuk melanjutkan.',
  FORBIDDEN: 'Anda tidak punya izin untuk aksi ini.',
  ADMIN_REQUIRED: 'Hanya admin yang boleh membuka ini.',
  SUPER_ADMIN_REQUIRED: 'Hanya super admin yang boleh melakukan ini.',
  CAPABILITY_REQUIRED: 'Fitur ini belum diaktifkan untuk akun Anda. Hubungi admin.',
  FEATURE_DISABLED: 'Fitur ini sedang dimatikan sementara oleh administrator.',
  TARGET_FORBIDDEN: 'Anda tidak boleh mengubah akun ini.',
  TARGET_IS_SUPER_ADMIN: 'Akun super admin hanya diatur lewat konfigurasi server.',
  CANNOT_ACT_ON_SELF: 'Aksi ini tidak bisa dilakukan pada akun Anda sendiri.',
  ROLE_NOT_ASSIGNABLE: 'Anda tidak boleh memberikan role ini.',
  EMAIL_TAKEN: 'Email ini sudah dipakai akun lain.',
  SUPER_ADMIN_EMAIL_RESERVED: 'Email ini dicadangkan untuk super admin.',
  PASSWORD_WEAK: 'Password terlalu lemah.',
  REAUTH_FAILED: 'Password Anda salah.',
  REAUTH_REQUIRED: 'Masuk ulang dengan Google dulu (paling lama 10 menit sebelum aksi ini), lalu coba lagi.',
  CONFIRM_EMAIL_MISMATCH: 'Email konfirmasi tidak sama dengan email akun.',
  PASSWORD_CHANGE_REQUIRED: 'Anda harus mengganti password dulu.',
  INVALID_EMAIL_OR_PASSWORD: 'Email atau password salah.',
  ACCOUNT_DISABLED: 'Akun ini nonaktif. Hubungi admin.',
  GOOGLE_SIGN_IN_REQUIRED: 'Akun ini masuk lewat Google.',
  GOOGLE_NOT_ALLOWED: 'Akun Google ini tidak diizinkan masuk.',
  SOCIAL_SIGN_IN_REFUSED: 'Masuk lewat Google ditolak.',
  SIGN_UP_DISABLED: 'Pendaftaran mandiri tidak tersedia. Minta akun ke admin.',
  RATE_LIMITED: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
  ORIGIN_NOT_ALLOWED: 'Permintaan ditolak karena berasal dari alamat yang tidak dikenal.',
  CROSS_SITE_REFUSED: 'Permintaan ditolak karena berasal dari situs lain.',
  AUTH_UNAVAILABLE: 'Layanan login sedang tidak tersedia. Coba lagi nanti.',
  AUTH_NOT_CONFIGURED: 'Login belum dikonfigurasi di server ini.',
  INTERNAL_ERROR: 'Terjadi kesalahan di server. Lihat Server Log untuk detailnya.',
});

/** HTTP status class → sentence, used when the code is missing or unknown. */
export const STATUS_MESSAGES = Object.freeze({
  400: ERROR_MESSAGES.BAD_REQUEST,
  401: ERROR_MESSAGES.AUTH_REQUIRED,
  403: ERROR_MESSAGES.FORBIDDEN,
  404: ERROR_MESSAGES.NOT_FOUND,
  405: ERROR_MESSAGES.METHOD_NOT_ALLOWED,
  429: ERROR_MESSAGES.RATE_LIMITED,
  503: ERROR_MESSAGES.AUTH_UNAVAILABLE,
});

export const GENERIC_ERROR = 'Terjadi masalah. Coba lagi sebentar lagi.';
export const NETWORK_ERROR = 'Tidak bisa terhubung ke server. Periksa koneksi Anda lalu coba lagi.';

const PASSWORD_REASONS = Object.freeze({
  too_short: (min) => (Number.isFinite(min) ? `Password minimal ${min} karakter.` : 'Password terlalu pendek.'),
  too_long: () => 'Password maksimal 128 karakter.',
  matches_identity: () => 'Password tidak boleh sama dengan email atau nama.',
});

/** Field name (as the API reports it) → how the form labels it. */
export const FIELD_LABELS = Object.freeze({
  email: 'email', name: 'nama', role: 'role', capabilities: 'izin fitur', password: 'password', generate: 'pilihan password',
  currentPassword: 'password Anda', confirmEmail: 'email konfirmasi', q: 'pencarian', status: 'status', userId: 'pengguna',
  success: 'hasil', action: 'aksi', targetId: 'akun', source: 'sumber', id: 'akun', reason: 'alasan', gate: 'gate',
});

function normalize(problem) {
  if (typeof problem === 'string') return { code: problem };
  if (problem instanceof TypeError) return { code: null, network: true };
  if (!problem || typeof problem !== 'object') return {};
  return {
    code: problem.error ?? problem.code ?? null,
    status: Number.isInteger(problem.status) ? problem.status : null,
    field: problem.field ?? null,
    reason: problem.reason ?? null,
    min: problem.min,
  };
}

/**
 * Sentence for an API problem; never contains a raw code or HTTP status.
 * @param {unknown} problem See the module header for the accepted shapes.
 * @returns {string}
 */
export function errorMessage(problem) {
  const detail = normalize(problem);
  if (detail.network) return NETWORK_ERROR;
  if (detail.code === 'PASSWORD_WEAK' && PASSWORD_REASONS[detail.reason]) return PASSWORD_REASONS[detail.reason](detail.min);
  if (detail.code === 'INVALID_INPUT' && FIELD_LABELS[detail.field]) return `Isian ${FIELD_LABELS[detail.field]} tidak valid.`;
  if (detail.code && Object.hasOwn(ERROR_MESSAGES, detail.code)) return ERROR_MESSAGES[detail.code];
  if (detail.status && Object.hasOwn(STATUS_MESSAGES, detail.status)) return STATUS_MESSAGES[detail.status];
  if (detail.status && detail.status >= 500) return ERROR_MESSAGES.INTERNAL_ERROR;
  return GENERIC_ERROR;
}
