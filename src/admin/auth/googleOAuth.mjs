// src/admin/auth/googleOAuth.mjs
/**
 * Google sign-in (authorization-code flow + PKCE) for the admin dashboard.
 *
 * The ID token is decoded WITHOUT checking its signature because it is read
 * straight from Google's token endpoint over TLS in the same request that
 * redeemed our one-time code (OpenID Connect Core 3.1.3.7 allows this). Its
 * claims are still validated in `validateIdToken`. If the token ever arrives
 * by another path (e.g. the browser), signature checking becomes mandatory.
 *
 * @module admin/auth/googleOAuth
 */
import { createHash, randomBytes } from 'node:crypto';

// Fixed OAuth/OIDC protocol endpoints, not environment configuration.
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const TOKEN_TIMEOUT_MS = 10_000;
const RANDOM_BYTES = 32;

/** @returns {{state: string, nonce: string, verifier: string, challenge: string}} */
export function newLoginSecrets() {
  const verifier = randomBytes(RANDOM_BYTES).toString('base64url');
  return {
    state: randomBytes(RANDOM_BYTES).toString('base64url'),
    nonce: randomBytes(RANDOM_BYTES).toString('base64url'),
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

/**
 * @param {{clientId: string, redirectUri: string, state: string, nonce: string, challenge: string}} p
 * @returns {string}
 */
export function buildAuthUrl({ clientId, redirectUri, state, nonce, challenge }) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.href;
}

/**
 * Redeems the one-time code for an ID token.
 * @param {{clientId: string, clientSecret: string, redirectUri: string, code: string, verifier: string, fetchFn?: typeof fetch}} p
 * @returns {Promise<string>}
 */
export async function exchangeCode({ clientId, clientSecret, redirectUri, code, verifier, fetchFn = fetch }) {
  const response = await fetchFn(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.id_token !== 'string') {
    throw new Error(`Google token exchange failed: HTTP ${response.status} ${payload.error ?? 'no id_token'}`);
  }
  return payload.id_token;
}

/**
 * @param {string} idToken
 * @returns {object} Claims.
 */
export function decodeIdToken(idToken) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('ID token is not a three-part JWT');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

/**
 * @param {object} claims
 * @param {{clientId: string, nonce: string, adminEmail: string, now?: number}} expected
 * @returns {{ok: true, email: string} | {ok: false, reason: string}}
 */
export function validateIdToken(claims, { clientId, nonce, adminEmail, now = Date.now() }) {
  if (!GOOGLE_ISSUERS.includes(claims.iss)) return { ok: false, reason: 'bad_issuer' };
  if (claims.aud !== clientId) return { ok: false, reason: 'bad_audience' };
  if (!(claims.exp * 1000 > now)) return { ok: false, reason: 'token_expired' };
  if (claims.nonce !== nonce) return { ok: false, reason: 'bad_nonce' };
  if (claims.email_verified !== true) return { ok: false, reason: 'email_unverified' };
  const email = String(claims.email ?? '').trim().toLowerCase();
  if (!email || email !== adminEmail) return { ok: false, reason: 'not_admin' };
  return { ok: true, email };
}
