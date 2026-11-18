import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_BANNER_DISMISS_KEY, ACCESS_BANNER_TITLE, accessBannerModel, bannerDismissStore, renderAccessBanner } from './accessBanner.js';
import { createFakeDocument } from './__fixtures__/fakeDom.mjs';

test('the banner lists the locked toggles in a fixed order; nothing locked → no banner', () => {
  const model = accessBannerModel(new Map([['premium', 'plan'], ['layers', 'plan']]), null);
  assert.deepEqual(model, { title: ACCESS_BANNER_TITLE, items: ['Data layers', 'Premium map & search'], key: 'layers:o,premium:o' });
  assert.equal(accessBannerModel(new Map(), null), null);
});

test('a kill switch is named as temporary; dismissal hides only the exact dismissed set', () => {
  const locks = new Map([['ai', 'killed']]);
  const model = accessBannerModel(locks, null);
  assert.deepEqual(model.items, ['Voice & AI (dimatikan sementara)']);
  assert.equal(accessBannerModel(locks, model.key), null);
  locks.set('layers', 'revoked');
  assert.notEqual(accessBannerModel(locks, model.key), null, 'a feature locked later brings the banner back');
});

test('dismissal survives in sessionStorage and falls back to memory when storage throws', () => {
  const data = {};
  const store = bannerDismissStore(() => ({ getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } }));
  assert.equal(store.get(), null);
  store.set('ai:o');
  assert.equal(data[ACCESS_BANNER_DISMISS_KEY], 'ai:o');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const blocked = bannerDismissStore(() => { throw new Error('SecurityError'); });
    blocked.set('layers:o');
    assert.equal(blocked.get(), 'layers:o');
  } finally {
    console.warn = warn;
  }
});

test('render: one banner with title, items and a Tutup button that reports the key; null removes it', () => {
  const doc = createFakeDocument();
  const dismissed = [];
  renderAccessBanner(doc, accessBannerModel(new Map([['ai', 'plan']]), null), (key) => dismissed.push(key));
  renderAccessBanner(doc, accessBannerModel(new Map([['ai', 'plan'], ['layers', 'plan']]), null), (key) => dismissed.push(key));
  const banners = [...doc.body.walk()].filter((node) => node.id === 'account-banner');
  assert.equal(banners.length, 1);
  const banner = banners[0];
  assert.equal(banner.getAttribute('role'), 'status');
  assert.equal(banner.children[0].textContent, `${ACCESS_BANNER_TITLE}:`);
  assert.deepEqual(banner.children[1].children.map((li) => li.textContent), ['Data layers', 'Voice & AI']);
  banner.children[2].click();
  assert.deepEqual(dismissed, ['layers:o,ai:o']);
  renderAccessBanner(doc, { text: 'Status akun tidak bisa diperiksa.' }, () => {});
  assert.equal(doc.getElementById('account-banner').children.length, 1, 'a plain status line has no list or button');
  renderAccessBanner(doc, null, () => {});
  assert.equal(doc.getElementById('account-banner'), null);
});
