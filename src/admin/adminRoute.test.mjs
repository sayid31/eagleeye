import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipOnReactPages } from './adminRoute.mjs';

test('skipOnReactPages drops the wrapped html transform only for admin.html and login.html', () => {
  const tags = [{ tag: 'script' }];
  const wrapped = skipOnReactPages({ name: 'p', transformIndexHtml: () => tags });
  assert.equal(wrapped.name, 'p');
  assert.equal(wrapped.transformIndexHtml('', { filename: '/repo/admin.html' }), undefined);
  assert.equal(wrapped.transformIndexHtml('', { path: '/admin.html' }), undefined);
  assert.equal(wrapped.transformIndexHtml('', { filename: '/repo/login.html' }), undefined);
  assert.equal(wrapped.transformIndexHtml('', { filename: '/repo/blogin.html' }), tags);
  assert.equal(wrapped.transformIndexHtml('', { filename: '/repo/index.html' }), tags);
});

test('skipOnReactPages returns plugins without an html transform unchanged', () => {
  const plugin = { name: 'plain' };
  assert.equal(skipOnReactPages(plugin), plugin);
});
