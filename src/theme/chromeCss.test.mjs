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
    assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden|opacity:\s*0\s*(;|$)/);
  }
  assert.match(bodies[0], /left:\s*auto\s*!important/);
  assert.match(bodies[0], /bottom:\s*\d+px\s*!important/);
});

test('the dock is clear of the status bar and the mic is a round accent button', () => {
  const [dockBody] = bodyOf(dock, 'body.ee-shell #command-dock {');
  assert.match(dockBody, /bottom:\s*calc\(var\(--ee-statusbar-h\) \+ 12px\)/);
  const [mic] = bodyOf(dock, 'body.ee-shell #command-dock #gev-voice-button {');
  assert.match(mic, /border-radius:\s*50%/);
  assert.match(mic, /background:[^;]*var\(--ee-accent\)/);
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

test('the top bar shows only the search; the legacy HUD readout is hidden outside cockpit', () => {
  assert.match(chrome, /body\.ee-shell #shell-health,\s*body\.ee-shell #shell-clock\s*\{\s*display:\s*none/);
  assert.match(chrome, /body\.ee-shell:not\(\.cockpit-mode\) #intel-hud \.hud-top-left,/);
  assert.match(chrome, /#intel-hud \.hud-top-right,/);
  assert.match(chrome, /#intel-hud \.hud-left-edge\s*\{\s*display:\s*none/);
});

test('DISPLAY and CONTEXT open beside the rail; CAMERA keeps the right edge', () => {
  assert.match(chrome, /#right-context-rail > #pp-toggles:not\(\.collapsed\)/);
  assert.match(chrome, /#right-context-rail > #global-context-panel:not\(\.collapsed\)/);
  assert.doesNotMatch(chrome, /#right-context-rail > #cctv-panel/);
});

test('the status bar has no background and starts at the left edge', () => {
  const [body] = bodyOf(shell, '#shell-statusbar {');
  assert.match(body, /background:\s*transparent/);
  assert.match(body, /inset:\s*auto 0 0 0/);
});

test('left-edge HUD readout is hidden outside cockpit mode', () => {
  assert.match(chrome, /body\.ee-shell:not\(\.cockpit-mode\) #intel-hud \.hud-left-edge/);
});

test('DISPLAY and CONTEXT get a bounded width so they are not clipped at the right edge', () => {
  const [body] = bodyOf(chrome, '#right-context-rail > #pp-toggles:not(.collapsed)');
  assert.match(body, /width:\s*min\(330px, calc\(100vw - var\(--left-stack-x\) - 16px\)\)\s*!important/);
});

test('the dock location pill is clipped (search lives in the top bar), not removed', () => {
  const bodies = bodyOf(dock, 'body.ee-shell #command-dock > #location-bar {');
  assert.ok(bodies.some((body) => /clip-path:\s*inset\(50%\)/.test(body)));
  assert.ok(bodies.every((body) => !/display:\s*none/.test(body)));
});

test('style menu has an icon and the mic is a ringed gradient with solid rings only', () => {
  assert.match(dock, /#control-panel \.panel-mini-status::before/);
  const [mic] = bodyOf(dock, 'body.ee-shell #command-dock #gev-voice-button {');
  assert.match(mic, /linear-gradient/);
  assert.match(mic, /box-shadow:\s*0 0 0 3px var\(--ee-accent-soft\)/);
});

test('the dock is compact: small mic and pills', () => {
  const [mic] = bodyOf(dock, 'body.ee-shell #command-dock #gev-voice-button {');
  assert.match(mic, /width:\s*34px/);
  assert.match(dock, /min-height:\s*32px/);
});
