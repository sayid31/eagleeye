import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectGeocodeProvider } from './geocodeProviderSelect.js';

test('Google only when requested AND the proxy can answer for this account', () => {
  assert.equal(selectGeocodeProvider({ requested: 'google', googleAvailable: true }), 'google');
  assert.equal(selectGeocodeProvider({ requested: ' Google ', googleAvailable: true }), 'google');
});

test('no premium / no key / not requested → keyless Nominatim', () => {
  assert.equal(selectGeocodeProvider({ requested: 'google', googleAvailable: false }), 'nominatim');
  assert.equal(selectGeocodeProvider({ requested: 'google' }), 'nominatim');
  assert.equal(selectGeocodeProvider({ requested: 'nominatim', googleAvailable: true }), 'nominatim');
  assert.equal(selectGeocodeProvider({ requested: undefined, googleAvailable: true }), 'nominatim');
  assert.equal(selectGeocodeProvider({ requested: 'bing', googleAvailable: true }), 'nominatim');
  assert.equal(selectGeocodeProvider(), 'nominatim');
});
