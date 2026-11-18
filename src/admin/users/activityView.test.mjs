import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_RANGES, rangeStart } from './activityRange.mjs';
import {
  auditActionChoices, auditActionText, auditActorText, auditDetailText, auditQuery, compactIp, describeDevice, hasActivityFilters,
  loginAccountText, loginFailureText, loginLogQuery,
} from './activityView.js';
import { formatDateTime, formatRelative } from './usersFormat.js';

const adminMe = { id: 'A1', role: 'admin' };

test('describeDevice: browser · OS from a user agent, never the raw string', () => {
  assert.equal(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0 Safari/537.36'), 'Chrome · macOS');
  assert.equal(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari · iOS');
  assert.equal(describeDevice('node'), 'Script');
  assert.equal(describeDevice(null), '—');
});

test('compactIp: expanded IPv6 is shortened, IPv4 and blanks pass through', () => {
  assert.equal(compactIp('0000:0000:0000:0000:0000:0000:0000:0000'), '::');
  assert.equal(compactIp('0000:0000:0000:0000:0000:0000:0000:0001'), '::1');
  assert.equal(compactIp('2001:0db8:0000:0000:0001:0000:0000:0001'), '2001:db8::1:0:0:1');
  assert.equal(compactIp('203.0.113.7'), '203.0.113.7');
  assert.equal(compactIp(null), '—');
});

test('login wording: failure reason, deleted and unknown accounts', () => {
  assert.equal(loginFailureText({ reason: 'throttled' }), 'Throttled');
  assert.equal(loginFailureText({ reason: 'new_reason' }), 'new_reason');
  assert.equal(loginFailureText({}), '—');
  assert.equal(loginAccountText({ userId: null }), 'Email not registered');
  assert.equal(loginAccountText({ userId: 'U1', userName: 'Deleted user', userDeleted: true }), 'User terhapus (terhapus)');
  assert.equal(loginAccountText({ userId: 'U1', userName: 'Ani' }), 'Ani');
});

test('audit wording: actor redaction, action text, detail summaries', () => {
  assert.equal(auditActorText({ actorId: 'A1', actorName: 'Admin', actorRole: 'admin' }, adminMe), 'You');
  assert.equal(auditActorText({ actorId: null, actorName: null, actorRole: 'super_admin' }, adminMe), 'Super admin');
  assert.equal(auditActorText({ actorId: null, actorName: null, actorRole: 'admin' }, adminMe), 'Admin lain');
  assert.equal(auditActorText({ actorId: null, actorName: null, actorRole: null }, adminMe), 'System');
  assert.equal(auditActionText('user.delete'), 'Account deleted');
  assert.equal(auditActionText('user.future'), 'user.future');
  assert.equal(auditDetailText('role user'), 'Role: User');
  assert.equal(auditDetailText('fields name,capabilities'), 'Changed: name, feature permissions');
  assert.equal(auditDetailText('user → admin'), 'User → Admin');
  assert.equal(auditDetailText('cli'), 'cli');
  assert.equal(auditDetailText(null), '');
});

test('loginLogQuery / auditQuery: filter state → API params; "all" and unknown values drop out', () => {
  const base = { range: 'all', result: 'all', action: 'all', userId: '', limit: 20, offset: 0 };
  assert.deepEqual(loginLogQuery(base), { range: '', success: '', userId: '', limit: 20, offset: 0 });
  assert.deepEqual(loginLogQuery({ ...base, range: '7d', result: 'false', userId: 'U1', offset: 40 }), { range: '7d', success: 'false', userId: 'U1', limit: 20, offset: 40 });
  assert.equal(loginLogQuery({ ...base, range: 'forever', result: 'maybe' }).range, '');
  assert.equal(loginLogQuery({ ...base, result: 'maybe' }).success, '');
  assert.deepEqual(auditQuery({ ...base, range: '24h', action: 'user.delete', userId: 'U2' }), { range: '24h', action: 'user.delete', targetId: 'U2', limit: 20, offset: 0 });
  assert.equal(auditQuery(base).action, '');
});

test('hasActivityFilters and auditActionChoices', () => {
  assert.equal(hasActivityFilters({ range: 'all', userId: '' }), false);
  assert.equal(hasActivityFilters({ range: '24h', userId: '' }), true);
  assert.equal(hasActivityFilters({ range: 'all', result: 'true', userId: '' }), true);
  assert.equal(hasActivityFilters({ range: 'all', action: 'user.create', userId: '' }), true);
  assert.equal(hasActivityFilters({ range: 'all', userId: 'U1' }), true);
  const all = ['user.create', 'role.set', 'keys.update'];
  assert.deepEqual(auditActionChoices(all, 'admin'), ['user.create']);
  assert.deepEqual(auditActionChoices(all, 'dev'), all);
});

test('rangeStart: window codes → ISO cutoff; unknown or empty → no cutoff', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  assert.deepEqual(ACTIVITY_RANGES, ['24h', '7d', '30d']);
  assert.equal(rangeStart('24h', now), '2026-11-17T12:00:00.000Z');
  assert.equal(rangeStart('7d', now), '2026-11-11T12:00:00.000Z');
  assert.equal(rangeStart('', now), undefined);
  assert.equal(rangeStart('constructor', now), undefined);
});

test('formatRelative: just now, minutes, hours, yesterday, days, then the plain date; formatDateTime for the tooltip', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  const ago = (seconds) => new Date(now - seconds * 1000).toISOString();
  assert.equal(formatRelative(ago(10), now), 'just now');
  assert.equal(formatRelative(ago(5 * 60), now), '5 minutes ago');
  assert.equal(formatRelative(ago(3 * 3600), now), '3 hours ago');
  assert.equal(formatRelative(ago(26 * 3600), now), 'yesterday');
  assert.equal(formatRelative(ago(5 * 86400), now), '5 days ago');
  assert.match(formatRelative(ago(90 * 86400), now), /2026/);
  assert.equal(formatRelative('nope', now), '—');
  assert.equal(formatRelative(null, now), '—');
  assert.equal(formatDateTime('nope'), '—');
  assert.match(formatDateTime('2026-11-17T09:18:10.338Z'), /2026/);
});
