/**
 * Indonesian UI strings of `/login`, `/account` and `/account/password` (one place to review or translate).
 * Technical terms (email, password, Google) stay in English, as in the rest of the console.
 *
 * @module copy/id/login
 */

import { PASSWORD_MAX } from '../../auth/passwordPolicy.mjs';
import { APP_NAME } from './common.js';

export const LOGIN_COPY = Object.freeze({
  title: `Masuk ke ${APP_NAME}`,
  lead: 'Masuk dengan akun yang dibuat admin.',
  pageTitle: 'Masuk',
  checking: 'Memeriksa sesi…',
  notConfiguredTitle: 'Login belum dikonfigurasi',
  notConfiguredBody: 'Server belum menyiapkan login. Pemilik server dapat menjalankan',
  notConfiguredCommand: 'npm run doctor',
  sessionCheckFailed: 'Sesi tidak bisa diperiksa. Muat ulang halaman ini.',
  email: 'Email',
  emailRequired: 'Isi email Anda.',
  password: 'Password',
  passwordRequired: 'Isi password Anda.',
  submit: 'Masuk',
  submitting: 'Memproses…',
  google: 'Masuk dengan Google',
  googleStarting: 'Membuka Google…',
  googleStartFailed: 'Google tidak bisa dibuka. Coba lagi.',
  divider: 'atau',
  forgot: 'Lupa password?',
  forgotTitle: 'Lupa password?',
  forgotAnswer: 'Hubungi admin Anda untuk mengatur ulang password.',
  backHome: 'Kembali ke beranda',
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
  title: 'Ganti password',
  forcedLead: 'Password Anda diatur oleh admin. Pilih password baru sebelum melanjutkan.',
  voluntaryLead: 'Pilih password baru untuk akun Anda.',
  forcedAlertTitle: 'Ganti password untuk melanjutkan',
  forcedAlertBody: 'Anda belum bisa memakai EagleEye View sebelum memilih password sendiri.',
  otherDevices: 'Setelah diganti, perangkat lain otomatis dikeluarkan.',
  current: 'Password saat ini',
  next: 'Password baru',
  nextDescription: 'Kalimat panjang lebih kuat dari kombinasi simbol.',
  confirm: 'Ulangi password baru',
  requirementsLabel: 'Syarat password baru',
  /** @param {number} min */
  requirementLength: (min) => `Minimal ${min} karakter`,
  requirementIdentity: 'Bukan email atau nama Anda',
  requirementDifferent: 'Berbeda dari password saat ini',
  requirementMatch: 'Kedua password baru sama',
  requirementMet: 'terpenuhi',
  requirementUnmet: 'belum terpenuhi',
  submit: 'Simpan password',
  submitting: 'Menyimpan…',
  success: 'Password berhasil diganti.',
  redirecting: 'Mengalihkan…',
  signOut: 'Keluar',
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
  description: 'Kelola profil dan keamanan akun Anda.',
  tabsLabel: 'Bagian akun',
  tabProfile: 'Profil',
  tabSecurity: 'Keamanan',
  back: 'Kembali',
  backToMap: 'Kembali ke peta',
  backToAdmin: 'Kembali ke Admin',
  backToDev: 'Kembali ke Developer',
  loading: 'Memuat akun',
  loadFailedTitle: 'Akun tidak bisa dimuat',
  loadFailed: 'Periksa koneksi Anda lalu coba lagi.',
  profileTitle: 'Profil',
  profileDescription: 'Nama tampilan Anda di EagleEye View.',
  email: 'Email',
  emailNote: 'Email tidak bisa diubah sendiri. Hubungi admin bila perlu.',
  name: 'Nama tampilan',
  saveName: 'Simpan perubahan',
  nameSaved: 'Nama disimpan.',
  nameRequired: 'Nama tidak boleh kosong.',
  /** @param {number} max */
  nameTooLong: (max) => `Nama maksimal ${max} karakter.`,
  nameFailed: 'Nama tidak bisa disimpan. Coba lagi.',
  passwordTitle: 'Password',
  googleManagedTitle: 'Password dikelola Google',
  googleManaged: 'Akun ini masuk lewat Google. Password dan verifikasi 2 langkah dikelola di akun Google Anda.',
  sessionsTitle: 'Perangkat lain',
  sessionsLead: 'Keluarkan akun ini dari semua perangkat lain. Perangkat ini tetap masuk.',
  revokeOthers: 'Keluar dari perangkat lain',
  revokeTitle: 'Keluar dari perangkat lain?',
  revokeImpact: 'Semua perangkat lain yang memakai akun ini akan keluar dan harus masuk lagi. Perangkat ini tetap masuk. Anda bisa masuk lagi di perangkat itu kapan saja.',
  revoked: 'Perangkat lain sudah dikeluarkan.',
  signOut: 'Keluar',
  signingOut: 'Keluar…',
});

/** Role names as shown to the account holder. */
export const ROLE_LABELS = Object.freeze({ user: 'Pengguna', admin: 'Admin', super_admin: 'Developer (super admin)' });
