import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./theme/voiceSettings.css', import.meta.url), 'utf8');

// Regression: the #key-setup dialog is overflow:hidden, so the voice section
// outside a scroller was clipped and its save button unreachable.
test('voice settings section sits inside the scrolling wrapper of the POWER UP dialog', () => {
  const start = html.indexOf('<div class="key-setup-scroll">');
  const end = html.indexOf('<div class="key-setup-footer">', start);
  assert.ok(start > 0 && end > start, 'scroll wrapper present before the footer');
  const inside = html.slice(start, end);
  assert.match(inside, /data-key-setup-rows/);
  assert.match(inside, /data-voice-settings/);
});

test('wrapper scrolls and the key rows no longer scroll on their own', () => {
  assert.match(css, /\.key-setup-scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.key-setup-scroll > \.key-setup-rows\s*\{[^}]*overflow:\s*visible/);
});
