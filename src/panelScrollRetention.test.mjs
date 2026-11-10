import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { retainPanelScroll } from './panelScrollRetention.js';

/** Minimal scroller: like the DOM, writing scrollTop clamps it to the scroll range. */
function scroller(scrollTop, children = []) {
  const element = {
    maxScroll: Infinity,
    children,
    writes: 0,
    _top: scrollTop,
    get scrollTop() { return this._top; },
    set scrollTop(value) {
      this.writes += 1;
      this._top = Math.max(0, Math.min(value, this.maxScroll));
    },
  };
  return element;
}

test('an inner scroller reset by the measure pass gets its offset back', () => {
  const inner = scroller(240);
  const panel = scroller(0, [inner]);
  const restore = retainPanelScroll([panel]);

  // Measure pass: the allocated height is removed, nothing overflows, and the
  // browser clamps the scroller to 0. The height then comes back.
  inner.maxScroll = 0;
  inner.scrollTop = 0;
  inner.maxScroll = 900;

  restore();
  assert.equal(inner.scrollTop, 240);
});

test('the panel element itself is retained as well as its children', () => {
  const panel = scroller(80, [scroller(0)]);
  const restore = retainPanelScroll([panel]);
  panel.scrollTop = 0;
  restore();
  assert.equal(panel.scrollTop, 80);
});

test('offsets at the top or unchanged are never written', () => {
  const atTop = scroller(0);
  const unchanged = scroller(120);
  const panel = scroller(0, [atTop, unchanged]);
  const restore = retainPanelScroll([panel]);
  restore();
  assert.equal(atTop.writes, 0, 'a scroller at the top is not recorded');
  assert.equal(unchanged.writes, 0, 'a scroller that kept its offset is not rewritten');
});

test('the right-stack pass records scroll before releasing allocations and restores it on every exit', () => {
  const source = readFileSync(new URL('./panelAdaptiveLayoutMixin.js', import.meta.url), 'utf8');
  const start = source.indexOf('  _syncRightPanelAdaptiveLayout() {');
  const end = source.indexOf('\n  },\n', start);
  const body = source.slice(start, end);
  const capture = body.indexOf('retainPanelScroll(');
  // The measure-strip loop (the mobile branch above it also clears the
  // allocation, but returns before any measuring happens).
  const release = body.indexOf(
    "panel.style.removeProperty('--right-panel-allocated-height');",
    body.indexOf('Measure intrinsic content'),
  );
  assert.ok(capture > 0, 'the pass records scroll offsets');
  assert.ok(capture < release, 'offsets are recorded before the allocation is removed');
  const exits = body.slice(release).match(/\breturn;/g) || [];
  const restores = body.slice(release).match(/restoreScroll\(\);/g) || [];
  assert.equal(restores.length, exits.length + 1, 'each early return and the normal end restore scroll');
});
