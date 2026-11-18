import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MENU_LABELS, menuAttributes, nextMenuState, shouldReturnFocus } from './mobileMenu.js';

test('closed menu: aria-expanded=false, label offers to open', () => {
  assert.deepEqual(menuAttributes(false), { expanded: 'false', label: MENU_LABELS.open, headerOpen: 'false' });
});

test('open menu: aria-expanded=true, label offers to close', () => {
  assert.deepEqual(menuAttributes(true), { expanded: 'true', label: MENU_LABELS.close, headerOpen: 'true' });
});

test('toggle flips; Esc, choosing a link and clicking outside only ever close', () => {
  assert.equal(nextMenuState(false, 'toggle'), true);
  assert.equal(nextMenuState(true, 'toggle'), false);
  for (const action of ['escape', 'link', 'outside']) {
    assert.equal(nextMenuState(true, action), false, action);
    assert.equal(nextMenuState(false, action), false, action);
  }
  assert.equal(nextMenuState(true, 'unknown'), true);
});

test('Esc returns focus to the button only while the menu is open and focus is in the header', () => {
  assert.equal(shouldReturnFocus({ open: true, focusInsidePanel: true }), true);
  assert.equal(shouldReturnFocus({ open: true, focusInsidePanel: false }), false);
  assert.equal(shouldReturnFocus({ open: false, focusInsidePanel: true }), false);
});

test('landing.html wires the disclosure button to the nav it controls (aria-controls → id of the panel), closed by default', () => {
  const html = readFileSync(fileURLToPath(new URL('../../landing.html', import.meta.url)), 'utf8');
  const button = html.match(/<button class="ld-menu-btn" type="button" aria-expanded="(\w+)" aria-controls="([^"]+)"/);
  assert.ok(button, 'menu button');
  assert.equal(button[1], 'false');
  assert.match(html, new RegExp(`<div class="ld-panel" id="${button[2]}"`));
});
