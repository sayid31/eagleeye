// CCTV camera picker listbox — the native `<select>`'s replacement. These
// tests pin the render/sync split (rebuild only on set/order change, cheap
// per-tick sync otherwise) and the pure keyboard-action mapping, all without
// a real DOM. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CCTV_CAMERA_OPTION_CLASS,
  cctvCameraOptionLabel,
  shouldRebuildCctvCameraListbox,
  renderCctvCameraListboxOptions,
  syncCctvCameraListboxState,
  handleCctvListboxKeydown,
} from './cctvCameraListbox.js';

/** Minimal element stand-in — enough for create/append/attr/class/dataset. */
function makeElement(tagName = 'li') {
  const element = {
    tagName,
    id: '',
    className: '',
    textContent: '',
    disabled: false,
    dataset: {},
    attributes: {},
    children: [],
    appendChild(child) { element.children.push(child); return child; },
    setAttribute(name, value) { element.attributes[name] = String(value); },
    getAttribute(name) { return element.attributes[name] ?? null; },
  };
  Object.defineProperty(element, 'innerHTML', {
    get() { return ''; },
    set() { element.children.length = 0; },
  });
  return element;
}

const doc = { createElement: (tagName) => makeElement(tagName) };

const CAMERAS = [
  { id: 'cam-a', city: 'Jakarta', name: 'Sudirman', sourceKind: 'official' },
  { id: 'cam-b', city: 'Bandung', name: 'Dago', sourceKind: 'unofficial-hls' },
  { id: 'cam-c', city: 'Denpasar', name: 'Kuta', sourceKind: 'official' },
];

test('cctvCameraOptionLabel formats unofficial sources with a warning prefix', () => {
  assert.equal(cctvCameraOptionLabel(CAMERAS[0]), 'Jakarta · Sudirman');
  assert.equal(cctvCameraOptionLabel(CAMERAS[1]), '⚠ Bandung · Dago');
  assert.equal(cctvCameraOptionLabel({}), ' · ');
});

test('renderCctvCameraListboxOptions builds one <li role="option"> per camera, in order', () => {
  const listbox = makeElement('ul');
  renderCctvCameraListboxOptions(listbox, CAMERAS, doc);

  assert.equal(listbox.children.length, 3);
  assert.deepEqual(listbox.children.map((li) => li.dataset.cameraId), ['cam-a', 'cam-b', 'cam-c']);
  assert.deepEqual(listbox.children.map((li) => li.id), ['cctv-cam-opt-cam-a', 'cctv-cam-opt-cam-b', 'cctv-cam-opt-cam-c']);
  assert.deepEqual(listbox.children.map((li) => li.getAttribute('role')), ['option', 'option', 'option']);
  assert.deepEqual(listbox.children.map((li) => li.textContent), [
    'Jakarta · Sudirman', '⚠ Bandung · Dago', 'Denpasar · Kuta',
  ]);
  assert.ok(listbox.children.every((li) => li.className === CCTV_CAMERA_OPTION_CLASS));
  // Freshly built items start unselected; syncCctvCameraListboxState owns aria-selected.
  assert.deepEqual(listbox.children.map((li) => li.getAttribute('aria-selected')), ['false', 'false', 'false']);
});

test('renderCctvCameraListboxOptions replaces previous items instead of appending', () => {
  const listbox = makeElement('ul');
  renderCctvCameraListboxOptions(listbox, CAMERAS, doc);
  renderCctvCameraListboxOptions(listbox, CAMERAS.slice(0, 1), doc);

  assert.equal(listbox.children.length, 1);
  assert.equal(listbox.children[0].dataset.cameraId, 'cam-a');
});

test('shouldRebuildCctvCameraListbox is true only on an actual set/order change', () => {
  const listbox = makeElement('ul');
  renderCctvCameraListboxOptions(listbox, CAMERAS, doc);

  assert.equal(shouldRebuildCctvCameraListbox(listbox, CAMERAS), false, 'no-op re-render must not rebuild');
  assert.equal(shouldRebuildCctvCameraListbox(listbox, CAMERAS.slice(0, 2)), true, 'a shrunk list must rebuild');
  assert.equal(
    shouldRebuildCctvCameraListbox(listbox, [CAMERAS[1], CAMERAS[0], CAMERAS[2]]),
    true,
    'a reordered list must rebuild',
  );
  assert.equal(shouldRebuildCctvCameraListbox(null, CAMERAS), true, 'a missing listbox always reports rebuild-needed');
});

test('syncCctvCameraListboxState marks the active item selected and clears the rest', () => {
  const listbox = makeElement('ul');
  const trigger = makeElement('button');
  renderCctvCameraListboxOptions(listbox, CAMERAS, doc);

  syncCctvCameraListboxState({ trigger, listbox }, { cameras: CAMERAS, activeId: 'cam-b', enabled: true });

  assert.deepEqual(listbox.children.map((li) => li.getAttribute('aria-selected')), ['false', 'true', 'false']);
  assert.equal(trigger.textContent, '⚠ Bandung · Dago');
  assert.equal(trigger.dataset.selectedCameraId, 'cam-b');
  assert.equal(trigger.disabled, false);
});

test('syncCctvCameraListboxState shows a placeholder and clears selection when no camera is active', () => {
  const listbox = makeElement('ul');
  const trigger = makeElement('button');
  renderCctvCameraListboxOptions(listbox, CAMERAS, doc);

  syncCctvCameraListboxState({ trigger, listbox }, { cameras: CAMERAS, activeId: '', enabled: true });

  assert.equal(trigger.textContent, 'Select camera');
  assert.equal(trigger.dataset.selectedCameraId, '');
  assert.ok(listbox.children.every((li) => li.getAttribute('aria-selected') === 'false'));
});

test('syncCctvCameraListboxState disables the trigger when the layer is off', () => {
  const trigger = makeElement('button');
  syncCctvCameraListboxState({ trigger }, { cameras: CAMERAS, activeId: 'cam-a', enabled: false });
  assert.equal(trigger.disabled, true);
});

test('syncCctvCameraListboxState disables the trigger when the camera list is empty', () => {
  const trigger = makeElement('button');
  syncCctvCameraListboxState({ trigger }, { cameras: [], activeId: '', enabled: true });
  assert.equal(trigger.disabled, true);
});

test('syncCctvCameraListboxState is inert with no trigger or listbox', () => {
  assert.doesNotThrow(() => syncCctvCameraListboxState({}, { cameras: CAMERAS, activeId: 'cam-a', enabled: true }));
  assert.doesNotThrow(() => syncCctvCameraListboxState(undefined, undefined));
});

const ITEM_IDS = CAMERAS.map((camera) => camera.id);

test('handleCctvListboxKeydown: ArrowDown starts at the first item, then clamps at the last (no wrap)', () => {
  assert.deepEqual(handleCctvListboxKeydown('ArrowDown', { items: ITEM_IDS, highlightedId: null }), { type: 'highlight', id: 'cam-a' });
  assert.deepEqual(handleCctvListboxKeydown('ArrowDown', { items: ITEM_IDS, highlightedId: 'cam-a' }), { type: 'highlight', id: 'cam-b' });
  assert.deepEqual(handleCctvListboxKeydown('ArrowDown', { items: ITEM_IDS, highlightedId: 'cam-c' }), { type: 'highlight', id: 'cam-c' });
});

test('handleCctvListboxKeydown: ArrowUp starts at the last item, then clamps at the first (no wrap)', () => {
  assert.deepEqual(handleCctvListboxKeydown('ArrowUp', { items: ITEM_IDS, highlightedId: null }), { type: 'highlight', id: 'cam-c' });
  assert.deepEqual(handleCctvListboxKeydown('ArrowUp', { items: ITEM_IDS, highlightedId: 'cam-c' }), { type: 'highlight', id: 'cam-b' });
  assert.deepEqual(handleCctvListboxKeydown('ArrowUp', { items: ITEM_IDS, highlightedId: 'cam-a' }), { type: 'highlight', id: 'cam-a' });
});

test('handleCctvListboxKeydown: Home and End jump straight to an end', () => {
  assert.deepEqual(handleCctvListboxKeydown('Home', { items: ITEM_IDS, highlightedId: 'cam-b' }), { type: 'highlight', id: 'cam-a' });
  assert.deepEqual(handleCctvListboxKeydown('End', { items: ITEM_IDS, highlightedId: 'cam-a' }), { type: 'highlight', id: 'cam-c' });
});

test('handleCctvListboxKeydown: Enter and Space commit the highlighted item', () => {
  assert.deepEqual(handleCctvListboxKeydown('Enter', { items: ITEM_IDS, highlightedId: 'cam-b' }), { type: 'commit', id: 'cam-b' });
  assert.deepEqual(handleCctvListboxKeydown(' ', { items: ITEM_IDS, highlightedId: 'cam-c' }), { type: 'commit', id: 'cam-c' });
  assert.equal(handleCctvListboxKeydown('Enter', { items: ITEM_IDS, highlightedId: null }), null, 'nothing highlighted, nothing to commit');
});

test('handleCctvListboxKeydown: Escape always requests close, even with an empty list', () => {
  assert.deepEqual(handleCctvListboxKeydown('Escape', { items: ITEM_IDS, highlightedId: 'cam-a' }), { type: 'close' });
  assert.deepEqual(handleCctvListboxKeydown('Escape', { items: [], highlightedId: null }), { type: 'close' });
});

test('handleCctvListboxKeydown: an empty item list is inert for navigation keys', () => {
  assert.equal(handleCctvListboxKeydown('ArrowDown', { items: [], highlightedId: null }), null);
  assert.equal(handleCctvListboxKeydown('Enter', { items: [], highlightedId: null }), null);
});

test('handleCctvListboxKeydown: unhandled keys return null', () => {
  assert.equal(handleCctvListboxKeydown('a', { items: ITEM_IDS, highlightedId: 'cam-a' }), null);
  assert.equal(handleCctvListboxKeydown('Tab', { items: ITEM_IDS, highlightedId: 'cam-a' }), null);
});
