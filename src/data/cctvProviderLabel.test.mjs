import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cctvProviderDisplay } from './cctvProviderLabel.js';

test('a government-portal provider shows the operator and a translated location note', () => {
  assert.equal(cctvProviderDisplay('UNOFFICIAL — ATCS Kota Malang (Internal Demo Only, APPROX. LOCATION)'), 'ATCS Kota Malang (lokasi perkiraan)');
  assert.equal(cctvProviderDisplay('UNOFFICIAL — CCTV Kabupaten Nganjuk (Internal Demo Only, SOURCE-PUBLISHED LOCATION)'), 'CCTV Kabupaten Nganjuk (lokasi dari sumber)');
  assert.equal(cctvProviderDisplay('UNOFFICIAL — Bina Marga CCTV Tol portal / toll operator (Internal Demo Only, APPROXIMATE LOCATION)'),
    'Bina Marga CCTV Tol portal / toll operator (lokasi perkiraan)');
  assert.equal(cctvProviderDisplay('UNOFFICIAL — Jakarta Smart City (Internal Demo Only)'), 'Jakarta Smart City');
});

test('every other provider string passes through unchanged', () => {
  assert.equal(cctvProviderDisplay('City of Austin, TX'), 'City of Austin, TX');
  assert.equal(cctvProviderDisplay(undefined), '');
  assert.equal(cctvProviderDisplay('  TfL JamCams  '), 'TfL JamCams');
});

test('every Indonesia pack provider in config loses its unofficial marking', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));
  const rows = Array.isArray(raw) ? raw : (raw.sources ?? raw.cameras ?? []);
  assert.ok(rows.length > 0);
  for (const provider of new Set(rows.map((row) => row.provider))) {
    assert.doesNotMatch(cctvProviderDisplay(provider), /UNOFFICIAL|Internal Demo/i, provider);
  }
});
