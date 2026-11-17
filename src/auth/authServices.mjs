// src/auth/authServices.mjs
/**
 * Wires the stateful auth services on one Better Auth instance: the audit
 * writer, the sign-in throttle, the account service (for `/api/admin/*`
 * routes, phase 2) and the CLI bootstrap. Built once per server by
 * `authPlugin.mjs` and once per CLI run.
 *
 * @module auth/authServices
 */

import { createAccountBootstrap } from './accountBootstrap.mjs';
import { createAccountService } from './accountService.mjs';
import { createAuditWriter } from './auditLog.mjs';
import { createLoginThrottle } from './loginThrottle.mjs';

/**
 * @param {object} auth Better Auth instance from createAuthInstance.
 * @param {{secret: string, superAdminEmails: string[]}} config
 * @returns {{audit: object, throttle: object, accounts: ReturnType<typeof createAccountService>,
 *   bootstrap: ReturnType<typeof createAccountBootstrap>}}
 */
export function createAuthServices(auth, config) {
  const getContext = () => auth.$context;
  const audit = createAuditWriter({ getContext });
  const throttle = createLoginThrottle({ getContext, secret: config.secret });
  const deps = { auth, superAdminEmails: config.superAdminEmails, audit, throttle };
  return { audit, throttle, accounts: createAccountService(deps), bootstrap: createAccountBootstrap(deps) };
}
