// src/auth/authSchema.mjs
/**
 * Database schema owned by this app on top of Better Auth's core tables:
 * the extra `user` columns and three tables (`login_log`, `login_throttle`,
 * `audit_log`). Declared through Better Auth (user.additionalFields + a
 * schema-only plugin) so its programmatic migration creates them with
 * everything else. Every user field is `input: false`: no HTTP body can set it.
 *
 * @module auth/authSchema
 */

import { DEFAULT_CAPABILITIES, serializeCapabilities } from './authCapabilities.mjs';
import { DEFAULT_ROLE } from './authRoles.mjs';

export const LOGIN_LOG_MODEL = 'loginLog';
export const LOGIN_THROTTLE_MODEL = 'loginThrottle';
export const AUDIT_LOG_MODEL = 'auditLog';

const serverOnly = (field) => ({ required: false, input: false, ...field });

/** `user.additionalFields` (plan/auth/03 §Konfigurasi). */
export const USER_FIELDS = Object.freeze({
  role: serverOnly({ type: 'string', defaultValue: DEFAULT_ROLE }),
  banned: serverOnly({ type: 'boolean', defaultValue: false }),
  capabilities: serverOnly({ type: 'string', defaultValue: serializeCapabilities(DEFAULT_CAPABILITIES) }),
  mustChangePassword: serverOnly({ type: 'boolean', defaultValue: false }),
  // `cli` | `admin` | `self` — who chose the current password (gates super_admin promotion).
  passwordSetBy: serverOnly({ type: 'string' }),
  failedLoginCount: serverOnly({ type: 'number', defaultValue: 0 }),
  throttleUntil: serverOnly({ type: 'date' }),
  deletedAt: serverOnly({ type: 'date' }),
  createdBy: serverOnly({ type: 'string' }),
});

/**
 * Better Auth plugin that only contributes the three tables.
 * @returns {import('better-auth').BetterAuthPlugin}
 */
export function gevSchemaPlugin() {
  return {
    id: 'gev-schema',
    schema: {
      [LOGIN_LOG_MODEL]: {
        modelName: 'login_log',
        fields: {
          // Nullable: a failed attempt for an unknown email has no user, only emailHash.
          userId: { type: 'string', required: false, index: true },
          emailHash: { type: 'string', required: false },
          success: { type: 'boolean', required: false },
          reason: { type: 'string', required: false },
          createdAt: { type: 'date', required: true, index: true },
          ip: { type: 'string', required: false },
          userAgent: { type: 'string', required: false },
          method: { type: 'string', required: true },
        },
      },
      [LOGIN_THROTTLE_MODEL]: {
        modelName: 'login_throttle',
        fields: {
          emailHash: { type: 'string', required: true, unique: true },
          failedCount: { type: 'number', required: false, defaultValue: 0 },
          throttleUntil: { type: 'date', required: false },
          updatedAt: { type: 'date', required: false },
        },
      },
      [AUDIT_LOG_MODEL]: {
        modelName: 'audit_log',
        fields: {
          createdAt: { type: 'date', required: true, index: true },
          actorId: { type: 'string', required: false },
          actorRole: { type: 'string', required: false },
          action: { type: 'string', required: true },
          targetType: { type: 'string', required: false },
          targetId: { type: 'string', required: false, index: true },
          targetEmailMasked: { type: 'string', required: false },
          summary: { type: 'string', required: false },
          meta: { type: 'string', required: false },
          ip: { type: 'string', required: false },
        },
      },
    },
  };
}
