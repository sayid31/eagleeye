import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./railStyle.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');

const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
const bodyOf = (selector) => rules
  .filter(({ sel }) => sel.split(',').some((one) => one.trim() === selector))
  .map(({ body }) => body)
  .join('\n');

test('theme.css loads the rail style picker after the dock layer', () => {
  assert.ok(theme.indexOf("@import './railStyle.css'") > theme.indexOf("@import './dock.css'"));
});

test('the picker leaves the fixed dock position style.css gives #control-panel', () => {
  assert.match(styleCss, /#control-panel \{\s*position: fixed;/, 'if style.css stops fixing it, this override can go');
  const picker = bodyOf('body.ee-shell #shell-rail #control-panel');
  assert.match(picker, /position:\s*static/);
  assert.match(picker, /transform:\s*none/);
});

test('the tray is hidden while closed and flies out beside the rail while open', () => {
  assert.match(bodyOf('body.ee-shell #shell-rail #control-panel.collapsed .dock-popover-content'), /display:\s*none/);
  const open = bodyOf('body.ee-shell #shell-rail #control-panel:not(.collapsed) .dock-popover-content');
  assert.match(open, /position:\s*absolute/);
  assert.match(open, /left:\s*calc\(100% \+ 12px\)/);
  assert.match(open, /bottom:\s*0/);
  // The inner wrapper must not become the containing block, or the tray would
  // open inside the 40px button instead of beside the rail.
  assert.match(bodyOf('body.ee-shell #shell-rail #control-panel .panel-inner'), /position:\s*static/);
});

test('the open tray sits above the left accordion', () => {
  const leftStackZ = Number(/#left-panel-stack \{[^}]*z-index:\s*(\d+)/.exec(styleCss)?.[1]);
  const openRailZ = Number(/z-index:\s*(\d+)/.exec(bodyOf('body.ee-shell #shell-rail:has(#control-panel:not(.collapsed))'))?.[1]);
  assert.ok(Number.isFinite(leftStackZ), 'left accordion z-index found in style.css');
  assert.ok(openRailZ > leftStackZ, `rail ${openRailZ} must be above the left accordion ${leftStackZ}`);
});

test('titles and the active-style readout are clipped for assistive tech, never removed', () => {
  const clipped = bodyOf('body.ee-shell #shell-rail #control-panel .panel-mini-status');
  assert.match(clipped, /clip-path:\s*inset\(50%\)/);
  assert.doesNotMatch(clipped, /display:\s*none/);
  assert.match(bodyOf('body.ee-shell #shell-rail #control-panel-toggle > *'), /clip-path:\s*inset\(50%\)/);
});

test('the rail button matches its neighbours: a palette glyph on a 40px rail-button box', () => {
  assert.match(bodyOf('body.ee-shell #shell-rail #control-panel-toggle::before'), /content:\s*'palette'/);
  const button = bodyOf('body.ee-shell #shell-rail #control-panel-toggle');
  assert.match(button, /width:\s*40px/);
  assert.match(button, /height:\s*40px/);
});
