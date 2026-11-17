// Integration: the real Google callback route on a temp SQLite DB, with only
// Google's token endpoint faked (code → id_token). Proves which same-email
// accounts a Google sign-in may attach to (googleLinkPolicy + authHooks).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, OWNER_PASSWORD, actorFor, signInOwner, startAuthTestServer } from './__fixtures__/authTestServer.mjs';

const CLIENT_ID = 'fixture.apps.googleusercontent.com'; // test-only
const SECOND_EMAIL = 'second@example.test'; // test-only
const FRESH_EMAIL = 'fresh@example.test'; // test-only
const PASSWORD = 'correct-horse-battery-staple'; // test-only
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let t;
let owner;
let realFetch;
let identity = null;

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** Unsigned id_token: the code flow trusts the TLS token endpoint, Better Auth only decodes it. */
const fakeIdToken = ({ sub, email, emailVerified = true }) => [
  b64url({ alg: 'RS256', typ: 'JWT', kid: 'fixture' }),
  b64url({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, email, email_verified: emailVerified, name: 'Google Name', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 }),
  'sig',
].join('.');

before(async () => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input?.url ?? input).startsWith(TOKEN_ENDPOINT)) {
      return new Response(JSON.stringify({ access_token: 'fixture-access', id_token: fakeIdToken(identity), token_type: 'Bearer', expires_in: 3600 }), { headers: { 'content-type': 'application/json' } });
    }
    return realFetch(input, init);
  };
  t = await startAuthTestServer({ env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'fixture-secret', SUPER_ADMIN_EMAILS: `${OWNER_EMAIL},${SECOND_EMAIL},${FRESH_EMAIL}` } });
  owner = await actorFor(t, await signInOwner(t));
});
after(async () => {
  globalThis.fetch = realFetch;
  await t.close();
});

const cookiePairs = (res) => (res.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]);

/** Start a Google sign-in, then come back through the callback as `who`. */
async function googleSignIn(who) {
  identity = who;
  const start = await t.post('/api/auth/sign-in/social', { provider: 'google' });
  assert.equal(start.status, 200);
  const { url } = await start.json();
  const state = new URL(url).searchParams.get('state');
  const back = await t.request(`/api/auth/callback/google?code=fixture-code&state=${encodeURIComponent(state)}`, { cookie: cookiePairs(start).join('; ') });
  const session = cookiePairs(back).find((pair) => pair.startsWith('gev.session_token=') && pair.length > 'gev.session_token='.length);
  return { status: back.status, location: back.headers.get('location') ?? '', session };
}

const providersOf = (email) => t.rows('SELECT a.providerId FROM account a JOIN "user" u ON u.id = a.userId WHERE u.email = ? ORDER BY a.providerId', email).map((row) => row.providerId);
const googleDenials = () => t.rows("SELECT COUNT(*) AS n FROM login_log WHERE reason = 'google_denied'")[0].n;

test('CLI-bootstrapped super_admin: Google links to the existing account and signs in to /dev', async () => {
  assert.deepEqual(providersOf(OWNER_EMAIL), ['credential']);
  const result = await googleSignIn({ sub: 'google-owner', email: OWNER_EMAIL });
  assert.equal(result.status, 302);
  assert.match(result.location, /\/dev$/);
  assert.ok(result.session, 'session cookie set');
  assert.deepEqual(providersOf(OWNER_EMAIL), ['credential', 'google']);
  const me = await (await t.request('/api/me', { cookie: result.session })).json();
  assert.deepEqual([me.user.email, me.user.role], [OWNER_EMAIL, 'super_admin']);
  // The CLI password keeps working next to Google.
  assert.equal((await t.signIn(OWNER_EMAIL, OWNER_PASSWORD)).res.status, 200);
  // Second Google sign-in reuses the link (no new row).
  assert.ok((await googleSignIn({ sub: 'google-owner', email: OWNER_EMAIL })).session);
  assert.deepEqual(providersOf(OWNER_EMAIL), ['credential', 'google']);
});

test('env email whose password an admin set: Google is refused, nothing linked, google_denied logged', async () => {
  assert.equal((await t.state.services.bootstrap.setSuperAdminPassword(SECOND_EMAIL, PASSWORD)).ok, true);
  const ctx = await t.state.auth.$context;
  await ctx.adapter.update({ model: 'user', where: [{ field: 'email', value: SECOND_EMAIL }], update: { passwordSetBy: 'admin' } });
  const denialsBefore = googleDenials();
  const result = await googleSignIn({ sub: 'google-second', email: SECOND_EMAIL });
  assert.equal(result.status, 302);
  assert.match(result.location, /^\/login\?next=\/dev&notice=google&error=account_not_linked/);
  assert.doesNotMatch(result.location, /password_not_cli|not_reserved/, 'the reason stays out of the URL');
  assert.equal(result.session, undefined);
  assert.deepEqual(providersOf(SECOND_EMAIL), ['credential']);
  assert.equal(googleDenials(), denialsBefore + 1);
});

test('admin-created user account (not on the env list): Google is refused and not linked', async () => {
  const created = await t.state.services.accounts.createUser(owner, { email: 'budi@example.test', name: 'Budi', password: PASSWORD });
  assert.equal(created.ok, true, created.code);
  const result = await googleSignIn({ sub: 'google-budi', email: 'budi@example.test' });
  assert.match(result.location, /notice=google&error=/);
  assert.equal(result.session, undefined);
  assert.deepEqual(providersOf('budi@example.test'), ['credential']);
});

test('CLI super_admin but Google does not verify the email: refused', async () => {
  const result = await googleSignIn({ sub: 'google-unverified', email: OWNER_EMAIL, emailVerified: false });
  assert.match(result.location, /notice=google&error=/);
  assert.equal(result.session, undefined);
  assert.equal(t.rows("SELECT COUNT(*) AS n FROM account WHERE accountId = 'google-unverified'")[0].n, 0);
});

test('env email with no account yet: Google creates a Google-only super_admin (register path unchanged)', async () => {
  const result = await googleSignIn({ sub: 'google-fresh', email: FRESH_EMAIL });
  assert.ok(result.session, result.location);
  assert.deepEqual(providersOf(FRESH_EMAIL), ['google']);
  assert.equal(t.rows('SELECT role FROM "user" WHERE email = ?', FRESH_EMAIL)[0].role, 'super_admin');
});

test('unknown email off the env list: refused promptly, no account, denial logged, DB not deadlocked', async () => {
  const denialsBefore = googleDenials();
  const result = await googleSignIn({ sub: 'google-stranger', email: 'stranger@example.test' });
  assert.match(result.location, /notice=google&error=GOOGLE_NOT_ALLOWED/);
  assert.equal(t.rows("SELECT COUNT(*) AS n FROM \"user\" WHERE email = 'stranger@example.test'")[0].n, 0);
  // The log row is written after the transaction rolled back; a password sign-in still works (no lock held).
  assert.equal((await t.signIn(OWNER_EMAIL, OWNER_PASSWORD)).res.status, 200);
  assert.equal(googleDenials(), denialsBefore + 1);
});
