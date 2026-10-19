import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_STACKS } from '../mapStackController.js';
import { mapTone } from './mapTone.js';

test('only the bright OSM street map flips the chrome text dark', () => {
  assert.equal(mapTone('osm'), 'light');
  for (const id of ['photoreal', 'esri-imagery', 'esri-dark-gray', 'bing-aerial', 'bing-labels', undefined, null]) {
    assert.equal(mapTone(id), 'dark', String(id));
  }
});

test('every known stack resolves to a tone', () => {
  for (const stack of MAP_STACKS) assert.match(mapTone(stack.id), /^(light|dark)$/);
});
