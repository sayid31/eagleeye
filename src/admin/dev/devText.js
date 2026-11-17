// src/admin/dev/devText.js
/**
 * Indonesian copy of the `/dev` system pages (Ringkasan sistem, Kill switch,
 * Pemakaian) and the error messages of their API. Technical terms (API key,
 * kill switch, error) stay English, like the rest of the dashboard.
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
  AUTH_UNAVAILABLE: 'Login sedang tidak tersedia; lihat log server.',
  INTERNAL_ERROR: 'Terjadi error di server; lihat Server Log.',
  SUPER_ADMIN_REQUIRED: 'Hanya super admin yang boleh mengakses ini.',
  AUTH_REQUIRED: 'Sesi berakhir; masuk lagi.',
});

/** Gate key → label + what switching it off stops (plan/auth/01 §Izin). */
export const GATE_TEXT = Object.freeze({
  layers: { label: 'Layer data', stops: 'Semua proxy layer data: OpenSky, adsb.lol, AIS, CelesTrak, FIRMS, TomTom, CCTV, Overpass, dll.' },
  ai: { label: 'Voice & AI', stops: 'Sesi voice baru (GPT-Live), ringkasan HUD, judge, dan rute AI.' },
  premium: { label: 'Peta premium & search', stops: 'Google Photorealistic 3D Tiles, Geocoding, dan Places.' },
});

export const KILL_SWITCH_TEXT = Object.freeze({
  title: 'Kill switch',
  lead: 'Matikan satu gate untuk SEMUA akun — termasuk super admin — misalnya saat biaya melonjak. '
    + 'Request baru ke gate yang mati dijawab 503 FEATURE_DISABLED dalam ≤2 detik. Sesi voice yang sudah berjalan tidak diputus.',
  on: 'Aktif',
  off: 'Dimatikan',
  turnOff: 'Matikan',
  turnOn: 'Nyalakan lagi',
  confirmOffTitle: (label) => `Matikan "${label}" untuk semua akun?`,
  confirmOnTitle: (label) => `Nyalakan lagi "${label}"?`,
  reasonLabel: 'Alasan',
  reasonHintOff: 'Wajib, minimal 3 karakter — tercatat di audit.',
  reasonHintOn: 'Opsional — tercatat di audit.',
  passwordLabel: 'Password Anda',
  passwordHint: 'Konfirmasi identitas. Akun Google-only: kosongkan bila masuk ≤10 menit lalu.',
  cancel: 'Batal',
  saving: 'Menyimpan…',
  saved: (label, killed) => `${label} ${killed ? 'dimatikan' : 'dinyalakan lagi'}.`,
  auditFailed: 'Perubahan tersimpan, tetapi audit gagal ditulis — cek log server.',
  lastChange: 'Perubahan terakhir',
  never: 'Belum pernah diubah',
  loading: 'Memuat status kill switch…',
});

export const OVERVIEW_TEXT = Object.freeze({
  title: 'Ringkasan sistem',
  loading: 'Memuat ringkasan…',
  reload: 'Muat ulang',
  app: 'Aplikasi',
  version: 'Versi',
  runtime: 'Runtime',
  uptime: 'Uptime',
  auth: 'Login',
  authConfigured: 'Login terkonfigurasi',
  google: 'Google sign-in (super admin)',
  yes: 'Ya',
  no: 'Tidak',
  keys: 'API key per provider',
  keysLead: 'Hanya status ada/tidak — nilai key tidak pernah dikirim ke browser.',
  keyPresent: 'Ada',
  keyAbsent: 'Tidak ada',
  killSwitches: 'Kill switch',
  allGatesOn: 'Semua gate aktif',
  serverLog: 'Server Log',
  recentErrors: (n, hours) => `${n} error dalam ${hours} jam terakhir`,
  doctor: 'Peringatan doctor',
  doctorNone: 'Tidak ada peringatan.',
  doctorLead: 'Pemeriksaan kesiapan login yang sama dengan `npm run doctor` (tanpa nilai rahasia).',
  openPage: 'Buka',
});

export const USAGE_TEXT = Object.freeze({
  title: 'Pemakaian & budget',
  lead: 'Gabungan penghitung yang sudah ada di server. Angka OpenSky dan TomTom hidup di memori sejak server mulai.',
  loading: 'Memuat pemakaian…',
  reload: 'Muat ulang',
  notConfigured: 'Key belum diisi — provider ini tidak dipakai.',
  noData: 'Belum ada data sejak server mulai.',
  opensky: 'OpenSky — kredit harian',
  openskyRemaining: 'Sisa kredit',
  openskyTtl: 'TTL cache (governor)',
  openskyWarnAt: 'Peringatan di bawah',
  tomtom: 'TomTom — budget tile harian',
  tomtomUsed: 'Terpakai',
  tomtomDate: 'Tanggal (UTC)',
  openai: 'OpenAI — voice',
  voiceEnabled: 'Voice',
  voiceToday: 'Menit hari ini',
  voiceCostToday: 'Estimasi biaya hari ini',
  voiceCost7d: 'Estimasi 7 hari',
  judgeCalls: 'Panggilan judge hari ini',
  details: 'Rincian per hari',
  updatedAt: 'Diperbarui',
});

/** Status word next to every colour (never colour alone). */
export const STATUS_TEXT = Object.freeze({ ok: 'OK', warn: 'Peringatan', error: 'Masalah', off: 'Mati', unknown: 'Tanpa data' });

/** Doctor check id → Indonesian line (same checks as `npm run doctor`; params are counts/flags only). */
export const DOCTOR_TEXT = Object.freeze({
  'auth.secret': ({ problem, legacy }) => (problem === 'missing' ? 'BETTER_AUTH_SECRET belum diisi.'
    : problem ? 'BETTER_AUTH_SECRET kurang dari 32 karakter.'
      : legacy ? 'Hanya ADMIN_SESSION_SECRET (nama lama) yang diisi; ganti namanya ke BETTER_AUTH_SECRET.' : 'BETTER_AUTH_SECRET ada.'),
  'auth.superAdminEmails': ({ problem }) => (problem === 'missing' ? 'SUPER_ADMIN_EMAILS belum diisi.' : 'SUPER_ADMIN_EMAILS tidak berisi alamat yang valid.'),
  'auth.url': () => 'BETTER_AUTH_URL bukan origin http(s) yang valid.',
  'auth.database': ({ problem }) => (problem === 'missing' ? 'Database login belum dibuat.' : `Database login tidak terbaca (${problem}).`),
  'auth.superAdminAccess': ({ envEmails, ready, noAccount, blocked }) => `${ready} dari ${envEmails} email super admin bisa masuk; `
    + `${noAccount} belum punya akun (jalankan npm run auth:set-password), ${blocked} hanya punya password buatan admin (tidak dipromosikan).`,
  'auth.reconcileBlocked': ({ count }) => `${count} entri audit role.reconcile.blocked — email di env ditolak jadi super admin (lihat Audit).`,
  'auth.exposure': ({ via, passwordOnlyAdmins }) => `Server terjangkau dari luar mesin ini (${via === 'host' ? 'HOST' : 'BETTER_AUTH_URL'}) `
    + `sementara ${passwordOnlyAdmins ?? 'sejumlah'} admin masuk hanya dengan password — batasi /admin, /dev, dan /api/admin/* di reverse proxy (IP allowlist/VPN).`,
});
