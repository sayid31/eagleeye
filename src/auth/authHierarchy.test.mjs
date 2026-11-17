import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USER_ACTIONS, authorizeUserAction } from './authHierarchy.mjs';

const admin = { id: 'a1', role: 'admin' };
const superAdmin = { id: 's1', role: 'super_admin' };
const user = (id = 'u1') => ({ id, role: 'user' });
const otherAdmin = { id: 'a2', role: 'admin' };
const otherSuper = { id: 's2', role: 'super_admin' };

const verdict = (actor, target, action) => {
  const result = authorizeUserAction(actor, target, action);
  return result.ok ? 'ok' : result.code;
};

// Every cell of plan/auth/01 §Hierarki, row by row (create is checked separately).
const TABLE = {
  view: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'ok' },
  deactivate: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'CANNOT_ACT_ON_SELF' },
  activate: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'CANNOT_ACT_ON_SELF' },
  delete: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'CANNOT_ACT_ON_SELF' },
  resetPassword: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'CANNOT_ACT_ON_SELF' },
  setCapabilities: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'CANNOT_ACT_ON_SELF' },
  updateName: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'ok' },
  updateEmail: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'CANNOT_ACT_ON_SELF' },
  setRole: { 'admin→user': 'TARGET_FORBIDDEN', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'CANNOT_ACT_ON_SELF' },
  revokeSessions: { 'admin→user': 'ok', 'admin→admin': 'TARGET_FORBIDDEN', 'admin→super': 'TARGET_IS_SUPER_ADMIN', 'super→user': 'ok', 'super→admin': 'ok', 'super→super': 'TARGET_IS_SUPER_ADMIN', self: 'ok' },
};

const PAIRS = {
  'admin→user': [admin, user()],
  'admin→admin': [admin, otherAdmin],
  'admin→super': [admin, otherSuper],
  'super→user': [superAdmin, user()],
  'super→admin': [superAdmin, otherAdmin],
  'super→super': [superAdmin, otherSuper],
};

for (const [action, cells] of Object.entries(TABLE)) {
  test(`hierarchy row "${action}" matches plan/auth/01 cell by cell`, () => {
    for (const [pair, expected] of Object.entries(cells)) {
      if (pair === 'self') {
        assert.equal(verdict(admin, admin, action), expected, `${action} admin self`);
        assert.equal(verdict(superAdmin, superAdmin, action), expected, `${action} super self`);
        continue;
      }
      const [actor, target] = PAIRS[pair];
      assert.equal(verdict(actor, target, action), expected, `${action} ${pair}`);
    }
  });
}

test('every non-create action is covered by the table', () => {
  assert.deepEqual(USER_ACTIONS.filter((action) => action !== 'create').sort(), Object.keys(TABLE).sort());
});

test('view self: a super_admin sees its own row, an admin does not (admins never see admins)', () => {
  assert.equal(verdict(superAdmin, superAdmin, 'view'), 'ok');
  assert.equal(verdict(admin, admin, 'view'), 'TARGET_FORBIDDEN');
});

test('create: admin makes users only; super_admin users and admins; super_admin never; junk roles refused', () => {
  assert.equal(verdict(admin, { role: 'user' }, 'create'), 'ok');
  assert.equal(verdict(admin, {}, 'create'), 'ok', 'no role = user');
  assert.equal(verdict(admin, { role: 'admin' }, 'create'), 'ROLE_NOT_ASSIGNABLE');
  assert.equal(verdict(admin, { role: 'super_admin' }, 'create'), 'ROLE_NOT_ASSIGNABLE');
  assert.equal(verdict(superAdmin, { role: 'user' }, 'create'), 'ok');
  assert.equal(verdict(superAdmin, { role: 'admin' }, 'create'), 'ok');
  assert.equal(verdict(superAdmin, { role: 'super_admin' }, 'create'), 'ROLE_NOT_ASSIGNABLE');
  assert.equal(verdict(superAdmin, { role: 'super-admin' }, 'create'), 'ROLE_NOT_ASSIGNABLE');
});

test('a user actor, no actor and unknown actions are refused', () => {
  assert.equal(verdict(user('x'), user(), 'view'), 'ADMIN_REQUIRED');
  assert.equal(verdict(user('x'), { role: 'user' }, 'create'), 'ADMIN_REQUIRED');
  assert.equal(verdict(null, user(), 'view'), 'ADMIN_REQUIRED');
  assert.equal(verdict(superAdmin, user(), 'impersonate'), 'UNKNOWN_ACTION');
});
