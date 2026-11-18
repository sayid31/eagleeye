// scripts/ui-contrast/pairs.mjs
/**
 * The colour pairs the UI relies on, with the WCAG 2.2 AA threshold each must meet in BOTH themes.
 * Text pairs need 4.5:1; component boundaries, focus rings and meaningful icons need 3:1 (SC 1.4.11);
 * `decor` pairs are only checked for being visible at all (card edges and dividers carry no information alone).
 *
 * A background can be a plain token or a tint (`{tint, alpha, over}`): the token at `alpha` over another token,
 * which is how Badge/Alert/Button render their soft variants. The alphas below match those components.
 *
 * @module ui-contrast/pairs
 */
import { compositeOver, contrastRatio, resolveColor, toHex } from './color.mjs';

export const TEXT_MIN = 4.5;
export const UI_MIN = 3;
export const DECOR_MIN = 1.25;
/** Tint strength of soft variants per theme (`bg-x/10`, `dark:bg-x/20` in components/ui). */
export const TINT_ALPHA = Object.freeze({ light: 0.1, dark: 0.2 });
const SEMANTIC = ['destructive', 'success', 'warning', 'info'];
const SURFACES = ['background', 'card', 'popover'];

const text = (fg, bg) => ({ kind: 'text', min: TEXT_MIN, fg, bg });
const ui = (fg, bg) => ({ kind: 'ui', min: UI_MIN, fg, bg });
const tint = (token, over) => ({ tint: token, over });

/** @type {ReadonlyArray<{kind: 'text'|'ui'|'decor', min: number, fg: string, bg: string | {tint: string, over: string}}>} */
export const REQUIRED_PAIRS = Object.freeze([
  text('foreground', 'background'),
  text('card-foreground', 'card'),
  text('popover-foreground', 'popover'),
  ...['background', 'card', 'popover', 'muted', 'accent', 'secondary', 'sidebar'].map((bg) => text('muted-foreground', bg)),
  text('foreground', 'muted'),
  text('primary-foreground', 'primary'),
  text('secondary-foreground', 'secondary'),
  text('accent-foreground', 'accent'),
  ...['background', 'card', 'muted'].map((bg) => text('link', bg)),
  ...SEMANTIC.flatMap((name) => [
    ...SURFACES.slice(0, 2).map((surface) => text(name, surface)),
    ...SURFACES.slice(0, 2).map((surface) => text(name, tint(name, surface))),
  ]),
  ...SEMANTIC.slice(1).map((name) => text(`${name}-foreground`, name)),
  text('sidebar-foreground', 'sidebar'),
  text('sidebar-accent-foreground', 'sidebar-accent'),
  text('sidebar-primary-foreground', 'sidebar-primary'),
  ...SURFACES.map((bg) => ui('ring', bg)),
  ui('sidebar-ring', 'sidebar'),
  ...[...SURFACES, 'sidebar'].map((bg) => ui('input', bg)),
  ui('primary', 'background'),
  ui('primary', 'card'),
  ...['background', 'card', 'sidebar'].map((bg) => ({ kind: 'decor', min: DECOR_MIN, fg: bg === 'sidebar' ? 'sidebar-border' : 'border', bg })),
]);

function backdropFor(tokens, name) {
  return resolveColor(tokens[name]);
}

/**
 * Resolve a pair's background to linear sRGB under `theme` tokens.
 * @param {Record<string, string>} tokens
 * @param {string | {tint: string, over: string}} bg
 * @param {'light'|'dark'} theme
 * @returns {{linear: {r: number, g: number, b: number}, inGamut: boolean, label: string}}
 */
export function resolveBackground(tokens, bg, theme) {
  if (typeof bg === 'string') return { ...backdropFor(tokens, bg), label: bg };
  const over = backdropFor(tokens, bg.over);
  const base = resolveColor(tokens[bg.tint]);
  const alpha = TINT_ALPHA[theme];
  return { linear: compositeOver(base.linear, alpha, over.linear), inGamut: base.inGamut && over.inGamut, label: `${bg.tint}/${alpha * 100} on ${bg.over}` };
}

/**
 * Evaluate every required pair in one theme.
 * @param {Record<string, string>} tokens
 * @param {'light'|'dark'} theme
 * @returns {Array<{theme: string, kind: string, fg: string, bg: string, ratio: number, min: number, pass: boolean, fgHex: string, bgHex: string, inGamut: boolean, missing?: string}>}
 */
export function evaluatePairs(tokens, theme) {
  return REQUIRED_PAIRS.map((pair) => {
    const bgName = typeof pair.bg === 'string' ? pair.bg : pair.bg.tint;
    const missing = [pair.fg, bgName, typeof pair.bg === 'string' ? null : pair.bg.over].filter((n) => n && !tokens[n]);
    if (missing.length) return { theme, kind: pair.kind, fg: pair.fg, bg: bgName, ratio: 0, min: pair.min, pass: false, fgHex: '-', bgHex: '-', inGamut: false, missing: missing.join(', ') };
    const foreground = resolveColor(tokens[pair.fg]);
    const background = resolveBackground(tokens, pair.bg, theme);
    const ratio = contrastRatio(foreground.linear, background.linear);
    return {
      theme, kind: pair.kind, fg: pair.fg, bg: background.label, ratio, min: pair.min, pass: ratio >= pair.min,
      fgHex: toHex(foreground.linear), bgHex: toHex(background.linear), inGamut: foreground.inGamut && background.inGamut,
    };
  });
}
