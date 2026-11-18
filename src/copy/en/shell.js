// src/copy/en/shell.js
/** Indonesian strings of the application shell (/admin and /dev): sidebar, header, account menu, skip link. */

export const SHELL_COPY = Object.freeze({
  skipToContent: 'Lewati ke konten',
  sidebarLabel: (area) => `Navigasi ${area}`,
  breadcrumb: 'Breadcrumb',
  toggleSidebar: 'Buka atau tutup menu samping',
  developerBadge: 'Developer',
  accountMenu: 'Menu akun',
  signedInAs: 'Masuk sebagai',
  openMap: 'Buka peta',
  signOut: 'Keluar',
  signingOut: 'Keluar…',
  openAdmin: 'Buka area Admin',
  openDev: 'Buka area Developer',
  checkingSession: 'Memeriksa sesi…',
  sessionFailedTitle: 'Sesi tidak bisa diperiksa',
  notFoundTitle: 'Halaman tidak ditemukan',
  notFoundDescription: 'Alamat ini tidak ada di area ini. Pilih halaman dari menu di samping.',
  roles: Object.freeze({ super_admin: 'Super admin', admin: 'Admin', user: 'Pengguna' }),
  areas: Object.freeze({ admin: 'Admin', dev: 'Developer' }),
});
