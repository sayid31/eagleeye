/**
 * Every Indonesian string shown by `/login`, `/account` and `/account/password`
 * (one place to review or translate). Technical terms (email, password, Google)
 * stay in English, as in the rest of the console.
 *
 * @module login/loginCopy
 */

import { PASSWORD_MAX } from '../auth/passwordPolicy.mjs';

export const BRAND = Object.freeze({ name: 'EagleEye', accent: 'View' });

export const LOGIN_COPY = Object.freeze({
  lead: 'Masuk dengan akun yang dibuat admin.',
  checking: 'Memeriksa sesi…',
  notConfiguredTitle: 'Login belum dikonfigurasi',
  notConfiguredBody: 'Server belum menyiapkan login. Pemilik server dapat menjalankan',
  notConfiguredCommand: 'npm run doctor',
  sessionCheckFailed: 'Sesi tidak bisa diperiksa. Muat ulang halaman ini.',
  email: 'Email',
  password: 'Password',
  submit: 'Masuk',
  submitting: 'Memproses…',
  google: 'Masuk dengan Google',
  googleStarting: 'Membuka Google…',
  googleStartFailed: 'Google tidak bisa dibuka. Coba lagi.',
  divider: 'atau',
  forgot: 'Lupa password?',
  forgotAnswer: 'Hubungi admin Anda untuk mengatur ulang password.',
  showPassword: 'Tampilkan password',
  hidePassword: 'Sembunyikan password',
});

/** Sign-in refusals by server code. Wrong password and throttled share the generic text on purpose. */
export const SIGN_IN_ERRORS = Object.freeze({
  INVALID_EMAIL_OR_PASSWORD: 'Email atau password salah.',
  INVALID_EMAIL: 'Email atau password salah.',
  ACCOUNT_DISABLED: 'Akun dinonaktifkan, hubungi admin.',
  GOOGLE_SIGN_IN_REQUIRED: 'Akun ini masuk lewat Google.',
  RATE_LIMITED: 'Terlalu banyak percobaan dari jaringan ini. Tunggu sebentar lalu coba lagi.',
  NETWORK: 'Server tidak bisa dihubungi. Periksa koneksi lalu coba lagi.',
});
export const SIGN_IN_GENERIC_ERROR = 'Gagal masuk. Silakan coba lagi.';

/** `?notice=` set by the server guard (`session`) or the forced Google error URL (`google`). */
export const LOGIN_NOTICES = Object.freeze({
  session: { tone: 'warn', text: 'Sesi berakhir. Silakan masuk lagi.' },
  // Generic for every Google refusal: which check failed is not shown.
  google: { tone: 'error', text: 'Masuk dengan Google tidak berhasil. Hanya akun developer terdaftar yang dapat memakai Google.' },
});

export const PASSWORD_COPY = Object.freeze({
  forcedTitle: 'Ganti password',
  forcedLead: 'Password Anda diatur oleh admin. Pilih password baru sebelum melanjutkan.',
  voluntaryLead: 'Pilih password baru untuk akun Anda.',
  otherDevices: 'Setelah diganti, perangkat lain otomatis dikeluarkan.',
  current: 'Password saat ini',
  next: 'Password baru',
  confirm: 'Ulangi password baru',
  /** @param {number} min */
  hint: (min) => `Minimal ${min} karakter, maksimal ${PASSWORD_MAX}. Bukan email atau nama Anda. Kalimat panjang lebih kuat dari kombinasi simbol.`,
  submit: 'Simpan password',
  submitting: 'Menyimpan…',
  success: 'Password berhasil diganti.',
  redirecting: 'Mengalihkan…',
  signOut: 'Keluar',
  backToAccount: 'Kembali ke akun',
});

/** Form checks (client) and server refusals of change-password. */
export const PASSWORD_ERRORS = Object.freeze({
  CURRENT_REQUIRED: 'Isi password saat ini.',
  MISMATCH: 'Kedua password baru tidak sama.',
  SAME_AS_CURRENT: 'Password baru harus berbeda dari password saat ini.',
  /** @param {number} min */
  TOO_SHORT: (min) => `Password baru minimal ${min} karakter.`,
  TOO_LONG: `Password baru maksimal ${PASSWORD_MAX} karakter.`,
  MATCHES_IDENTITY: 'Password baru tidak boleh sama dengan email atau nama Anda.',
  INVALID_PASSWORD: 'Password saat ini salah.',
  PASSWORD_WEAK: 'Password baru belum memenuhi syarat (panjang, bukan email/nama).',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'Akun ini tidak memakai password (masuk lewat Google).',
  SESSION_EXPIRED: 'Sesi berakhir. Silakan masuk lagi.',
  RATE_LIMITED: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
  NETWORK: 'Server tidak bisa dihubungi. Coba lagi.',
  GENERIC: 'Password tidak bisa diganti. Coba lagi.',
});

export const ACCOUNT_COPY = Object.freeze({
  title: 'Akun saya',
  back: 'Kembali',
  loading: 'Memuat akun…',
  loadFailed: 'Akun tidak bisa dimuat. Muat ulang halaman ini.',
  profile: 'Profil',
  email: 'Email',
  emailNote: 'Email tidak bisa diubah sendiri. Hubungi admin bila perlu.',
  role: 'Peran',
  name: 'Nama tampilan',
  saveName: 'Simpan nama',
  savingName: 'Menyimpan…',
  nameSaved: 'Nama disimpan.',
  nameRequired: 'Nama tidak boleh kosong.',
  /** @param {number} max */
  nameTooLong: (max) => `Nama maksimal ${max} karakter.`,
  nameFailed: 'Nama tidak bisa disimpan. Coba lagi.',
  passwordSection: 'Password',
  googleManaged: 'Akun ini masuk lewat Google — keamanannya (password, verifikasi 2 langkah) dikelola akun Google Anda.',
  sessions: 'Perangkat',
  sessionsLead: 'Keluarkan akun ini dari semua perangkat lain. Perangkat ini tetap masuk.',
  revokeOthers: 'Keluar dari perangkat lain',
  revoking: 'Memproses…',
  revoked: 'Perangkat lain sudah dikeluarkan.',
  revokeFailed: 'Perangkat lain tidak bisa dikeluarkan. Coba lagi.',
  signOut: 'Keluar',
});

/** Role names as shown to the account holder. */
export const ROLE_LABELS = Object.freeze({ user: 'Pengguna', admin: 'Admin', super_admin: 'Developer (super admin)' });
