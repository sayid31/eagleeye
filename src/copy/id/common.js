// src/copy/id/common.js
/**
 * Indonesian UI strings shared by every React surface (buttons, states, table chrome, copy-to-clipboard, theme).
 * Pure data; components import from here instead of writing literals. See glossary.js for the terminology rule.
 *
 * @module copy/id/common
 */

export const APP_NAME = 'EagleEye View';

export const COMMON_COPY = Object.freeze({
  appName: APP_NAME,
  cancel: 'Batal',
  close: 'Tutup',
  save: 'Simpan',
  saving: 'Menyimpan…',
  saved: 'Tersimpan',
  retry: 'Coba lagi',
  reload: 'Muat ulang',
  loading: 'Memuat…',
  continue: 'Lanjutkan',
  done: 'Selesai',
  search: 'Cari',
  clear: 'Hapus',
  moreActions: 'Aksi lainnya',
  required: 'wajib diisi',
  yes: 'Ya',
  no: 'Tidak',
});

export const THEME_COPY = Object.freeze({
  toggle: 'Tema tampilan',
  light: 'Terang',
  dark: 'Gelap',
  system: 'Sistem',
});

export const COPY_FIELD_COPY = Object.freeze({
  copy: 'Salin',
  copied: 'Tersalin',
  copyFailed: 'Gagal menyalin. Pilih teksnya lalu salin manual.',
});

export const PASSWORD_INPUT_COPY = Object.freeze({
  show: 'Tampilkan password',
  hide: 'Sembunyikan password',
  minLength: (min) => `Minimal ${min} karakter.`,
});

export const STATE_COPY = Object.freeze({
  emptyTitle: 'Belum ada data',
  emptyDescription: 'Data akan muncul di sini setelah ada isinya.',
  errorTitle: 'Data tidak bisa dimuat',
  loadingLabel: 'Memuat data',
  noMatchTitle: 'Tidak ada hasil',
  noMatchDescription: 'Tidak ada data yang cocok dengan pencarian atau filter ini.',
});

export const TABLE_COPY = Object.freeze({
  pageSize: 'Baris per halaman',
  previous: 'Sebelumnya',
  next: 'Berikutnya',
  pagination: 'Halaman data',
  range: (from, to, total) => `${from}–${to} dari ${total}`,
  rowActions: (name) => `Aksi untuk ${name}`,
});

export const STATUS_COPY = Object.freeze({
  active: 'Aktif',
  inactive: 'Nonaktif',
  throttled: 'Ter-throttle',
  mustChangePassword: 'Wajib ganti password',
  success: 'Berhasil',
  failed: 'Gagal',
  on: 'aktif',
  off: 'nonaktif',
});

/** Health states of system pages / provider cards (StatusBadge keys ok, warn, error, off, unknown). */
export const HEALTH_STATUS_COPY = Object.freeze({ ok: 'Baik', warn: 'Peringatan', error: 'Masalah', off: 'Nonaktif', unknown: 'Tanpa data' });

export const CONFIRM_COPY = Object.freeze({
  typeToConfirm: (value) => `Ketik ${value} untuk konfirmasi`,
  reason: 'Alasan',
  password: 'Password Anda',
});
