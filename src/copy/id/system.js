/**
 * Indonesian strings of the /dev system pages: Ringkasan sistem, Sakelar darurat, Pemakaian & Biaya (Anggaran provider).
 * The log pages live in systemLogs.js. Technical terms (API key, token, voice, layer, runtime) stay English; "Sakelar
 * darurat" is the glossary term for the global kill switch (glossary.js).
 *
 * @module copy/id/system
 */

/** One shared status word per health state; every badge pairs it with an icon (never colour alone). */
export const HEALTH_STATUS_COPY = Object.freeze({ ok: 'Baik', warn: 'Peringatan', error: 'Masalah', off: 'Mati', unknown: 'Tanpa data' });

/** Provider id → display name (the key store sends ALL-CAPS titles). */
export const PROVIDER_NAMES = Object.freeze({
  'google-maps': 'Google Maps',
  openai: 'OpenAI',
  aisstream: 'AISStream',
  firms: 'NASA FIRMS',
  tomtom: 'TomTom',
  'cesium-ion': 'Cesium ion',
  opensky: 'OpenSky',
  'launch-library': 'Launch Library',
});

export const SYSTEM_TIME_COPY = Object.freeze({
  justNow: 'baru saja',
  minutesAgo: (n) => `${n} menit lalu`,
  hoursAgo: (n) => `${n} jam lalu`,
  daysAgo: (n) => `${n} hari lalu`,
  never: 'belum pernah',
  seconds: (n) => `${n} dtk`,
  minutes: (n) => `${n} mnt`,
  hoursMinutes: (h, m) => `${h} j ${String(m).padStart(2, '0')} mnt`,
  daysHours: (d, h) => `${d} hari ${h} j`,
  updatedAt: (time) => `Diperbarui ${time}`,
});

/** Overline-free card copy of the overview. */
export const OVERVIEW_COPY = Object.freeze({
  title: 'Ringkasan sistem',
  description: 'Status server, login, dan kunci provider dalam satu tampilan.',
  refresh: 'Muat ulang',
  loadingLabel: 'Memuat ringkasan sistem',
  errorTitle: 'Ringkasan sistem tidak bisa dimuat',
  version: Object.freeze({ title: 'Versi aplikasi', runtime: (name, version) => `Berjalan di ${name} ${version}` }),
  uptime: Object.freeze({ title: 'Waktu aktif', since: (time) => `Sejak ${time}` }),
  login: Object.freeze({
    title: 'Login',
    configured: 'Login terkonfigurasi',
    google: 'Google sign-in (super admin)',
    ready: 'Siap',
    notReady: 'Belum siap',
    on: 'Aktif',
    off: 'Belum aktif',
  }),
  gates: Object.freeze({
    title: 'Sakelar darurat',
    allOn: 'Semua fitur berbayar menyala',
    value: (on, total) => `${on} dari ${total} menyala`,
    someOff: (names) => `Dimatikan: ${names}`,
    manage: 'Kelola sakelar',
  }),
  errors: Object.freeze({
    title: 'Error di log server',
    detail: (hours) => `error dalam ${hours} jam terakhir`,
    none: (hours) => `Tidak ada error dalam ${hours} jam terakhir`,
    open: 'Buka log server',
  }),
  keys: Object.freeze({
    title: 'API key per provider',
    description: 'Hanya status terpasang atau belum. Nilai key tidak pernah dikirim ke browser.',
    summary: (set, total) => `${set} dari ${total} terpasang`,
    present: 'Terpasang',
    absent: 'Belum',
    manage: 'Kelola API key',
  }),
  doctor: Object.freeze({
    title: 'Peringatan kesiapan',
    description: 'Pemeriksaan login yang sama dengan perintah di terminal.',
    none: 'Tidak ada peringatan. Login siap dipakai.',
    hint: 'Untuk pemeriksaan lengkap, jalankan npm run doctor di terminal.',
    count: (n) => `${n} peringatan`,
  }),
});

/** Doctor check id → title + plain-language explanation (params are counts/flags only, never secrets). */
export const DOCTOR_COPY = Object.freeze({
  'auth.secret': Object.freeze({
    title: 'Kunci rahasia login',
    text: ({ problem, legacy }) => (problem === 'missing'
      ? 'BETTER_AUTH_SECRET belum diisi, jadi login belum bisa dipakai. Isi dengan teks acak minimal 32 karakter di .env.'
      : problem ? 'BETTER_AUTH_SECRET kurang dari 32 karakter. Ganti dengan teks acak yang lebih panjang.'
        : legacy ? 'Hanya ADMIN_SESSION_SECRET (nama lama) yang terisi. Ganti namanya menjadi BETTER_AUTH_SECRET.'
          : 'BETTER_AUTH_SECRET terisi.'),
  }),
  'auth.superAdminEmails': Object.freeze({
    title: 'Email super admin',
    text: ({ problem }) => (problem === 'missing'
      ? 'SUPER_ADMIN_EMAILS belum diisi, jadi tidak ada yang bisa membuka area Developer.'
      : 'SUPER_ADMIN_EMAILS tidak berisi alamat email yang valid.'),
  }),
  'auth.url': Object.freeze({
    title: 'Alamat server login',
    text: () => 'BETTER_AUTH_URL harus berupa alamat lengkap yang diawali http:// atau https://.',
  }),
  'auth.database': Object.freeze({
    title: 'Database login',
    text: ({ problem }) => (problem === 'missing'
      ? 'Database login belum dibuat. Jalankan migrasi login sebelum memakai area ini.'
      : `Database login tidak bisa dibaca (${problem}).`),
  }),
  'auth.superAdminAccess': Object.freeze({
    title: 'Akses super admin',
    text: ({ envEmails, ready, noAccount, blocked }) => `${ready} dari ${envEmails} email super admin sudah bisa masuk. `
      + `${noAccount} belum punya akun (jalankan npm run auth:set-password); ${blocked} hanya punya password buatan admin sehingga tidak dijadikan super admin.`,
  }),
  'auth.reconcileBlocked': Object.freeze({
    title: 'Email super admin ditolak',
    text: ({ count }) => `${count} email di konfigurasi ditolak menjadi super admin. Lihat jejak audit untuk rinciannya.`,
  }),
  'auth.exposure': Object.freeze({
    title: 'Server terjangkau dari luar',
    text: ({ via, passwordOnlyAdmins }) => `Server bisa dijangkau dari luar mesin ini (lewat ${via === 'host' ? 'HOST' : 'BETTER_AUTH_URL'}) `
      + `sementara ${passwordOnlyAdmins ?? 'beberapa'} admin masuk hanya dengan password. Batasi /admin, /dev, dan /api/admin/* di reverse proxy (IP allowlist atau VPN).`,
  }),
});

/** Gate id → name, what switching it off stops. */
export const GATE_COPY = Object.freeze({
  layers: Object.freeze({ label: 'Layer data', stops: 'Semua proxy layer data: OpenSky, adsb.lol, AIS, CelesTrak, FIRMS, TomTom, CCTV, Overpass, dan lainnya.' }),
  ai: Object.freeze({ label: 'Voice & AI', stops: 'Sesi voice baru (GPT-Live), ringkasan HUD, judge, dan semua rute AI.' }),
  premium: Object.freeze({ label: 'Peta premium & pencarian', stops: 'Google Photorealistic 3D Tiles, Geocoding, dan Places.' }),
});

export const KILL_SWITCH_COPY = Object.freeze({
  title: 'Sakelar darurat',
  description: 'Matikan satu fitur berbayar untuk semua akun saat biaya melonjak atau ada gangguan.',
  refresh: 'Muat ulang',
  loadingLabel: 'Memuat status sakelar darurat',
  errorTitle: 'Status sakelar tidak bisa dimuat',
  notice: Object.freeze({
    title: 'Berlaku untuk semua orang, termasuk Anda',
    body: 'Permintaan baru ke fitur yang dimatikan langsung ditolak dalam 2 detik. Sesi voice yang sedang berjalan tidak diputus.',
  }),
  switchLabel: (gate) => `${gate}: menyala untuk semua akun`,
  on: 'Menyala',
  off: 'Dimatikan',
  lastChange: Object.freeze({
    never: 'Belum pernah diubah.',
    by: (who, ago) => `Diubah ${ago} oleh ${who}.`,
    reason: (text) => `Alasan: ${text}`,
    unknownActor: 'akun yang tidak dikenal',
  }),
  dialog: Object.freeze({
    offTitle: (gate) => `Matikan ${gate} untuk semua akun?`,
    onTitle: (gate) => `Nyalakan kembali ${gate}?`,
    offImpact: (stops) => `Berlaku untuk semua orang termasuk Anda. ${stops} Fitur ini berhenti sampai Anda menyalakannya lagi. Perubahan dicatat di jejak audit.`,
    onImpact: (gate) => `${gate} bisa dipakai lagi oleh semua akun yang punya izinnya. Perubahan dicatat di jejak audit.`,
    offAction: 'Matikan sekarang',
    onAction: 'Nyalakan kembali',
    reasonOff: 'Alasan (wajib, minimal 3 karakter)',
    reasonOn: 'Alasan (opsional)',
    password: 'Password Anda',
    passwordHint: 'Untuk konfirmasi identitas. Akun Google: kosongkan jika Anda masuk dengan Google kurang dari 10 menit lalu.',
  }),
  toast: Object.freeze({
    off: (gate) => `${gate} dimatikan untuk semua akun.`,
    on: (gate) => `${gate} menyala kembali.`,
    auditFailed: 'Perubahan tersimpan, tetapi catatan audit gagal ditulis. Periksa log server.',
  }),
});

export const USAGE_COPY = Object.freeze({
  title: 'Anggaran provider',
  description: 'Pemakaian harian dari penghitung di server. Angka OpenSky dan TomTom dihitung sejak server mulai.',
  refresh: 'Muat ulang',
  loadingLabel: 'Memuat pemakaian provider',
  errorTitle: 'Pemakaian provider tidak bisa dimuat',
  statusOff: 'Belum dikonfigurasi',
  emptyNotConfigured: Object.freeze({ title: 'Provider belum dikonfigurasi', description: 'Isi API key-nya agar pemakaian tercatat di sini.', action: 'Kelola API key' }),
  emptyNoData: Object.freeze({ title: 'Belum ada data', description: 'Belum ada pemakaian sejak server mulai.' }),
  opensky: Object.freeze({
    title: 'OpenSky',
    description: 'Kredit API harian untuk pesawat live',
    big: (n) => `${n}`,
    unit: 'kredit tersisa',
    seen: (ago) => `Terakhir dilaporkan ${ago}.`,
    warnAt: 'Peringatan di bawah',
    ttl: 'Cache governor',
    ttlValue: (seconds) => `${seconds} dtk`,
    reset: 'Kredit diisi ulang oleh OpenSky tiap hari.',
  }),
  tomtom: Object.freeze({
    title: 'TomTom',
    description: 'Anggaran tile lalu lintas harian',
    unit: (budget) => `dari ${budget} tile hari ini`,
    meterLabel: 'Tile TomTom terpakai hari ini',
    meterText: (used, budget, percent) => `${used} dari ${budget} tile (${percent}%)`,
    reset: (countdown) => `Reset pukul 00.00 UTC, ${countdown} lagi.`,
    date: 'Tanggal hitung (UTC)',
  }),
  openai: Object.freeze({
    title: 'OpenAI voice',
    description: 'Menit suara dan panggilan judge hari ini',
    unitCap: (cap) => `dari batas ${cap} menit hari ini`,
    unitNoCap: 'menit hari ini, tanpa batas harian',
    meterLabel: 'Menit voice terpakai hari ini',
    meterText: (used, cap, percent) => `${used} dari ${cap} menit (${percent}%)`,
    judgeLabel: 'Panggilan judge hari ini',
    judgeText: (calls, max) => `${calls} dari ${max} panggilan`,
    judgeOff: 'Judge dimatikan',
    voiceOffStatus: 'Voice dimatikan',
    voiceOffNote: 'Voice dimatikan di pengaturan Umum, jadi sesi baru ditolak.',
    costToday: 'Perkiraan biaya hari ini',
    cost7d: 'Perkiraan biaya 7 hari',
    reset: 'Batas harian direset tengah malam waktu server.',
    detailsLink: 'Rincian dan batas biaya',
  }),
  days: Object.freeze({
    caption: 'Pemakaian voice 7 hari terakhir',
    title: 'Rincian 7 hari',
    day: 'Hari',
    sessions: 'Sesi',
    audio: 'Audio',
    cost: 'Perkiraan biaya',
    sessionCount: (n) => `${n} sesi`,
  }),
  statusWord: Object.freeze({ ok: 'Baik', warn: 'Hampir habis', error: 'Habis', off: 'Belum dikonfigurasi', unknown: 'Tanpa data' }),
});
