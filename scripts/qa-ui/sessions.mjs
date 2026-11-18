// scripts/qa-ui/sessions.mjs
/**
 * Mints real sessions (super_admin / admin / user) directly in the throwaway auth database, reusing the repo's
 * `mintSessionCookie` (the same power as owning the server; the server has no bypass). Returns cookies only; the
 * secret never leaves this process.
 */
import { createAuthInstance } from '../../src/auth/authInstance.mjs';
import { DEFAULT_CAPABILITIES, serializeCapabilities } from '../../src/auth/authCapabilities.mjs';
import { readAuthEnv } from '../../src/auth/authEnv.mjs';
import { openAuthDatabase } from '../../src/auth/authDatabase.mjs';
import { migrateAuthDatabase } from '../../src/auth/authMigrations.mjs';
import { mintSessionCookie } from '../../src/auth/authSessionMint.mjs';
import { PASSWORD_SET_BY } from '../../src/auth/authRoles.mjs';
import { QA_SUPER_ADMIN_EMAIL, REPO_ROOT } from './server.mjs';

// admin/user hold a password (so /account shows the password section, as for any password account); super_admin above.
const ACCOUNTS = Object.freeze({
  // A super_admin must hold a CLI-set password (or a Google account) or the actor resolver refuses the role.
  super_admin: { email: QA_SUPER_ADMIN_EMAIL, name: 'Dev Owner', role: 'super_admin', passwordSetBy: PASSWORD_SET_BY.cli },
  admin: { email: 'admin@example.test', name: 'Ani Admin', role: 'admin', passwordSetBy: PASSWORD_SET_BY.self },
  user: { email: 'user@example.test', name: 'Budi User', role: 'user', passwordSetBy: PASSWORD_SET_BY.admin },
});

/**
 * @param {{env: Record<string, string>, port: number}} options The server's throwaway env (same secret + database file).
 * @returns {Promise<{cookies: Record<'super_admin' | 'admin' | 'user', {name: string, value: string}>, close: () => Promise<void>}>}
 */
export async function mintRoleSessions({ env, port }) {
  const config = readAuthEnv(env, { port, rootDir: REPO_ROOT });
  if (!config.ok) throw new Error(`Throwaway auth env is not valid — missing: ${config.missing.join(', ') || '-'}; invalid: ${config.invalid.join(', ') || '-'}`);
  const { db } = await openAuthDatabase(config.databaseFile);
  const auth = createAuthInstance({ database: db, config });
  await migrateAuthDatabase(auth, db, { defaultCapabilities: serializeCapabilities(DEFAULT_CAPABILITIES) });
  const cookies = {};
  for (const [role, account] of Object.entries(ACCOUNTS)) {
    const minted = await mintSessionCookie(auth, {
      ...account, banned: false, mustChangePassword: false, capabilities: { layers: true, ai: true, premium: true },
    });
    cookies[role] = { name: minted.cookieName, value: minted.cookieValue };
  }
  return { cookies, close: async () => { await db.close?.(); } };
}
