import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./accountChrome.css', import.meta.url)), 'utf8');
const phone = css.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n\}\n/)?.[1] ?? '';

test('on phones the banner is a full-width strip below the header row, not a centred popover', () => {
  assert.ok(phone, '480px media block exists');
  assert.match(phone, /#account-banner \{[^}]*top: calc\(env\(safe-area-inset-top, 0px\) \+ 92px\)/);
  assert.match(phone, /left: max\(8px, env\(safe-area-inset-left, 0px\)\)/);
  assert.match(phone, /right: max\(8px, env\(safe-area-inset-right, 0px\)\)/);
  assert.match(phone, /transform: none/);
  assert.match(phone, /max-width: none/);
});

test('the dismiss button keeps a target of at least 24x24 CSS px and the strip wraps long text', () => {
  assert.match(css, /\.account-banner-close \{[^}]*min-width: 24px;[^}]*min-height: 28px/);
  assert.match(phone, /overflow-wrap: anywhere/);
});

test('the banner stays dark (the map has no light theme): no theme-dependent selectors', () => {
  assert.doesNotMatch(css, /prefers-color-scheme|\.dark\b|data-theme/);
});
