import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LOCATION_SEARCH_ARRIVED_EVENT, mountShellSearch } from './shellSearch.js';

// test-only: Node has no KeyboardEvent; the module only needs `type` and `key`.
globalThis.KeyboardEvent ??= class KeyboardEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.key = init.key;
  }
};

/** Minimal text input: a value, a blur counter, and real event dispatch. */
class FakeInput extends EventTarget {
  value = '';
  blurCount = 0;
  blur() { this.blurCount += 1; }
}

function mount() {
  const input = new FakeInput();
  const legacy = new FakeInput();
  const eventTarget = new EventTarget();
  const submissions = [];
  legacy.addEventListener('keydown', (event) => submissions.push({ key: event.key, query: legacy.value }));
  const dispose = mountShellSearch({ input, legacy, eventTarget });
  const press = (key) => input.dispatchEvent(Object.assign(new Event('keydown'), { key }));
  const arrive = () => eventTarget.dispatchEvent(new Event(LOCATION_SEARCH_ARRIVED_EVENT));
  return { input, legacy, submissions, dispose, press, arrive };
}

test('Enter hands the trimmed query to the legacy search and keeps it visible during the flight', () => {
  const { input, submissions, press } = mount();
  input.value = '  yogyakarta ';
  press('Enter');
  assert.deepEqual(submissions, [{ key: 'Enter', query: 'yogyakarta' }]);
  assert.equal(input.value, '  yogyakarta ', 'the query stays while the camera travels');
  assert.equal(input.blurCount, 1);
});

test('the query is cleared once the camera lands on the searched place', () => {
  const { input, press, arrive } = mount();
  input.value = 'yogyakarta';
  press('Enter');
  arrive();
  assert.equal(input.value, '');
});

test('arrival does not wipe text the user typed while the camera was travelling', () => {
  const { input, press, arrive } = mount();
  input.value = 'yogyakarta';
  press('Enter');
  input.value = 'sura';
  arrive();
  assert.equal(input.value, 'sura');
});

test('an arrival that this box did not ask for leaves its text alone', () => {
  const { input, arrive } = mount();
  input.value = 'draft';
  arrive();
  assert.equal(input.value, 'draft');
});

test('other keys and an empty query submit nothing', () => {
  const { input, submissions, press } = mount();
  input.value = 'yogyakarta';
  press('a');
  input.value = '   ';
  press('Enter');
  assert.deepEqual(submissions, []);
  assert.equal(input.blurCount, 0);
});

test('a missing legacy search leaves the box inert instead of throwing', () => {
  const input = new FakeInput();
  mountShellSearch({ input, legacy: null, eventTarget: new EventTarget() });
  input.value = 'yogyakarta';
  input.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter' }));
  assert.equal(input.value, 'yogyakarta');
  assert.equal(input.blurCount, 0);
});

test('the disposer detaches both the key handler and the arrival listener', () => {
  const { input, submissions, dispose, press, arrive } = mount();
  input.value = 'yogyakarta';
  press('Enter');
  dispose();
  arrive();
  assert.equal(input.value, 'yogyakarta', 'arrival is no longer observed');
  press('Enter');
  assert.equal(submissions.length, 1, 'Enter is no longer proxied');
});

test('the location search announces arrival with the event this box listens for', () => {
  const navMixin = fs.readFileSync(new URL('../navigationLocationMixin.js', import.meta.url), 'utf8');
  assert.match(
    navMixin,
    new RegExp(`onComplete: \\(\\) => window\\.dispatchEvent\\(new CustomEvent\\('${LOCATION_SEARCH_ARRIVED_EVENT}'\\)\\)`),
  );
});
