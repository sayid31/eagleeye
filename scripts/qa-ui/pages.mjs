// scripts/qa-ui/pages.mjs
/**
 * Page registry of the UI gate. Every surface the gate must cover is listed here; phase-1 workers ADD their new
 * pages (and tabs) to it and never remove one. `roles[0]` is the primary role (all themes × viewports run with it);
 * `--all-roles` also runs the others. `anonymous` = no session. `waitFor` is a selector that means "rendered".
 *
 * @typedef {{id: string, path: string, roles: Array<'anonymous' | 'user' | 'admin' | 'super_admin'>, waitFor: string,
 *   surface: 'react' | 'vanilla', note?: string}} QaPage
 */

const SHELL_READY = '#main-content h1, #main-content [role="alert"], #main-content [data-slot="empty"]';
const ADMIN_ROLES = ['admin', 'super_admin'];

const shell = (id, path, roles) => ({ id, path, roles, waitFor: SHELL_READY, surface: 'react' });

/** @type {QaPage[]} */
export const PAGES = [
  { id: 'landing', path: '/', roles: ['anonymous'], waitFor: 'main', surface: 'vanilla' },
  { id: 'login', path: '/login', roles: ['anonymous'], waitFor: 'form, [role="alert"], main', surface: 'react' },
  { id: 'account', path: '/account', roles: ['user', 'admin', 'super_admin'], waitFor: 'main', surface: 'react' },
  { id: 'account-password', path: '/account/password', roles: ['user'], waitFor: 'form, main', surface: 'react' },
  shell('admin-overview', '/admin', ADMIN_ROLES),
  shell('admin-users', '/admin/users', ADMIN_ROLES),
  shell('admin-activity-login', '/admin/activity/login', ADMIN_ROLES),
  shell('admin-activity-audit', '/admin/activity/audit', ADMIN_ROLES),
  shell('dev-overview', '/dev', ['super_admin']),
  shell('dev-users', '/dev/users', ['super_admin']),
  shell('dev-activity-login', '/dev/activity/login', ['super_admin']),
  shell('dev-activity-audit', '/dev/activity/audit', ['super_admin']),
  shell('dev-kill-switches', '/dev/kill-switches', ['super_admin']),
  shell('dev-usage-budget', '/dev/usage/budget', ['super_admin']),
  shell('dev-usage-ai', '/dev/usage/ai', ['super_admin']),
  shell('dev-providers-keys', '/dev/providers/keys', ['super_admin']),
  shell('dev-providers-ai', '/dev/providers/ai', ['super_admin']),
  shell('dev-general', '/dev/general', ['super_admin']),
  shell('dev-persona', '/dev/persona', ['super_admin']),
  shell('dev-logs-server', '/dev/logs/server', ['super_admin']),
  shell('dev-logs-audit', '/dev/logs/audit', ['super_admin']),
  shell('dev-logs-health', '/dev/logs/health', ['super_admin']),
  shell('dev-ui-kit', '/dev/ui-kit', ['super_admin']),
];

export const THEMES = Object.freeze(['light', 'dark']);
export const VIEWPORTS = Object.freeze([
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
]);
