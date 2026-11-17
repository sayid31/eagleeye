import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAppQueryParam, isShareStateHash, legacyAppRedirect } from './legacyShareRedirect.js';

// Shape written by ShareLinkManager._buildParams() in src/sharelink.js (v2 links).
const V2_SHARE_HASH = '#v=2&lat=-6.2088&lon=106.8456&alt=1245&heading=12&pitch=-35&roll=0&style=nvg'
  + '&bloom=0&sharpen=1&bi=40&bv=2&si=49&hud=tactical&hv=1&dm=OFF&dd=50&da=elastic&kf=16&ko=3&cr=0'
  + '&ca=samping&sc=1&scf=8&sci=100&l=flights.ships&at=1763350000000';
// A pre-v2 link: only the fields the first generator wrote.
const V1_SHARE_HASH = '#lat=37.7749&lon=-122.4194&alt=800&heading=0&pitch=-35&roll=0&style=normal';

test('real share-link hashes (v2 and pre-v2) are detected', () => {
  assert.equal(isShareStateHash(V2_SHARE_HASH), true);
  assert.equal(isShareStateHash(V1_SHARE_HASH), true);
  assert.equal(isShareStateHash(V2_SHARE_HASH.slice(1)), true, 'without the leading #');
  assert.equal(isShareStateHash('#lat=0&lon=0'), true, 'zero is a valid coordinate');
});

test('empty hashes, in-page anchors and incomplete or invalid share state are not share links', () => {
  for (const hash of ['', '#', '#top', '#sumber', '#konten', '#lat', '#lat=1', '#lon=2',
    '#lat=abc&lon=2', '#lat=1&lon=', '#lat=Infinity&lon=2', '#lat=1&lon=NaN', '#v=2&style=nvg', undefined, null]) {
    assert.equal(isShareStateHash(hash), false, String(hash));
  }
});

test('the map boot query params are recognised; unrelated ones are not', () => {
  assert.equal(hasAppQueryParam('?welcome=0'), true);
  assert.equal(hasAppQueryParam('?welcome=1'), true);
  assert.equal(hasAppQueryParam('?trafficDebug=1'), true);
  assert.equal(hasAppQueryParam('?utm_source=x&trafficDebug=1'), true);
  assert.equal(hasAppQueryParam(''), false);
  assert.equal(hasAppQueryParam('?utm_source=newsletter'), false);
  assert.equal(hasAppQueryParam('?Welcome=1'), false, 'param names are case-sensitive, like the map reads them');
});

test('legacy share link → /app with query and hash forwarded unchanged', () => {
  assert.equal(legacyAppRedirect({ search: '', hash: V2_SHARE_HASH }), `/app${V2_SHARE_HASH}`);
  assert.equal(legacyAppRedirect({ search: '?welcome=0', hash: V1_SHARE_HASH }), `/app?welcome=0${V1_SHARE_HASH}`);
  assert.equal(legacyAppRedirect({ search: '?trafficDebug=1', hash: '' }), '/app?trafficDebug=1');
  assert.equal(legacyAppRedirect({ search: '?welcome=1', hash: '#top' }), '/app?welcome=1#top');
});

test('a normal landing visit never redirects', () => {
  assert.equal(legacyAppRedirect({ search: '', hash: '' }), null);
  assert.equal(legacyAppRedirect({ search: '', hash: '#top' }), null);
  assert.equal(legacyAppRedirect({ search: '', hash: '#prinsip' }), null);
  assert.equal(legacyAppRedirect({ search: '?utm_source=x', hash: '#sumber' }), null);
  assert.equal(legacyAppRedirect({}), null);
  assert.equal(legacyAppRedirect(), null);
});
