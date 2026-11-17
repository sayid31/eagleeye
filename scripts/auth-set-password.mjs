#!/usr/bin/env node
// scripts/auth-set-password.mjs — `npm run auth:set-password -- --email <address>`
/**
 * Emergency/bootstrap path for a super_admin (plan/auth/03 §Jalur darurat):
 * the email must be in SUPER_ADMIN_EMAILS; the password is typed twice at a
 * hidden prompt; the account is created or its password replaced with
 * `passwordSetBy = 'cli'`, its sessions are revoked and its throttle cleared;
 * `bootstrap.super_admin` is audited. Prints no secret and no email.
 */

import { describeUnconfigured, openCheckoutAuth } from './authCheckout.mjs';
import { emailArgument, promptHidden } from './authPrompt.mjs';

const email = emailArgument(process.argv);
if (!email) {
  console.error('[auth:set-password] usage: npm run auth:set-password -- --email <address listed in SUPER_ADMIN_EMAILS>');
  process.exit(2);
}
try {
  const { config, services } = await openCheckoutAuth();
  if (!services) {
    console.error(`[auth:set-password] ${describeUnconfigured(config)}`);
    process.exit(1);
  }
  const password = await promptHidden('New password (min 15 characters): ');
  if (password !== await promptHidden('Repeat it: ')) {
    console.error('[auth:set-password] the two passwords differ; nothing changed.');
    process.exit(1);
  }
  const result = await services.bootstrap.setSuperAdminPassword(email, password);
  if (!result.ok) {
    console.error(`[auth:set-password] refused: ${result.code}${result.reason ? ` (${result.reason})` : ''}; nothing changed.`);
    process.exit(1);
  }
  console.log(`[auth:set-password] ${result.created ? 'super_admin account created' : 'password replaced'} (user ${result.userId}); other sessions signed out; audit ${result.audit}.`);
} catch (error) {
  console.error(`[auth:set-password] failed: ${error?.message || error}`);
  process.exit(1);
}
