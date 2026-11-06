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
  assert.ok(hovers.length >= 2, 'mic and style-pill hover rules are present');
  for (const { sel, body } of hovers) {
    assert.doesNotMatch(body, GEOMETRY, sel);
  }
});

test('the mic hover widens the halo instead of scaling the button', () => {
  const [hover] = bodyOf('body.ee-shell #command-dock #gev-voice-button:hover');
  assert.ok(hover, 'mic hover rule exists');
  assert.match(hover, /box-shadow:\s*0 0 0 \d+px var\(--ee-accent-soft\)/);
  const [rest] = bodyOf('body.ee-shell #command-dock #gev-voice-button');
  assert.doesNotMatch(rest, /transition:[^;]*transform/, 'no transform transition to animate on hover');
});

test('the hovered mic halo stays inside the gap to the style pill', () => {
  const [hover] = bodyOf('body.ee-shell #command-dock #gev-voice-button:hover');
  const [dockBody] = bodyOf('body.ee-shell #command-dock');
  const spread = Number(hover.match(/box-shadow:\s*0 0 0 (\d+)px/)[1]);
  const gap = Number(dockBody.match(/gap:\s*(\d+)px/)[1]);
  assert.ok(spread < gap, `halo ${spread}px must be smaller than the ${gap}px dock gap`);
});
