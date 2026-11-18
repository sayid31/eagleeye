// src/copy/en/shell.js
/** English strings of the application shell (/admin and /dev): sidebar, header, account menu, skip link. */

export const SHELL_COPY = Object.freeze({
  skipToContent: 'Skip to content',
  sidebarLabel: (area) => `${area} navigation`,
  breadcrumb: 'Breadcrumb',
  toggleSidebar: 'Open or close the side menu',
  developerBadge: 'Developer',
  accountMenu: 'Account menu',
  signedInAs: 'Signed in as',
  openMap: 'Open map',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  openAdmin: 'Open Admin area',
  openDev: 'Open Developer area',
  checkingSession: 'Checking session…',
  sessionFailedTitle: 'The session could not be checked',
  notFoundTitle: 'Page not found',
  notFoundDescription: 'This address does not exist in this area. Pick a page from the side menu.',
  roles: Object.freeze({ super_admin: 'Super admin', admin: 'Admin', user: 'User' }),
  areas: Object.freeze({ admin: 'Admin', dev: 'Developer' }),
});
