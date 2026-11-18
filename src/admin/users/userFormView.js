/**
 * Pure create/edit form logic of the Pengguna dialogs: defaults, API bodies, readiness, the live password checklist and
 * the "Salin pesan" handover text. No DOM, no network.
 *
 * @module admin/users/userFormView
 */
import { CAPABILITY_KEYS, DEFAULT_CAPABILITIES } from '../../auth/authCapabilities.mjs';
import { ROLE_USER, normalizeEmail } from '../../auth/authRoles.mjs';
import { PASSWORD_MAX, minPasswordLength, validatePassword } from '../../auth/passwordPolicy.mjs';
import { USERS_COPY } from '../../copy/en/users.js';

/**
 * Empty create form (owner defaults: Layer data + Voice & AI on, premium off).
 * @returns {{email: string, name: string, role: string, capabilities: object, passwordMode: 'generate' | 'typed', password: string}}
 */
export function createFormDefaults() {
  return { email: '', name: '', role: ROLE_USER, capabilities: { ...DEFAULT_CAPABILITIES }, passwordMode: 'generate', password: '' };
}

/**
 * API body of the create form (`role` only when the area manages roles; toggles only for users).
 * @param {ReturnType<typeof createFormDefaults>} form
 * @param {boolean} chooseRole
 */
export function createPayload(form, chooseRole) {
  const role = chooseRole ? form.role : ROLE_USER;
  const body = { email: form.email.trim(), name: form.name.trim(), ...(chooseRole ? { role } : {}) };
  if (role === ROLE_USER) body.capabilities = { ...form.capabilities };
  return form.passwordMode === 'generate' ? { ...body, generate: true } : { ...body, password: form.password };
}

/**
 * Whether the create form may be submitted (the server stays the authority; this only avoids a pointless round trip).
 * @param {ReturnType<typeof createFormDefaults>} form
 * @param {boolean} chooseRole
 */
export function createFormReady(form, chooseRole) {
  const role = chooseRole ? form.role : ROLE_USER;
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim()) || form.name.trim() === '') return false;
  return form.passwordMode === 'generate' || passwordRequirements({ ...form, role }).every((item) => item.met);
}

/**
 * Body of `PATCH /api/admin/users/:id`: only the fields the actor may edit and that changed; the three capability
 * toggles always travel together. Null when nothing changed.
 * @param {{name: string, email: string, capabilities: object}} target
 * @param {{name: string, email: string, capabilities: object}} form
 * @param {{name: boolean, email: boolean, capabilities: boolean}} edit Flags from `rowActions(...).edit`.
 */
export function editPayload(target, form, edit) {
  const body = {};
  if (edit.name && form.name.trim() !== target.name) body.name = form.name.trim();
  if (edit.email && normalizeEmail(form.email) !== target.email) body.email = form.email.trim();
  if (edit.capabilities && CAPABILITY_KEYS.some((key) => form.capabilities[key] !== target.capabilities[key])) {
    body.capabilities = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, Boolean(form.capabilities[key])]));
  }
  return Object.keys(body).length ? body : null;
}

/**
 * Live checklist for a typed password: length for the role, upper bound, and not equal to the email or name.
 * @param {{password: string, role: string, email?: string, name?: string}} input
 * @returns {Array<{id: 'min' | 'max' | 'identity', label: string, met: boolean}>}
 */
export function passwordRequirements({ password, role, email = '', name = '' }) {
  const { password: copy } = USERS_COPY;
  const length = [...password].length;
  const min = minPasswordLength(role);
  const weak = validatePassword(password, { email, name, role });
  return [
    { id: 'min', label: copy.minLength(min), met: length >= min },
    { id: 'max', label: copy.maxLength(PASSWORD_MAX), met: length <= PASSWORD_MAX },
    { id: 'identity', label: copy.notIdentity, met: weak.ok || weak.reason !== 'matches_identity' },
  ];
}

/**
 * The "Salin pesan" text an admin sends (e.g. over WhatsApp) to a new or reset account.
 * @param {{origin: string, email: string, password: string, reset?: boolean}} input
 * @returns {string}
 */
export function handoverMessage({ origin, email, password, reset = false }) {
  const base = String(origin ?? '').replace(/\/+$/, '');
  const copy = USERS_COPY.handover;
  return [reset ? copy.reset : copy.created, '', copy.loginUrl(`${base}/login`), copy.email(email), copy.password(password), '', copy.note].join('\n');
}
