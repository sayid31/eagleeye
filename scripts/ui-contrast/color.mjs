// scripts/ui-contrast/color.mjs
/**
 * Pure colour maths for the UI contrast gate: CSS `oklch()` → sRGB and the
 * WCAG 2.x contrast ratio. No dependencies, so the gate runs anywhere Node does.
 *
 * @module ui-contrast/color
 */

/** Tolerance when deciding whether a linear-sRGB channel is inside the sRGB gamut. */
export const GAMUT_EPSILON = 0.002;

const OKLCH_PATTERN = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/i;
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.abs(c) ** (1 / 2.4) - 0.055);
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fraction = (text) => (text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.parseFloat(text));

/**
 * Parse `oklch(L C H [/ alpha])`; L may be a percentage.
 * @param {string} text
 * @returns {{l: number, c: number, h: number, alpha: number}}
 */
export function parseOklch(text) {
  const match = OKLCH_PATTERN.exec(String(text).trim());
  if (!match) throw new Error(`Not an oklch() colour: ${String(text)}`);
  return { l: fraction(match[1]), c: Number.parseFloat(match[2]), h: Number.parseFloat(match[3]), alpha: match[4] ? fraction(match[4]) : 1 };
}

/**
 * Convert OKLCH to linear sRGB (Björn Ottosson's reference matrices).
 * @param {{l: number, c: number, h: number}} color
 * @returns {{r: number, g: number, b: number}} Unclamped linear channels.
 */
export function oklchToLinearSrgb({ l, c, h }) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    g: -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    b: -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  };
}

/**
 * Whether every linear channel lies in 0..1 (so a browser shows the colour unclipped).
 * @param {{r: number, g: number, b: number}} linear
 * @returns {boolean}
 */
export function inSrgbGamut({ r, g, b }) {
  return [r, g, b].every((value) => value >= -GAMUT_EPSILON && value <= 1 + GAMUT_EPSILON);
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Composite a colour with alpha over an opaque backdrop (linear light, as browsers blend sRGB values in gamma
 * space — close enough for a gate; tokens in this repo are opaque, so this is a safety net only).
 * @param {{r: number, g: number, b: number}} fg Linear sRGB 0..1.
 * @param {number} alpha
 * @param {{r: number, g: number, b: number}} bg Linear sRGB 0..1.
 * @returns {{r: number, g: number, b: number}}
 */
export function compositeOver(fg, alpha, bg) {
  const mix = (f, b) => srgbToLinear(linearToSrgb(clamp01(f)) * alpha + linearToSrgb(clamp01(b)) * (1 - alpha));
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

/**
 * Resolve an `oklch()` string to clamped linear sRGB, blended over `backdrop` when it has alpha.
 * @param {string} text
 * @param {{r: number, g: number, b: number}} [backdrop]
 * @returns {{linear: {r: number, g: number, b: number}, inGamut: boolean}}
 */
export function resolveColor(text, backdrop = { r: 1, g: 1, b: 1 }) {
  const parsed = parseOklch(text);
  const raw = oklchToLinearSrgb(parsed);
  const clipped = { r: clamp01(raw.r), g: clamp01(raw.g), b: clamp01(raw.b) };
  return { linear: parsed.alpha < 1 ? compositeOver(clipped, parsed.alpha, backdrop) : clipped, inGamut: inSrgbGamut(raw) };
}

/**
 * sRGB hex (`#rrggbb`) of a linear colour, for reports.
 * @param {{r: number, g: number, b: number}} linear
 * @returns {string}
 */
export function toHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.round(clamp01(linearToSrgb(v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * WCAG 2.x relative luminance of a linear sRGB colour.
 * @param {{r: number, g: number, b: number}} linear
 * @returns {number}
 */
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio (1..21) between two linear sRGB colours.
 * @param {{r: number, g: number, b: number}} first
 * @param {{r: number, g: number, b: number}} second
 * @returns {number}
 */
export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
