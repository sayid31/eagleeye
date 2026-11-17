import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authEndpointDecision, authEndpointOriginAllowed, canonicalAuthPath } from './authEndpointPolicy.mjs';

const allowed = (method, url) => authEndpointDecision(method, url).allowed;

test('the allowlist opens exactly the documented method+path pairs', () => {
  assert.equal(allowed('POST', '/api/auth/sign-in/email'), true);
  assert.equal(allowed('POST', '/api/auth/sign-out'), true);
  assert.equal(allowed('GET', '/api/auth/get-session'), true);
  assert.equal(allowed('POST', '/api/auth/change-password'), true);
  assert.equal(allowed('POST', '/api/auth/update-user'), true);
  assert.equal(allowed('POST', '/api/auth/revoke-other-sessions'), true);
  assert.equal(allowed('POST', '/api/auth/sign-in/social'), true);
  assert.equal(allowed('GET', '/api/auth/callback/google?code=x&state=y'), true);
  assert.deepEqual(authEndpointDecision('post', '/api/auth/sign-in/email?x=1'), { allowed: true, endpoint: 'POST /sign-in/email' });
});

test('everything else is refused: sign-up, reset, verify-password, admin/*, other callbacks, wrong methods', () => {
  const refused = [
    ['POST', '/api/auth/sign-up/email'], ['POST', '/api/auth/request-password-reset'], ['POST', '/api/auth/reset-password'],
    ['GET', '/api/auth/reset-password/tok'], ['POST', '/api/auth/verify-password'], ['POST', '/api/auth/admin/set-role'],
    ['GET', '/api/auth/admin/list-users'], ['GET', '/api/auth/callback/github'], ['POST', '/api/auth/callback/google'],
    ['POST', '/api/auth/change-email'], ['POST', '/api/auth/delete-user'], ['GET', '/api/auth/list-sessions'],
    ['POST', '/api/auth/revoke-session'], ['POST', '/api/auth/revoke-sessions'], ['GET', '/api/auth/ok'], ['GET', '/api/auth/error'],
    ['POST', '/api/auth/update-session'], ['GET', '/api/auth/account-info'], ['GET', '/api/auth/list-accounts'],
    ['POST', '/api/auth/link-social'], ['POST', '/api/auth/unlink-account'], ['POST', '/api/auth/get-access-token'],
    ['POST', '/api/auth/refresh-token'], ['POST', '/api/auth/send-verification-email'], ['GET', '/api/auth/verify-email'],
    ['GET', '/api/auth/sign-in/email'], ['POST', '/api/auth/get-session'],
  ];
  for (const [method, url] of refused) assert.equal(allowed(method, url), false, `${method} ${url}`);
});

test('path smuggling is refused raw: %2e%2e, //, \\, dot segments, encoded slash, case, trailing slash', () => {
  const smuggled = [
    '/api/auth/sign-in/%2e%2e/admin/set-role', '/api/auth/sign-in/%2E%2E/sign-up/email', '/api/auth//sign-in/email',
    '/api/auth/sign-in//email', '/api/auth/sign-in/../sign-up/email', '/api/auth/./sign-in/email', '/api/auth\\sign-in\\email',
    '/api/auth/sign-in%2femail', '/api/auth/Sign-In/Email', '/api/auth/sign-in/email/', '/api/authx/sign-in/email',
  ];
  for (const url of smuggled) assert.equal(allowed('POST', url), false, url);
  assert.equal(canonicalAuthPath('/api/auth/sign-in/%2e%2e/admin'), null);
  assert.equal(canonicalAuthPath('/api/auth/sign-in/email#frag'), '/sign-in/email');
});

test('origin gate: writes need the trusted Origin (or Referer) and no cross-site Sec-Fetch-Site', () => {
  const trustedOrigin = 'http://localhost:4173';
  assert.equal(authEndpointOriginAllowed({ method: 'GET', headers: {}, trustedOrigin }), true);
  assert.equal(authEndpointOriginAllowed({ method: 'POST', headers: { origin: trustedOrigin }, trustedOrigin }), true);
  assert.equal(authEndpointOriginAllowed({ method: 'POST', headers: { origin: 'http://localhost:5173' }, trustedOrigin }), false);
  assert.equal(authEndpointOriginAllowed({ method: 'POST', headers: { origin: trustedOrigin, 'sec-fetch-site': 'same-site' }, trustedOrigin }), false);
  assert.equal(authEndpointOriginAllowed({ method: 'POST', headers: { referer: `${trustedOrigin}/login` }, trustedOrigin }), true);
  assert.equal(authEndpointOriginAllowed({ method: 'POST', headers: { referer: 'not a url' }, trustedOrigin }), false);
  assert.equal(authEndpointOriginAllowed({ method: 'POST', headers: {}, trustedOrigin }), false);
});
