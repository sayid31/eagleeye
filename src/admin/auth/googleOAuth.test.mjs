import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildAuthUrl, decodeIdToken, exchangeCode, newLoginSecrets, validateIdToken } from './googleOAuth.mjs';

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const NOW = 1_700_000_000_000;
const expected = { clientId: 'cid', nonce: 'n1', adminEmail: 'owner@example.com', now: NOW };
const goodClaims = { iss: 'https://accounts.google.com', aud: 'cid', exp: NOW / 1000 + 60, nonce: 'n1', email: 'Owner@Example.com', email_verified: true };

test('PKCE challenge is the S256 hash of the verifier', () => {
  const s = newLoginSecrets();
  assert.equal(s.challenge, createHash('sha256').update(s.verifier).digest('base64url'));
  assert.notEqual(newLoginSecrets().state, s.state);
});

test('auth URL carries state, nonce, PKCE and the email scope', () => {
  const url = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'http://localhost:4173/cb', state: 's', nonce: 'n', challenge: 'c' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 's');
  assert.equal(url.searchParams.get('nonce'), 'n');
});

test('the admin Google account passes (email compared case-insensitively)', () => {
  assert.deepEqual(validateIdToken(goodClaims, expected), { ok: true, email: 'owner@example.com' });
});

test('each broken claim is refused with its own reason', () => {
  const cases = [
    [{ iss: 'https://evil.example' }, 'bad_issuer'],
    [{ aud: 'other' }, 'bad_audience'],
    [{ exp: NOW / 1000 - 1 }, 'token_expired'],
    [{ nonce: 'replayed' }, 'bad_nonce'],
    [{ email_verified: false }, 'email_unverified'],
    [{ email_verified: 'true' }, 'email_unverified'],
    [{ email: 'someone@else.com' }, 'not_admin'],
    [{ email: undefined }, 'not_admin'],
  ];
  for (const [patch, reason] of cases) {
    assert.deepEqual(validateIdToken({ ...goodClaims, ...patch }, expected), { ok: false, reason }, reason);
  }
});

test('decodeIdToken reads claims and rejects non-JWT input', () => {
  assert.equal(decodeIdToken(jwt({ email: 'a@b.co' })).email, 'a@b.co');
  assert.throws(() => decodeIdToken('not-a-jwt'), /three-part/);
});

test('exchangeCode posts the code with the PKCE verifier and returns the id_token', async () => {
  let seen;
  const fetchFn = async (url, init) => { seen = { url, body: new URLSearchParams(init.body) }; return { ok: true, status: 200, json: async () => ({ id_token: 'tok' }) }; };
  const token = await exchangeCode({ clientId: 'cid', clientSecret: 'sec', redirectUri: 'r', code: 'c1', verifier: 'v1', fetchFn });
  assert.equal(token, 'tok');
  assert.equal(seen.url, 'https://oauth2.googleapis.com/token');
  assert.equal(seen.body.get('code_verifier'), 'v1');
  assert.equal(seen.body.get('grant_type'), 'authorization_code');
});

test('a failed exchange throws without echoing the client secret', async () => {
  const fetchFn = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
  await assert.rejects(
    exchangeCode({ clientId: 'cid', clientSecret: 'TOPSECRET', redirectUri: 'r', code: 'c', verifier: 'v', fetchFn }),
    (error) => /HTTP 400 invalid_grant/.test(error.message) && !error.message.includes('TOPSECRET'),
  );
});
