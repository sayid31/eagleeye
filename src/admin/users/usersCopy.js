/**
 * Indonesian copy of the Pengguna, Log Login, Audit and Ringkasan pages
 * (/admin and /dev). Technical terms (password, role, audit, Log Login) stay
 * as the team says them. Pure data.
 *
 * @module admin/users/usersCopy
 */

export const USERS_COPY = Object.freeze({
  pageTitle: { admin: 'Pengguna', dev: 'Pengguna & Admin' },
  pageLead: {
    admin: 'Akun pengguna peta: buat, ubah izin fitur, nonaktifkan, reset password.',
    dev: 'Semua akun. Angkat pengguna menjadi admin atau turunkan admin menjadi pengguna.',
  },
  searchPlaceholder: 'Cari nama atau email',
  statusFilter: { '': 'Semua status', active: 'Aktif', inactive: 'Nonaktif' },
  roleFilter: { '': 'Semua role', user: 'Pengguna', admin: 'Admin', super_admin: 'Super admin' },
  create: 'Buat pengguna',
  emptyTitle: 'Belum ada pengguna',
  emptyFirst: 'Buat pengguna pertama',
  emptyFiltered: 'Tidak ada akun yang cocok dengan filter.',
  loading: 'Memuat…',
  retry: 'Coba lagi',
  reload: 'Muat ulang',
  columns: { name: 'Nama', email: 'Email', role: 'Role', status: 'Status', toggles: 'Izin', created: 'Dibuat', actions: 'Aksi' },
  self: 'Anda',
  readOnly: 'Hanya baca',
  actions: {
    edit: 'Ubah', deactivate: 'Nonaktifkan', activate: 'Aktifkan', resetPassword: 'Reset password',
    revokeSessions: 'Keluarkan dari semua perangkat', delete: 'Hapus', promote: 'Jadikan admin', demote: 'Jadikan pengguna',
    loginLog: 'Log login', audit: 'Audit',
  },
  toggles: {
    layers: { title: 'Layer data', description: 'Pesawat, kapal, satelit, CCTV dan layer langsung lainnya.' },
    ai: { title: 'Voice & AI', description: 'Asisten suara, ringkasan AI dan rute.' },
    premium: { title: 'Peta premium & search', description: 'Google 3D Tiles dan pencarian tempat Google.' },
  },
  togglesAdminNote: 'Admin selalu memegang semua izin fitur.',
  form: {
    email: 'Email', name: 'Nama', role: 'Role', password: 'Password', passwordMode: 'Password awal',
    generate: 'Buat otomatis', typed: 'Ketik sendiri', passwordHint: (min) => `Minimal ${min} karakter. Pengguna wajib menggantinya saat login pertama.`,
    cancel: 'Batal', save: 'Simpan', create: 'Buat akun', close: 'Tutup', saving: 'Menyimpan…',
  },
  createTitle: 'Buat akun',
  editTitle: 'Ubah akun',
  editEmailNote: 'Mengubah email mengeluarkan akun ini dari semua perangkat.',
  tempPassword: {
    title: 'Password sementara',
    lead: 'Password ini hanya tampil sekali. Kirim ke pemilik akun lewat saluran pribadi.',
    copy: 'Salin pesan', copied: 'Pesan disalin', copyFailed: 'Gagal menyalin — pilih teks lalu salin manual.',
    done: 'Selesai',
  },
  reset: {
    title: 'Reset password',
    lead: 'Semua sesi akun ini dikeluarkan dan pengguna wajib mengganti password saat login berikutnya.',
    submit: 'Reset password',
  },
  confirm: {
    deactivateTitle: 'Nonaktifkan akun?',
    deactivateLead: 'Akun dikeluarkan dari semua perangkat dan tidak bisa login sampai diaktifkan lagi.',
    activateTitle: 'Aktifkan akun?',
    activateLead: 'Akun bisa login lagi dengan password yang sama.',
    revokeTitle: 'Keluarkan dari semua perangkat?',
    revokeLead: 'Semua sesi akun ini berakhir; pemiliknya harus login lagi.',
    submit: 'Ya, lanjutkan',
  },
  remove: {
    title: 'Hapus akun',
    lead: 'Nama dan email dihapus, akun tidak bisa login lagi. Log login dan audit tetap disimpan. Tidak bisa dibatalkan.',
    confirmLabel: (email) => `Ketik ${email} untuk konfirmasi`,
    submit: 'Hapus permanen',
  },
  role: {
    promoteTitle: 'Jadikan admin',
    promoteLead: 'Admin bisa mengelola semua akun pengguna. Akun ini wajib membuat password baru (minimal 15 karakter) saat login berikutnya.',
    demoteTitle: 'Jadikan pengguna',
    demoteLead: 'Akun ini kehilangan akses /admin dan dikeluarkan dari semua perangkat.',
    passwordLabel: 'Password Anda',
    passwordHint: 'Konfirmasi dengan password Anda. Masuk lewat Google? Kosongkan — berlaku bila Anda login Google kurang dari 10 menit lalu.',
    submit: 'Konfirmasi',
  },
  auditWarning: 'Aksi berhasil, tetapi catatan audit gagal ditulis — lihat Server Log.',
  done: {
    create: 'Akun dibuat.', update: 'Perubahan disimpan.', deactivate: 'Akun dinonaktifkan.', activate: 'Akun diaktifkan.',
    revokeSessions: 'Akun dikeluarkan dari semua perangkat.', delete: 'Akun dihapus.', role: 'Role diubah.', resetPassword: 'Password direset.',
  },
  pager: { prev: '← Sebelumnya', next: 'Berikutnya →', range: (from, to, total) => `${from}–${to} dari ${total}` },
  status: { inactive: 'Nonaktif', throttled: 'Ter-throttle', mustChange: 'Wajib ganti password', active: 'Aktif' },
  roles: { user: 'Pengguna', admin: 'Admin', super_admin: 'Super admin' },
});

export const OVERVIEW_COPY = Object.freeze({
  title: 'Ringkasan',
  lead: 'Keadaan akun pengguna dan login 24 jam terakhir.',
  cards: {
    active: 'Pengguna aktif', inactive: 'Nonaktif', throttled: 'Ter-throttle', mustChangePassword: 'Wajib ganti password',
    logins24h: 'Login berhasil (24 jam)', failed24h: 'Login gagal (24 jam)',
  },
  links: { users: 'Kelola pengguna', loginLog: 'Lihat log login' },
});

export const LOGIN_LOG_COPY = Object.freeze({
  title: 'Log Login',
  lead: { admin: 'Setiap percobaan login akun pengguna, berhasil maupun gagal.', dev: 'Setiap percobaan login semua akun, termasuk email yang tidak terdaftar.' },
  columns: { time: 'Waktu', who: 'Akun', result: 'Hasil', ip: 'IP', device: 'Perangkat', method: 'Metode' },
  result: { '': 'Semua hasil', true: 'Berhasil', false: 'Gagal' },
  ok: 'Berhasil',
  unknownAccount: 'Email tidak terdaftar',
  deleted: 'terhapus',
  filteredBy: 'Akun:',
  clearFilter: 'Hapus filter',
  empty: 'Belum ada catatan login.',
  reasons: {
    bad_credentials: 'Email atau password salah', throttled: 'Ter-throttle', disabled: 'Akun nonaktif', rate_limited: 'Terlalu banyak percobaan',
    google_only: 'Akun ini masuk lewat Google', google_denied: 'Google ditolak',
  },
  methods: { password: 'Password', google: 'Google' },
});

export const AUDIT_COPY = Object.freeze({
  title: 'Audit',
  lead: {
    admin: 'Aksi manajemen akun pengguna: siapa mengubah apa, kapan.',
    dev: 'Semua aksi akun dan sistem yang tercatat. Jejak API key & AI lama ada di Server Log → Audit Log.',
  },
  columns: { time: 'Waktu', actor: 'Pelaku', action: 'Aksi', target: 'Akun', detail: 'Detail' },
  allActions: 'Semua aksi',
  system: 'Sistem',
  // A super_admin is never "another" one for an admin; an admin is.
  otherActor: (role, isSuper) => (isSuper ? role : `${role} lain`),
  detail: { role: 'Role', fields: 'Diubah', fieldNames: { name: 'nama', email: 'email', capabilities: 'izin fitur' } },
  empty: 'Belum ada catatan audit.',
  filteredBy: 'Akun:',
  clearFilter: 'Hapus filter',
  actions: {
    'user.create': 'Akun dibuat', 'user.update': 'Akun diubah', 'user.capabilities': 'Izin fitur diubah', 'user.deactivate': 'Akun dinonaktifkan',
    'user.activate': 'Akun diaktifkan', 'user.password.reset': 'Password direset', 'user.sessions.revoke': 'Dikeluarkan dari semua perangkat',
    'user.delete': 'Akun dihapus', 'role.set': 'Role diubah', 'role.reconcile': 'Role disesuaikan dengan env',
    'role.reconcile.blocked': 'Promosi super admin ditolak', 'killswitch.update': 'Kill switch diubah', 'keys.update': 'API key diubah',
    'bootstrap.super_admin': 'Super admin disiapkan (CLI)', 'auth.unlock': 'Throttle dibuka (CLI)',
  },
});
