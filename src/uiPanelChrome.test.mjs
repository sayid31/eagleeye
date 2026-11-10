// src/uiPanelChrome.test.mjs
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { panelChromeMixin } from './uiPanelChrome.js';

const CLOSE_DELAY_MS = 420;

/** Minimal stand-in for a dock tray: classes, listeners and containment. */
function fakeTray(id) {
  const classes = new Set(['collapsed']);
  const listeners = new Map();
  const tray = {
    id,
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    },
    querySelector: () => null,
    contains: (element) => element === tray,
    matches: () => false,
    fire(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
  };
  return tray;
}

/** A StyleManager stand-in whose setPanelCollapsed records and applies each call. */
function initAutoHover(tray) {
  const host = {
    calls: [],
    setPanelCollapsed(panelId, collapsed, options = {}) {
      this.calls.push({ panelId, collapsed, options });
      if (collapsed) tray.classList.add('collapsed');
      else tray.classList.remove('collapsed');
    },
  };
  panelChromeMixin._initAutoHoverPanel.call(host, tray.id, {
    openDelayMs: 140,
    closeDelayMs: CLOSE_DELAY_MS,
    hoverOpen: false,
  });
  return host;
}

let tray;

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  tray = fakeTray('control-panel');
  globalThis.window = { setTimeout: (...args) => globalThis.setTimeout(...args) };
  globalThis.document = { getElementById: (id) => (id === tray.id ? tray : null), activeElement: null };
});

afterEach(() => {
  mock.timers.reset();
  delete globalThis.window;
  delete globalThis.document;
});

test('the blur from collapsing the tray does not close it again after a reopen', () => {
  const host = initAutoHover(tray);
  host.setPanelCollapsed(tray.id, false, { explicit: true });
  // Unpinned with the pointer away: the tray collapses while a tile holds focus,
  // and the browser blurs that now-hidden tile a frame later.
  host.setPanelCollapsed(tray.id, true, { explicit: true });
  tray.fire('focusout', { relatedTarget: null });
  // Reopened by voice, a share link or code before the close delay ran out.
  host.setPanelCollapsed(tray.id, false, { explicit: true });
  mock.timers.tick(CLOSE_DELAY_MS * 2);

  assert.equal(tray.classList.contains('collapsed'), false, 'the reopened tray stays open');
  assert.equal(host.calls.length, 3, 'no auto-close call after the reopen');
});

test('focus leaving an open tray still closes it after the close delay', () => {
  const host = initAutoHover(tray);
  host.setPanelCollapsed(tray.id, false, { explicit: true });
  tray.fire('focusout', { relatedTarget: null });
  mock.timers.tick(CLOSE_DELAY_MS - 1);
  assert.equal(tray.classList.contains('collapsed'), false, 'still open inside the delay');

  mock.timers.tick(1);
  assert.equal(tray.classList.contains('collapsed'), true);
  assert.deepEqual(host.calls.at(-1), { panelId: tray.id, collapsed: true, options: {} });
});

test('focus moving between controls inside the tray schedules no close', () => {
  const host = initAutoHover(tray);
  host.setPanelCollapsed(tray.id, false, { explicit: true });
  tray.fire('focusout', { relatedTarget: tray });
  mock.timers.tick(CLOSE_DELAY_MS * 2);

  assert.equal(tray.classList.contains('collapsed'), false);
  assert.equal(host.calls.length, 1);
});
