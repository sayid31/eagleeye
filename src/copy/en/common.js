// src/copy/en/common.js
/**
 * English UI strings shared by every React surface (buttons, states, table chrome, copy-to-clipboard, theme).
 * Pure data; components import from here instead of writing literals. See glossary.js for the terminology rule.
 *
 * @module copy/en/common
 */

export const APP_NAME = 'EagleEye View';

export const COMMON_COPY = Object.freeze({
  appName: APP_NAME,
  cancel: 'Cancel',
  close: 'Close',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  retry: 'Try again',
  reload: 'Reload',
  loading: 'Loading…',
  continue: 'Continue',
  done: 'Done',
  search: 'Search',
  clear: 'Delete',
  moreActions: 'More actions',
  required: 'required',
  yes: 'Yes',
  no: 'No',
});

export const THEME_COPY = Object.freeze({
  toggle: 'Display theme',
  light: 'Light',
  dark: 'Dark',
  system: 'System',
});

export const COPY_FIELD_COPY = Object.freeze({
  copy: 'Copy',
  copied: 'Copied',
  copyFailed: 'Copy failed. Select the text and copy it manually.',
});

export const PASSWORD_INPUT_COPY = Object.freeze({
  show: 'Show password',
  hide: 'Hide password',
  minLength: (min) => `At least ${min} characters.`,
});

export const STATE_COPY = Object.freeze({
  emptyTitle: 'No data yet',
  emptyDescription: 'Data will appear here once there is something to show.',
  errorTitle: 'Data could not be loaded',
  loadingLabel: 'Loading data',
  noMatchTitle: 'No results',
  noMatchDescription: 'No data matches this search or filter.',
});

export const TABLE_COPY = Object.freeze({
  pageSize: 'Rows per page',
  previous: 'Previous',
  next: 'Next',
  pagination: 'Data pages',
  range: (from, to, total) => `${from}–${to} of ${total}`,
  rowActions: (name) => `Actions for ${name}`,
});

export const STATUS_COPY = Object.freeze({
  active: 'Active',
  inactive: 'Inactive',
  throttled: 'Throttled',
  mustChangePassword: 'Password change required',
  success: 'Success',
  failed: 'Failed',
  on: 'active',
  off: 'inactive',
});

/** Health states of system pages / provider cards (StatusBadge keys ok, warn, error, off, unknown). */
export const HEALTH_STATUS_COPY = Object.freeze({ ok: 'Healthy', warn: 'Warning', error: 'Problem', off: 'Inactive', unknown: 'No data' });

export const CONFIRM_COPY = Object.freeze({
  typeToConfirm: (value) => `Type ${value} to confirm`,
  reason: 'Reason',
  password: 'Your password',
});
