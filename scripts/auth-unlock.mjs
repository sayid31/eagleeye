#!/usr/bin/env node
// scripts/auth-unlock.mjs — `npm run auth:unlock -- --email <address>`
/**
 * Clears the sign-in throttle of an email (the account's counter and the
 * unknown-email counter), audited as `auth.unlock`. The throttle also expires
 * by itself (≤ 15 minutes); this is for when that is too long.
 */

import { describeUnconfigured, openCheckoutAuth } from './authCheckout.mjs';
import { emailArgument } from './authPrompt.mjs';

const email = emailArgument(process.argv);
if (!email) {
  console.error('[auth:unlock] usage: npm run auth:unlock -- --email <address>');
  process.exit(2);
}
try {
  const { config, services } = await openCheckoutAuth();
  if (!services) {
    console.error(`[auth:unlock] ${describeUnconfigured(config)}`);
    process.exit(1);
  }
  const result = await services.bootstrap.unlock(email);
  console.log(`[auth:unlock] throttle cleared${result.found ? '' : ' (no account with that email; the unknown-email counter was reset)'}; audit ${result.audit}.`);
} catch (error) {
  console.error(`[auth:unlock] failed: ${error?.message || error}`);
  process.exit(1);
}
