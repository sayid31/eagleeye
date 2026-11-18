// scripts/ui-contrast/tokens.mjs
/**
 * Reads the `:root` and `.dark` blocks of src/ui/tokens.css into two token maps (dark inherits what it does not
 * override). The file is deliberately flat custom properties, so a regex over the two blocks is enough.
 *
 * @module ui-contrast/tokens
 */

const BLOCK = (selector) => new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`);
const DECLARATION = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;

function readBlock(css, selector) {
  const match = BLOCK(selector).exec(css);
  if (!match) throw new Error(`tokens.css has no ${selector} block`);
  return Object.fromEntries([...match[1].matchAll(DECLARATION)].map(([, name, value]) => [name.slice(2), value.trim()]));
}

/**
 * @param {string} css Contents of tokens.css.
 * @returns {{light: Record<string, string>, dark: Record<string, string>}} Token name (no leading `--`) → value.
 */
export function parseTokens(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const light = readBlock(stripped, ':root');
  const dark = { ...light, ...readBlock(stripped, '\\.dark') };
  return { light, dark };
}
