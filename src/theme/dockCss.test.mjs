import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dock = readFileSync(new URL('./dock.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const rules = [...dock.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
const bodyOf = (selector) => rules.filter(({ sel }) => sel.split(',').some((one) => one.trim() === selector)).map(({ body }) => body);

// Properties that move or resize a box, or (transform) re-layer it on the compositor.
const GEOMETRY = /(^|[;{\s])(width|height|min-width|max-width|min-height|max-height|padding[\w-]*|margin[\w-]*|border(-(top|right|bottom|left))?(-width)?|inset|top|right|bottom|left|gap|flex[\w-]*|font|font-size|transform|scale|translate)\s*:/;

test('no dock hover rule changes geometry or adds a transform', () => {
  const hovers = rules.filter(({ sel }) => sel.includes(':hover'));
  assert.ok(hovers.length >= 1, 'the mic hover rule is present');
  for (const { sel, body } of hovers) {
    assert.doesNotMatch(body, GEOMETRY, sel);
  }
});

test('the mic hover brightens the glow instead of scaling the button', () => {
  const [hover] = bodyOf('body.ee-shell #command-dock #gev-voice-button:hover');
  assert.ok(hover, 'mic hover rule exists');
  assert.match(hover, /box-shadow:\s*0 0 \d+px rgba\(40, 202, 255, 0\.\d+\)/);
  const [rest] = bodyOf('body.ee-shell #command-dock #gev-voice-button');
  assert.doesNotMatch(rest, /transition:[^;]*transform/, 'no transform transition to animate on hover');
});

test('an error turns the ring red', () => {
  const [error] = bodyOf("body.ee-shell #command-dock #gev-voice-control[data-status='error'] #gev-voice-button");
  assert.match(error, /linear-gradient\(var\(--ee-bad\), var\(--ee-bad\)\) border-box/);
});

test('the visual-style menu is no longer laid out in the dock', () => {
  // shellController.js moves #control-panel into the icon rail (railStyle.css).
  assert.doesNotMatch(dock, /#control-panel/);
});
