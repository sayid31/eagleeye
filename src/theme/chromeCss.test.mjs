import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (name) => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const chrome = strip('./chrome.css');
const dock = strip('./dock.css');
const shell = strip('./shell.css');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

// Trailing " {" marks an exact selector match; otherwise a substring match.
const bodyOf = (css, part) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(([, sel]) => (part.endsWith(' {')
    ? sel.split(',').some((one) => one.trim() === part.slice(0, -2))
    : sel.includes(part)))
  .map(([, , body]) => body);

test('theme.css imports chrome and dock after the shell', () => {
  assert.ok(theme.indexOf("'./shell.css'") < theme.indexOf("'./chrome.css'"));
  assert.match(theme, /@import '\.\/dock\.css'/);
});

test('the top bar has no background or border and does not block the globe', () => {
  const [body] = bodyOf(shell, '#shell-topbar {');
  assert.match(body, /background:\s*transparent/);
  assert.doesNotMatch(body, /border-bottom/);
  assert.match(body, /pointer-events:\s*none/);
});

test('the rail floats vertically centred, translucent, not full height', () => {
  const [body] = bodyOf(shell, '#shell-rail {');
  assert.match(body, /top:\s*50%/);
  assert.match(body, /translateY\(-50%\)/);
  assert.match(body, /background:\s*rgba\([^)]*0\.\d+\)/);
  assert.doesNotMatch(body, /bottom:/);
});

test('collapsed panel launchers leave the layout', () => {
  for (const id of ['data-panel', 'cctv-panel', 'scene-panel', 'pp-toggles', 'global-context-panel']) {
    assert.match(chrome, new RegExp(`#${id}\\.collapsed`), id);
  }
});

test('attribution wins over the legacy bottom-left rules and is never hidden', () => {
  const bodies = bodyOf(chrome, '#cesium-credits');
  assert.ok(bodies.length >= 1);
  for (const body of bodies) {
    assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden|opacity:\s*0\b/);
  }
  assert.match(bodies[0], /left:\s*auto\s*!important/);
  assert.match(bodies[0], /bottom:\s*0\s*!important/);
});

test('the dock is clear of the status bar and the mic is a round accent button', () => {
  const [dockBody] = bodyOf(dock, 'body.ee-shell #command-dock {');
  assert.match(dockBody, /bottom:\s*calc\(var\(--ee-statusbar-h\) \+ 16px\)/);
  const [mic] = bodyOf(dock, 'body.ee-shell #command-dock #gev-voice-button {');
  assert.match(mic, /border-radius:\s*50%/);
  assert.match(mic, /background:\s*var\(--ee-accent\)/);
});

test('dock voice text is clipped, never display:none', () => {
  assert.doesNotMatch(dock, /display:\s*none/);
});

test('no glow and every --ee-* token used is defined', () => {
  assert.doesNotMatch(dock + chrome, /text-shadow:\s*0 0|box-shadow:\s*0 0 [1-9]\d*px/);
  for (const name of new Set([...(dock + chrome).matchAll(/var\((--ee-[\w-]+)/g)].map((m) => m[1]))) {
    assert.match(tokens, new RegExp(`${name}:`), name);
  }
});
