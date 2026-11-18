// scripts/qa-ui/seed-users.mjs
import crypto from 'node:crypto';
import { openAuthDatabase } from '../../src/auth/authDatabase.mjs';

/**
 * Populates the throwaway QA server (never a real database) through the real account API so the user, login-log and
 * audit tables in screenshots and probes have rows: 24 staff accounts (some inactive, one throttled, one with a very
 * long name/email), sign-in history and audit rows. Accounts are made through the HTTP routes as the QA super_admin
 * (same validation and audit trail as production); the sign-in history is inserted into the throwaway database.
 */

const STAFF_PASSWORD = 'qa-staff-password-1234'; // qa-only, throwaway server
const NAMES = ['Sari Lestari', 'Dewi Anggraini', 'Agus Setiawan', 'Rina Marlina', 'Hendra Wijaya', 'Maya Putri', 'Fajar Nugroho', 'Lina Kusuma',
  'Bagas Pratama', 'Citra Ayu', 'Dimas Saputra', 'Eka Wulandari', 'Gilang Ramadhan', 'Hani Permata', 'Irfan Hakim', 'Joko Susilo',
  'Kartika Sari', 'Lukman Hakim', 'Mega Safitri', 'Nanda Pertiwi', 'Oki Firmansyah', 'Putra Mahendra'];
export const LONG_NAME = 'Muhammad Abdurrahman Wijayakusuma Prasetyaningrum';
export const LONG_EMAIL = 'muhammad.abdurrahman.wijayakusuma.prasetyaningrum@divisi-operasional.contoh-perusahaan.example.test';

async function call(url, cookie, method, path, body) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(method === 'GET' ? {} : { origin: url }), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && !path.includes('sign-in')) throw new Error(`seed ${method} ${path} → ${response.status} ${payload.error ?? ''} ${JSON.stringify(body)?.slice(0, 60)}`);
  return payload;
}

/**
 * @param {{url: string, cookie: {name: string, value: string}, dbFile: string}} options QA server URL, the super_admin session cookie, the throwaway auth database file.
 */
export async function seedUsersData({ url, cookie, dbFile }) {
  const session = `${cookie.name}=${cookie.value}`;
  const accounts = [];
  const make = async (index, name, email, extra = {}) => {
    const { user } = await call(url, session, 'POST', '/api/admin/users', {
      email, name, password: STAFF_PASSWORD, capabilities: { layers: index % 5 !== 4, ai: index % 3 !== 0, premium: index % 4 === 0 }, ...extra,
    });
    accounts.push({ id: user.id, email });
    return user;
  };
  for (const [index, name] of NAMES.entries()) {
    await make(index, name, `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@contoh.example.test`);
  }
  await make(1, LONG_NAME, LONG_EMAIL);
  await make(2, 'Tamu Magang', 'magang@contoh.example.test');
  for (const account of accounts.filter((_, index) => index % 7 === 6)) await call(url, session, 'POST', `/api/admin/users/${account.id}/deactivate`, {});
  await call(url, session, 'PATCH', `/api/admin/users/${accounts[4].id}`, { name: 'Hendra Wijaya Putra' });
  await call(url, session, 'POST', `/api/admin/users/${accounts[5].id}/sessions/revoke`, {});
  await seedLoginLog({ dbFile, accounts });
  return { accounts };
}

const AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
];
const REASONS = ['bad_credentials', 'bad_credentials', 'throttled', 'disabled', 'rate_limited'];

/**
 * Sign-in history written straight into the throwaway database (the real sign-in path is rate limited to a few
 * attempts per window, far too slow to seed dozens of rows), plus one throttled account.
 */
async function seedLoginLog({ dbFile, accounts }) {
  const { db } = await openAuthDatabase(dbFile);
  const insert = db.prepare('INSERT INTO login_log (id, userId, emailHash, success, reason, createdAt, ip, userAgent, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const now = Date.now();
  for (let index = 0; index < 34; index += 1) {
    const unknown = index % 9 === 8;
    const success = !unknown && index % 3 !== 1;
    insert.run(
      crypto.randomUUID(), unknown ? null : accounts[index % accounts.length].id, unknown ? crypto.randomBytes(32).toString('hex') : null,
      success ? 1 : 0, success ? null : REASONS[index % REASONS.length], new Date(now - index * 47 * 60 * 1000).toISOString(),
      index % 4 === 0 ? '0000:0000:0000:0000:0000:0000:0000:0001' : `203.0.113.${10 + (index % 40)}`, AGENTS[index % AGENTS.length], index % 11 === 10 ? 'google' : 'password',
    );
  }
  db.prepare('UPDATE "user" SET throttleUntil = ? WHERE id = ?').run(new Date(now + 10 * 60 * 1000).toISOString(), accounts[3].id);
  await db.close?.();
}
