// Scene picker — placement math plus the open/select/keyboard/disable behavior
// against a minimal DOM stand-in (no jsdom in this repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScenePopupPlacement, createScenePicker, SCENE_OPTION_CLASS } from './scenePicker.js';

function makeEl(tag = 'div') {
  const listeners = {};
  const el = {
    tag, id: '', className: '', textContent: '', hidden: false, disabled: false,
    dataset: {}, attrs: {}, children: [], style: {}, classes: new Set(), focused: 0,
    appendChild(c) { el.children.push(c); c.parent = el; return c; },
    remove() { if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return el.attrs[k] ?? null; },
    removeAttribute(k) { delete el.attrs[k]; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    emit(type, event = {}) { for (const fn of listeners[type] || []) fn(event); },
    focus() { el.focused += 1; },
    scrollIntoView() {},
    getBoundingClientRect: () => ({ left: 40, top: 100, bottom: 130, width: 200 }),
    classList: null,
  };
  el.classList = {
    toggle(name, on) { if (on) el.classes.add(name); else el.classes.delete(name); },
    remove(name) { el.classes.delete(name); },
  };
  Object.defineProperty(el, 'innerHTML', { set() { el.children = []; }, get: () => '' });
  return el;
}

function setup() {
  const doc = makeEl('document');
  doc.body = makeEl('body');
  doc.createElement = makeEl;
  const win = makeEl('window');
  win.innerHeight = 800;
  win.innerWidth = 1280;
  const trigger = makeEl('button');
  trigger.attrs['aria-expanded'] = 'false';
  const listbox = makeEl('ul');
  listbox.hidden = true;
  const picks = [];
  const picker = createScenePicker({ trigger, listbox, onSelect: (id) => picks.push(id), doc, win });
  const scenes = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Bravo' }, { id: 'c', title: 'Charlie' }];
  picker.render(scenes, 'a');
  return { picker, trigger, listbox, doc, win, picks, scenes };
}

test('placement opens downward with room, upward when cramped, and clamps height', () => {
  const down = computeScenePopupPlacement({ left: 10, top: 100, bottom: 130, width: 200 }, 800);
  assert.equal(down.openUpward, false);
  assert.equal(down.top, 130);
  assert.equal(down.maxHeight, 260);
  const up = computeScenePopupPlacement({ left: 10, top: 700, bottom: 730, width: 200 }, 800);
  assert.equal(up.openUpward, true);
  assert.equal(up.bottom, 100);
  assert.equal(up.top, undefined);
  const tiny = computeScenePopupPlacement({ left: 0, top: 10, bottom: 40, width: 50 }, 60);
  assert.equal(tiny.maxHeight, 120);
});

test('placement width is a minimum (trigger width) that may grow up to the viewport edge', () => {
  const roomy = computeScenePopupPlacement({ left: 40, top: 100, bottom: 130, width: 200 }, 800, 1000);
  assert.equal(roomy.minWidth, 200);
  assert.equal(roomy.maxWidth, 952);
  const edge = computeScenePopupPlacement({ left: 40, top: 100, bottom: 130, width: 200 }, 800, 240);
  assert.equal(edge.maxWidth, 200, 'never narrower than the trigger');
  const unknown = computeScenePopupPlacement({ left: 40, top: 100, bottom: 130, width: 200 }, 800);
  assert.ok(unknown.maxWidth >= 200);
});

test('render builds role=option items, marks the selection, and labels the trigger', () => {
  const { listbox, trigger } = setup();
  assert.equal(listbox.children.length, 3);
  assert.equal(listbox.children[0].className, SCENE_OPTION_CLASS);
  assert.deepEqual(listbox.children.map((li) => li.attrs['aria-selected']), ['true', 'false', 'false']);
  assert.equal(trigger.textContent, 'Alpha');
  assert.equal(trigger.dataset.selectedSceneId, 'a');
});

test('popup is portaled onto document.body and removed on destroy', () => {
  const { picker, doc, listbox } = setup();
  assert.equal(doc.body.children.includes(listbox), true);
  picker.destroy();
  assert.equal(doc.body.children.includes(listbox), false);
});

test('click opens, highlights the selection; clicking an option commits once and closes', () => {
  const { trigger, listbox, picks, picker } = setup();
  trigger.emit('click');
  assert.equal(picker.isOpen(), true);
  assert.equal(listbox.hidden, false);
  assert.equal(listbox.children[0].classes.has('highlighted'), true);
  listbox.emit('click', { target: { closest: () => listbox.children[2] } });
  assert.deepEqual(picks, ['c']);
  assert.equal(picker.isOpen(), false);
  assert.equal(listbox.hidden, true);
  assert.equal(trigger.focused, 1);
});

test('re-picking the already selected scene does not fire onSelect', () => {
  const { trigger, listbox, picks } = setup();
  trigger.emit('click');
  listbox.emit('click', { target: { closest: () => listbox.children[0] } });
  assert.deepEqual(picks, []);
});

test('keyboard: ArrowDown opens, arrows move the highlight, Enter commits, Escape closes', () => {
  const { trigger, listbox, picks, picker } = setup();
  const prevented = [];
  const key = (k) => trigger.emit('keydown', { key: k, preventDefault: () => prevented.push(k) });
  key('ArrowDown');
  assert.equal(picker.isOpen(), true);
  key('ArrowDown');
  assert.equal(trigger.attrs['aria-activedescendant'], 'scene-opt-b');
  key('Enter');
  assert.deepEqual(picks, ['b']);
  key('ArrowDown');
  key('Escape');
  assert.equal(picker.isOpen(), false);
  assert.equal(listbox.hidden, true);
  assert.equal(trigger.attrs['aria-activedescendant'], undefined);
});

test('outside pointerdown closes; pointerdown on the trigger or popup does not', () => {
  const { trigger, doc, picker } = setup();
  trigger.emit('click');
  doc.emit('pointerdown', { target: { closest: () => ({}) } });
  assert.equal(picker.isOpen(), true);
  doc.emit('pointerdown', { target: { closest: () => null } });
  assert.equal(picker.isOpen(), false);
});

test('a running scene disables the trigger, closes the popup, and blocks opening', () => {
  const { trigger, picker } = setup();
  trigger.emit('click');
  picker.setDisabled(true);
  assert.equal(trigger.disabled, true);
  assert.equal(picker.isOpen(), false);
  picker.open();
  assert.equal(picker.isOpen(), false);
  picker.setDisabled(false);
  picker.open();
  assert.equal(picker.isOpen(), true);
});

test('empty scene list shows a placeholder and cannot open', () => {
  const { picker, trigger } = setup();
  picker.render([], null);
  assert.equal(trigger.textContent, 'No scenes');
  picker.open();
  assert.equal(picker.isOpen(), false);
});

test('re-render while open closes the popup so stale options never linger', () => {
  const { picker, scenes } = setup();
  picker.open();
  picker.render(scenes, 'b');
  assert.equal(picker.isOpen(), false);
});
