// scripts/qa-ui/pages.mjs
/**
 * Page registry of the UI gate. Every surface the gate must cover is listed here; phase-1 workers ADD their new
 * pages (and tabs) to it and never remove one. `roles[0]` is the primary role (all themes × viewports run with it);
 * `--all-roles` also runs the others. `anonymous` = no session. `waitFor` is a selector that means "rendered".
 *
 * @typedef {{id: string, path: string, roles: Array<'anonymous' | 'user' | 'admin' | 'super_admin'>, waitFor: string,
 *   surface: 'react' | 'vanilla', note?: string, setup?: (page: import('puppeteer').Page) => Promise<void>}} QaPage
 *   `path` may carry a query; `setup` runs before navigation (see mocks.mjs).
 */

import { SETUPS, SETUPS_CONFIG } from './mocks.mjs';

const SHELL_READY = '#main-content h1, #main-content [role="alert"], #main-content [data-slot="empty"]';
const ADMIN_ROLES = ['admin', 'super_admin'];

const shell = (id, path, roles) => ({ id, path, roles, waitFor: SHELL_READY, surface: 'react' });

/** @type {QaPage[]} */
export const PAGES = [
  { id: 'landing', path: '/', roles: ['anonymous', 'user', 'admin', 'super_admin'], waitFor: 'main', surface: 'vanilla', note: 'one entry per CTA state (--all-roles)' },
  { id: 'login', path: '/login', roles: ['anonymous'], waitFor: 'main form', surface: 'react' },
  { id: 'login-dev-google', path: '/login?next=/dev', roles: ['anonymous'], waitFor: 'main form', surface: 'react', setup: SETUPS.googleConfigured, note: 'Google configured (mocked /api/me)' },
  { id: 'login-session-notice', path: '/login?notice=session', roles: ['anonymous'], waitFor: 'main [role="alert"]', surface: 'react' },
  { id: 'login-refused', path: '/login?error=ACCOUNT_DISABLED', roles: ['anonymous'], waitFor: 'main [role="alert"]', surface: 'react' },
  { id: 'login-not-configured', path: '/login', roles: ['anonymous'], waitFor: 'main [role="alert"]', surface: 'react', setup: SETUPS.notConfigured, note: 'login switched off (mocked /api/me)' },
  { id: 'account', path: '/account', roles: ['user', 'admin', 'super_admin'], waitFor: '#main-content [data-slot="tabs"]', surface: 'react' },
  { id: 'account-security', path: '/account?tab=security', roles: ['admin'], waitFor: '#main-content form', surface: 'react' },
  { id: 'account-google', path: '/account?tab=security', roles: ['super_admin'], waitFor: '#main-content [data-slot="card"]', surface: 'react', setup: SETUPS.googleOnlyAccount, note: 'Google-only account (mocked get-session)' },
  { id: 'account-password', path: '/account/password', roles: ['user'], waitFor: '#main-content form', surface: 'react' },
  { id: 'account-password-forced', path: '/account/password', roles: ['user'], waitFor: '#main-content form', surface: 'react', setup: SETUPS.forcedChange, note: 'forced change (mocked /api/me)' },
  shell('admin-overview', '/admin', ADMIN_ROLES),
  shell('admin-users', '/admin/users', ADMIN_ROLES),
  shell('admin-login-log', '/admin/login-log', ADMIN_ROLES),
  shell('admin-audit', '/admin/audit', ADMIN_ROLES),
  shell('dev-overview', '/dev', ['super_admin']),
  shell('dev-users', '/dev/users', ['super_admin']),
  shell('dev-login-log', '/dev/login-log', ['super_admin']),
  shell('dev-audit', '/dev/audit', ['super_admin']),
  shell('dev-kill-switches', '/dev/kill-switches', ['super_admin']),
  shell('dev-usage', '/dev/usage', ['super_admin']),
  shell('dev-ai-usage', '/dev/ai/usage', ['super_admin']),
  { ...shell('dev-ai-usage-data', '/dev/ai/usage', ['super_admin']), setup: SETUPS_CONFIG.usagePopulated, note: 'a week of sessions (mocked usage)' },
  shell('dev-api-keys', '/dev/api-keys', ['super_admin']),
  shell('dev-ai-provider', '/dev/ai/provider', ['super_admin']),
  { ...shell('dev-api-keys-mixed', '/dev/api-keys', ['super_admin']), setup: SETUPS_CONFIG.keysMixed, note: 'every key state (mocked /api/admin/keys)' },
  { ...shell('dev-ai-provider-key-set', '/dev/ai/provider', ['super_admin']), setup: SETUPS_CONFIG.keysMixed, note: 'OpenAI key present (mocked /api/admin/keys)' },
  { ...shell('dev-overview-collapsed', '/dev', ['super_admin']), setup: SETUPS_CONFIG.sidebarCollapsed, note: 'sidebar collapsed to icons (logo only)' },
  { ...shell('admin-overview-collapsed', '/admin', ADMIN_ROLES), setup: SETUPS_CONFIG.sidebarCollapsed, note: 'sidebar collapsed to icons (logo only)' },
  shell('dev-ai-general', '/dev/ai/general', ['super_admin']),
  shell('dev-ai-persona', '/dev/ai/persona', ['super_admin']),
  shell('dev-server-log', '/dev/server-log', ['super_admin']),
  shell('dev-server-log-audit', '/dev/server-log/audit', ['super_admin']),
  shell('dev-server-log-health', '/dev/server-log/health', ['super_admin']),
  shell('dev-ui-kit', '/dev/ui-kit', ['super_admin']),
];

export const THEMES = Object.freeze(['light', 'dark']);
export const VIEWPORTS = Object.freeze([
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
]);
