import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthHooks } from './authHooks.mjs';

// Database hooks get Better Auth's endpoint context: `path` is the endpoint TEMPLATE
// (`/callback/:id`) and `params.id` the provider — the Google-callback signal.
const googleCallback = (users) => ({ path: '/callback/:id', params: { id: 'google' }, context: { internalAdapter: { findUserById: async (id) => users[id] ?? null } } });
const emailSignIn = (users) => ({ path: '/sign-in/email', context: { internalAdapter: { findUserById: async (id) => users[id] ?? null } } });

function hooks() {
  const logged = [];
  const { databaseHooks } = createAuthHooks({
    config: { superAdminEmails: ['owner@example.test'], secret: 'test-only-secret' },
    recordLogin: async (attempt) => { logged.push(attempt); return true; },
    throttle: { clearUser: async () => {} },
    getContext: async () => { throw new Error('internal calls only'); },
  });
  return { logged, user: databaseHooks.user.create.before, session: databaseHooks.session.create.before };
}
const code = async (promise) => { try { await promise; return 'ok'; } catch (error) { return error.body?.code ?? error.message; } };

test('user.create.before: Google may create only a verified env email (as super_admin); other HTTP sign-up refused', async () => {
  const { user, logged } = hooks();
  assert.equal(await code(user({ email: 'stranger@example.test', emailVerified: true }, googleCallback({}))), 'GOOGLE_NOT_ALLOWED');
  assert.equal(await code(user({ email: 'owner@example.test', emailVerified: false }, googleCallback({}))), 'GOOGLE_NOT_ALLOWED');
  assert.equal(logged.at(-1).reason, 'google_denied');
  assert.match(logged.at(-1).emailHash, /^[0-9a-f]{64}$/);
  const created = await user({ email: 'owner@example.test', emailVerified: true, role: 'user' }, googleCallback({}));
  assert.equal(created.data.role, 'super_admin');
  assert.equal(await code(user({ email: 'x@example.test' }, { path: '/sign-up/email' })), 'SIGN_UP_DISABLED');
  assert.equal(await user({ email: 'x@example.test' }, undefined), undefined, 'internal creation (service/CLI) untouched');
});

test('session.create.before: Google session only for a verified env email; closed accounts never get one', async () => {
  const { session } = hooks();
  const users = {
    owner: { id: 'owner', email: 'owner@example.test', emailVerified: true },
    removed: { id: 'removed', email: 'removed@example.test', emailVerified: true, role: 'super_admin' },
    unverified: { id: 'unverified', email: 'owner@example.test', emailVerified: false },
    banned: { id: 'banned', email: 'owner@example.test', emailVerified: true, banned: true },
  };
  assert.equal(await code(session({ userId: 'owner' }, googleCallback(users))), 'ok');
  assert.equal(await code(session({ userId: 'removed' }, googleCallback(users))), 'GOOGLE_NOT_ALLOWED', 'email taken out of env');
  assert.equal(await code(session({ userId: 'unverified' }, googleCallback(users))), 'GOOGLE_NOT_ALLOWED');
  assert.equal(await code(session({ userId: 'banned' }, googleCallback(users))), 'ACCOUNT_DISABLED');
});

test('session.create.before: password sign-in for an env email needs a CLI-set password', async () => {
  const { session, logged } = hooks();
  const users = { cli: { id: 'cli', email: 'owner@example.test', passwordSetBy: 'cli' }, admin: { id: 'admin', email: 'owner@example.test', passwordSetBy: 'admin' }, plain: { id: 'plain', email: 'u@example.test', passwordSetBy: 'admin' } };
  assert.equal(await code(session({ userId: 'cli' }, emailSignIn(users))), 'ok');
  assert.equal(await code(session({ userId: 'admin' }, emailSignIn(users))), 'GOOGLE_SIGN_IN_REQUIRED');
  assert.equal(logged.at(-1).reason, 'google_only');
  assert.equal(await code(session({ userId: 'plain' }, emailSignIn(users))), 'ok');
});
