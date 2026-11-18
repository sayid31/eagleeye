// src/copy/id/shell.js
/** Indonesian strings of the application shell (/admin and /dev): sidebar, header, account foot, skip link. */

export const SHELL_COPY = Object.freeze({
  skipToContent: 'Lewati ke konten',
  sidebarLabel: (area) => `Navigasi ${area}`,
  breadcrumb: 'Breadcrumb',
  toggleSidebar: 'Buka atau tutup menu samping',
  developerBadge: 'Developer',
  signedInAs: 'Masuk sebagai',
  openMap: 'Kembali ke peta',
  signOut: 'Keluar',
  signingOut: 'Keluar…',
  openAdmin: 'Buka area Admin',
  openDev: 'Buka area Dev',
  checkingSession: 'Memeriksa sesi…',
  sessionFailedTitle: 'Sesi tidak bisa diperiksa',
  notFoundTitle: 'Halaman tidak ditemukan',
  notFoundDescription: 'Alamat ini tidak ada di area ini. Pilih halaman dari menu di samping.',
  roles: Object.freeze({ super_admin: 'Super admin', admin: 'Admin', user: 'Pengguna' }),
  areas: Object.freeze({ admin: 'Admin', dev: 'Developer' }),
});
