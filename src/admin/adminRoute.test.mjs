import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminPageRewrite, skipOnAdminPage } from './adminRoute.mjs';

test('admin page navigations are rewritten to admin.html', () => {
  assert.equal(adminPageRewrite('/admin'), '/admin.html');
  assert.equal(adminPageRewrite('/admin/'), '/admin.html');
  assert.equal(adminPageRewrite('/admin/server-log'), '/admin.html');
  assert.equal(adminPageRewrite('/admin/ai/persona?x=1'), '/admin.html?x=1');
});

test('non-admin, asset and API requests are left alone', () => {
  assert.equal(adminPageRewrite('/'), null);
  assert.equal(adminPageRewrite('/administrator'), null);
  assert.equal(adminPageRewrite('/admin.html'), null);
  assert.equal(adminPageRewrite('/admin/main.css'), null);
  assert.equal(adminPageRewrite('/api/admin/session'), null);
  assert.equal(adminPageRewrite(undefined), null);
});

test('skipOnAdminPage drops the wrapped html transform only for admin.html', () => {
  const tags = [{ tag: 'script' }];
  const wrapped = skipOnAdminPage({ name: 'p', transformIndexHtml: () => tags });
  assert.equal(wrapped.name, 'p');
  assert.equal(wrapped.transformIndexHtml('', { filename: '/repo/admin.html' }), undefined);
  assert.equal(wrapped.transformIndexHtml('', { path: '/admin.html' }), undefined);
  assert.equal(wrapped.transformIndexHtml('', { filename: '/repo/index.html' }), tags);
});

test('skipOnAdminPage returns plugins without an html transform unchanged', () => {
  const plugin = { name: 'plain' };
  assert.equal(skipOnAdminPage(plugin), plugin);
});
