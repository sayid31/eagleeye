// src/copy/id/config.js
/**
 * Indonesian copy of the /dev Konfigurasi pages: Penyedia & API Keys (keys table, "Ubah kunci" sheet, model and voice),
 * plus the strings shared by every settings form (save bar, leave warning). Umum, Persona and Pemakaian AI live in
 * configForms.js and are re-exported from here. Pure data; no API error codes (see errors.js).
 *
 * @module copy/id/config
 */
export * from './configForms.js';

/** Per-provider name and purpose; keys are the registry ids of GET /api/admin/keys. */
export const PROVIDER_COPY = Object.freeze({
  'google-maps': { name: 'Google Maps', purpose: 'Globe 3D fotorealistik dan pencarian tempat. Kunci ini hanya dipakai server.' },
  openai: { name: 'OpenAI', purpose: 'Asisten suara, pembaca layar, dan ringkasan HUD.' },
  aisstream: { name: 'AISStream', purpose: 'Posisi kapal secara langsung di seluruh dunia.' },
  firms: { name: 'NASA FIRMS', purpose: 'Deteksi kebakaran aktif secara langsung.' },
  tomtom: { name: 'TomTom', purpose: 'Lalu lintas nyata. Tanpa kunci, peta menjalankan simulasi.' },
  'cesium-ion': { name: 'Cesium ion', purpose: 'Peta citra Bing dan terrain dunia.' },
  opensky: { name: 'OpenSky', purpose: 'Kuota polling penerbangan lebih besar. Tanpa kunci tetap bisa dipakai secara anonim.' },
  'launch-library': { name: 'Launch Library', purpose: 'Kuota permintaan data misi antariksa lebih besar.' },
});

/** Field label per environment variable of a provider with several fields (a single field is labelled "API key"). */
export const KEY_FIELD_LABELS = Object.freeze({
  OPENSKY_CLIENT_ID: 'Client ID',
  OPENSKY_CLIENT_SECRET: 'Client secret',
  CESIUM_ION_TOKEN: 'Token',
});

/** What a connection test does, per provider (the server's notes are English). */
export const KEY_TEST_NOTES = Object.freeze({
  openai: 'Membaca daftar model; tidak ada biaya pemakaian.',
  firms: 'Membaca status kunci; tidak memakai transaksi.',
  'cesium-ion': 'Hanya membaca metadata terrain.',
  tomtom: 'Mengambil satu tile lalu lintas dari kuota harian.',
  opensky: 'Meminta satu token OAuth.',
  'launch-library': 'Membaca sisa kuota permintaan.',
  aisstream: 'Memakai feed kapal yang sedang berjalan; bila tidak ada, membuka koneksi singkat.',
  'google-maps': 'Tidak bisa dites dari server tanpa permintaan Google yang berbayar. Pastikan globe 3D Google tampil.',
});

/** Test outcome code → sentence. `unreachableHint` adds provider-specific advice to "tidak terhubung". */
export const KEY_TEST_RESULTS = Object.freeze({
  ok: { label: 'Berhasil', text: 'Penyedia menerima kunci ini.' },
  rejected: { label: 'Ditolak', text: 'Penyedia menolak kunci ini. Periksa kuncinya atau ganti dengan yang baru.' },
  unreachable: { label: 'Tidak terhubung', text: 'Penyedia tidak bisa dihubungi, jadi kunci belum diperiksa. Coba lagi sebentar lagi.' },
  untestable: { label: 'Tidak bisa dites', text: 'Kunci ini tidak bisa dites dari server.' },
  not_set: { label: 'Belum ada kunci', text: 'Pasang kunci dulu sebelum menguji koneksi.' },
  unknown: { label: 'Tidak diketahui', text: 'Hasil tes tidak dikenali.' },
});
export const KEY_UNREACHABLE_HINTS = Object.freeze({
  aisstream: ' AISStream membatasi satu koneksi per kunci; nyalakan layer Kapal untuk memeriksanya lewat feed langsung.',
});

/** Shared by every settings form: the sticky save bar and the warning when leaving with unsaved changes. */
export const SAVE_COPY = Object.freeze({
  dirty: 'Perubahan belum disimpan',
  clean: 'Semua perubahan sudah tersimpan',
  saving: 'Menyimpan…',
  savedAt: (time) => `Tersimpan • ${time}`,
  save: 'Simpan perubahan',
  discard: 'Batalkan perubahan',
  discarded: 'Perubahan dibatalkan.',
  barLabel: 'Simpan pengaturan',
  leave: {
    title: 'Tinggalkan halaman ini?',
    impact: 'Perubahan yang belum disimpan akan hilang. Pengaturan yang sudah tersimpan tidak berubah.',
    action: 'Tinggalkan halaman',
    stay: 'Tetap di sini',
  },
});

export const PROVIDERS_COPY = Object.freeze({
  title: 'Penyedia & API Keys',
  keysDescription: 'Kunci layanan data dan AI yang dipakai server. Isi kunci tidak pernah ditampilkan, hanya ada atau tidaknya.',
  aiDescription: 'Suara dan model untuk asisten suara. Kunci OpenAI diatur di tab API Keys.',
  loading: 'Memuat penyedia',
  loadError: 'Penyedia tidak bisa dimuat',
  tableCaption: 'Penyedia dan status kunci API',
  summary: (set, total, store) => `${set} dari ${total} penyedia sudah punya kunci. Kunci disimpan di ${store} di komputer ini.`,
  stores: { env: 'file .env proyek', pinokio: 'file ENVIRONMENT Pinokio' },
  restarting: {
    title: 'Server sedang restart',
    description: 'Server restart agar semua fitur memakai kunci terbaru. Halaman ini memuat ulang sendiri; tunggu beberapa detik.',
  },
  columns: { provider: 'Penyedia', status: 'Status kunci', source: 'Sumber', test: 'Tes koneksi terakhir', actions: 'Aksi' },
  status: { set: 'Terpasang', unset: 'Belum', rejected: 'Ditolak' },
  sources: { env: '.env', pinokio: 'ENVIRONMENT Pinokio', external: 'Keychain atau shell', none: '—' },
  tier: { metered: 'Akun berbayar', free: 'Gratis' },
  test: { never: 'Belum dites', at: (label, time) => `${label} • ${time}` },
  actions: { change: 'Ubah kunci', install: 'Pasang kunci', changeLabel: (name) => `Ubah kunci ${name}`, installLabel: (name) => `Pasang kunci ${name}` },
  empty: { title: 'Tidak ada penyedia', description: 'Server tidak mengirim daftar penyedia. Muat ulang halaman.' },
});

export const KEY_SHEET_COPY = Object.freeze({
  title: (name, set) => (set ? `Ubah kunci ${name}` : `Pasang kunci ${name}`),
  getKey: 'Dapatkan kunci',
  externalTitle: 'Diatur di luar aplikasi',
  externalBody: 'Kunci ini diatur di tempat server dijalankan (shell, Keychain, atau launcher), jadi hanya bisa diubah di sana. Anda tetap bisa menguji koneksinya.',
  browserTitle: 'Kunci ini dikirim ke browser',
  browserBody: 'Token ini sengaja dikirim ke browser agar peta bisa memuat citra. Batasi pemakaiannya di sisi penyedia.',
  singleField: 'API key',
  keepHint: 'Kosongkan untuk mempertahankan kunci yang tersimpan.',
  placeholderSet: '•••••••••••• tersimpan',
  placeholderUnset: 'Tempel kunci di sini',
  neverShown: 'Kunci yang tersimpan tidak pernah ditampilkan. Yang Anda ketik hanya dikirim sekali ke server.',
  testSection: 'Uji koneksi',
  testButton: 'Uji koneksi',
  testNeedsKey: 'Pasang kunci dulu untuk menguji.',
  testFailed: 'Tes gagal',
  testing: 'Menguji…',
  save: 'Simpan kunci',
  replace: 'Ganti kunci',
  saving: 'Menyimpan…',
  remove: 'Hapus kunci',
  close: 'Tutup',
  saved: (name) => `Kunci ${name} tersimpan.`,
  removed: (name) => `Kunci ${name} dihapus.`,
  errors: {
    fieldEmpty: (label) => `${label} wajib diisi.`,
    fieldSpace: (label) => `${label} tidak boleh berisi spasi.`,
    allFields: 'Isi semua kolom; kunci ini terdiri dari beberapa bagian dan disimpan bersama.',
  },
  removeConfirm: {
    title: (name) => `Hapus kunci ${name}?`,
    impact: (name, purpose) => `Fitur yang memakai ${name} akan berhenti atau jatuh ke mode tanpa kunci: ${purpose} Kunci bisa dipasang lagi kapan saja, tetapi nilai lamanya tidak bisa dipulihkan dari sini.`,
    action: (name) => `Hapus kunci ${name}`,
  },
});

export const AI_PROVIDER_COPY = Object.freeze({
  keyCard: { title: 'Kunci OpenAI', description: 'Kunci yang menjalankan asisten suara.', manage: 'Kelola di API Keys', missing: 'Belum ada kunci OpenAI, jadi asisten suara tidak bisa dipakai.' },
  model: {
    title: 'Model dan suara',
    description: (model, source) => `Model suara: ${model} (${source}). Suara tidak bisa berganti selama sesi berjalan.`,
    voice: { label: 'Suara', description: (value, source) => `Dipakai: ${value} (${source}).` },
    backend: { label: 'Backend model (tools dan penalaran)', description: (value, source) => `Dipakai: ${value} (${source}). Ditagih terpisah oleh OpenAI dan tidak masuk meter biaya.` },
    defaultChoice: 'Bawaan (.env atau default aplikasi)',
  },
  sources: { admin: 'dipilih di sini', env: 'dari .env', default: 'default bawaan' },
  errors: { voice: 'Suara: pilih salah satu dari daftar.', backend: 'Backend model: pilih salah satu dari daftar.' },
  saved: 'Tersimpan. Sesi suara baru memakai suara dan model ini.',
  loading: 'Memuat pengaturan model',
  loadError: 'Pengaturan model tidak bisa dimuat',
});
