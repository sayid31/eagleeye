import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OWNER_EMAIL, OWNER_PASSWORD, actorFor, signInOwner, startAuthTestServer } from './__fixtures__/authTestServer.mjs';
import { readinessFactsFromDb, readinessFactsFromFile } from './authReadinessFacts.mjs';

const PASSWORD = 'fixture-password-long-1'; // test-only
let t;

before(async () => {
  t = await startAuthTestServer();
});
after(() => t.close());

test('counts env emails by sign-in path, password-only admins and blocked promotions', async () => {
  const envEmails = [OWNER_EMAIL, 'second@example.test', 'blocked@example.test'];
  let facts = readinessFactsFromDb(t.state.db, envEmails);
  assert.deepEqual(facts, { available: true, envEmails: 3, ready: 0, noAccount: 3, blocked: 0, passwordOnlyAdmins: 0, reconcileBlocked: 0 });

  const owner = await actorFor(t, await signInOwner(t));
  const blocked = await t.state.services.accounts.createUser(owner, { email: 'blocked@example.test', name: 'B', password: PASSWORD });
  await t.state.services.accounts.createUser(owner, { email: 'admin@example.test', name: 'A', role: 'admin', password: `${PASSWORD}-admin` });
  const gone = await t.state.services.accounts.createUser(owner, { email: 'gone@example.test', name: 'G', role: 'admin', password: `${PASSWORD}-admin` });
  await t.state.services.accounts.deactivate(owner, gone.user.id);
  await t.state.services.audit.write({ action: 'role.reconcile.blocked', targetId: blocked.user.id, targetEmail: 'blocked@example.test' });

  facts = readinessFactsFromDb(t.state.db, envEmails);
  assert.equal(facts.ready, 1, 'owner has a CLI password');
  assert.equal(facts.noAccount, 1, 'second@ has no account');
  assert.equal(facts.blocked, 1, 'blocked@ has an admin-set password only');
  assert.equal(facts.passwordOnlyAdmins, 2, 'owner (password, no Google) + active admin; the deactivated admin does not count');
  assert.equal(facts.reconcileBlocked, 1);
  assert.doesNotMatch(JSON.stringify(facts), /@/, 'numbers only');
});

test('readinessFactsFromFile: missing file is a fact; the real file opens read-only', async () => {
  assert.deepEqual(await readinessFactsFromFile(path.join(t.dir, 'nope.db'), OWNER_EMAIL), { available: false, reason: 'missing' });
  const file = path.join(t.dir, 'auth.db');
  const facts = await readinessFactsFromFile(file, `${OWNER_EMAIL}, other@example.test`);
  assert.equal(facts.available, true);
  assert.equal(facts.envEmails, 2);
  assert.equal(facts.ready, 1);
  assert.ok(fs.existsSync(file));
  assert.equal((await t.signIn(OWNER_EMAIL, OWNER_PASSWORD)).res.status, 200, 'server DB still usable after the doctor read');
});

test('readinessFactsFromFile: an unreadable database is reported by code, not thrown', async () => {
  const file = path.join(t.dir, 'auth.db');
  const facts = await readinessFactsFromFile(file, OWNER_EMAIL, { open: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } });
  assert.deepEqual(facts, { available: false, reason: 'EACCES' });
  const schemaless = await readinessFactsFromFile(file, OWNER_EMAIL, { open: async () => ({ prepare: () => { throw new Error('no such table: user'); }, close() {} }) });
  assert.deepEqual(schemaless, { available: false, reason: 'unreadable' });
});
