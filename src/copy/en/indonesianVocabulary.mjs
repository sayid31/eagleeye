/**
 * Unambiguous Indonesian words (none is also an English word) used by the tests to keep the UI English-only.
 * Deliberately short and low-false-positive; add a word when a leftover slips through.
 *
 * @module copy/en/indonesianVocabulary
 */

export const INDONESIAN_WORDS = Object.freeze([
  'yang', 'dan', 'untuk', 'tidak', 'akun', 'silakan', 'belum', 'sudah', 'dengan', 'dari', 'ini', 'itu', 'atau', 'halaman',
  'pengguna', 'kata', 'sandi', 'gagal', 'berhasil', 'memuat', 'muat', 'simpan', 'tersimpan', 'menyimpan', 'batal', 'hapus',
  'ubah', 'tambah', 'buat', 'kirim', 'masuk', 'keluar', 'lupa', 'pilih', 'tampilkan', 'sembunyikan', 'salin', 'terang',
  'gelap', 'tersedia', 'kosong', 'menit', 'detik', 'hari', 'minggu', 'bulan', 'tahun', 'kemarin', 'sekarang', 'lagi',
  'coba', 'bisa', 'harus', 'hanya', 'semua', 'anda', 'kami', 'mohon', 'ringkasan', 'pemakaian', 'konfigurasi', 'penyedia',
  'umum', 'kesehatan', 'sistem', 'aktivitas', 'sakelar', 'darurat', 'jejak', 'pengaturan', 'peringatan', 'kesalahan',
  'tutup', 'buka', 'lihat', 'nonaktif', 'aktifkan', 'nonaktifkan', 'berikutnya', 'sebelumnya', 'kembali', 'lanjutkan',
  'selesai', 'sedang', 'sebuah', 'karena', 'jika', 'sampai', 'setelah', 'sebelum', 'dalam', 'pada', 'oleh', 'saja',
  'perangkat', 'peran', 'izin', 'alasan', 'perubahan', 'terlalu', 'banyak', 'percobaan', 'kunci', 'penyedia',
]);

const PATTERN = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${INDONESIAN_WORDS.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');

/**
 * Indonesian words found in a piece of UI text (whole words, case-insensitive).
 * @param {string} text
 * @returns {string[]}
 */
export function findIndonesianWords(text) {
  return [...String(text).matchAll(PATTERN)].map((match) => match[0].toLowerCase());
}
