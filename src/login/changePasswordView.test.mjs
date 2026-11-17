import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePasswordProblem } from './changePasswordView.js';

test('changePasswordProblem: required current, matching confirm, different, length bounds', () => {
  const ok = { currentPassword: 'old-password-123', newPassword: 'new-password-123', confirm: 'new-password-123' };
  assert.equal(changePasswordProblem(ok), null);
  assert.equal(changePasswordProblem({ ...ok, currentPassword: '' }), 'Isi password saat ini.');
  assert.equal(changePasswordProblem({ ...ok, confirm: 'other' }), 'Kedua password baru tidak sama.');
  assert.equal(changePasswordProblem({ ...ok, newPassword: ok.currentPassword, confirm: ok.currentPassword }), 'Password baru harus berbeda.');
  assert.match(changePasswordProblem({ ...ok, newPassword: 'short', confirm: 'short' }), /minimal 12/);
  assert.match(changePasswordProblem({ ...ok, newPassword: 'x'.repeat(129), confirm: 'x'.repeat(129) }), /maksimal 128/);
});
