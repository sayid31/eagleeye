import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginUrlFor, safeNextPath } from './nextPath.mjs';

test('safeNextPath accepts the app areas, with sub-paths and a query', () => {
  for (const ok of ['/app', '/admin', '/admin/users', '/dev', '/dev/keys', '/account', '/account/password', '/app?welcome=1&trafficDebug=1']) {
    assert.equal(safeNextPath(ok), ok, ok);
  }
});

test('safeNextPath refuses open redirects and smuggling: //, /\\, %2f, %5c, schemes, dot segments, other paths', () => {
  const refused = [
    '//evil.example', '//evil.example/app', '/\\evil.example', '/app\\..\\x', '/app%2f..%2fevil', '/%2fevil.example',
    '/app/%5cevil', 'https://evil.example/app', 'javascript:alert(1)', '/app/../admin', '/app/./x', '/app//x',
    '/login', '/', '/api/me', '/apps', '/administrator', '', null, undefined, 42, '/app?x=%5c', '/app\n', `/app/${'a'.repeat(600)}`,
  ];
  for (const bad of refused) assert.equal(safeNextPath(bad), null, String(bad));
});

test('loginUrlFor carries an accepted next and an optional notice', () => {
  assert.equal(loginUrlFor('/dev'), '/login?next=%2Fdev');
  assert.equal(loginUrlFor('/app', '?welcome=1'), '/login?next=%2Fapp%3Fwelcome%3D1');
  assert.equal(loginUrlFor('/admin/users', '', 'session'), '/login?next=%2Fadmin%2Fusers&notice=session');
  assert.equal(loginUrlFor('/nope'), '/login');
  assert.equal(loginUrlFor('/app', '?x=%5c'), '/login?next=%2Fapp', 'a refused query is dropped, the path kept');
});
