// src/landing/hero-globe.color.js
/**
 * Colour helpers of the hero globe. The canvas paints with the page's own tokens (`--foreground`, `--primary`), which
 * are oklch; the globe resolves them to sRGB triples once per theme and applies its own alpha per draw call.
 *
 * @module landing/hero-globe.color
 */

const CHANNEL_MAX = 255;

/**
 * Parse an `rgb()/rgba()` (comma or space syntax) or `color(srgb …)` string into 0..255 channels.
 * @param {string} text
 * @returns {[number, number, number] | null} null when the string is not an sRGB colour
 */
export function parseRgb(text) {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(text.trim());
  if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])].map((channel) => Math.round(channel * CHANNEL_MAX));
  return null;
}

/** `rgba()` string for channels and an alpha, clamped to 0..1. */
export function withAlpha(rgb, alpha) {
  const clamped = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(clamped.toFixed(3))})`;
}

/** Linear mix of two channel triples: `t` = 0 gives `a`, 1 gives `b`. */
export function mixRgb(a, b, t) {
  return a.map((channel, index) => Math.round(channel + (b[index] - channel) * t));
}

/** Relative luminance (0..1) of sRGB channels; the dark theme paints light ink, so `> 0.5` means a dark page. */
export function luminance(rgb) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / CHANNEL_MAX;
}

/**
 * Resolve a CSS colour (any syntax the browser's canvas accepts, oklch included) to sRGB channels by painting one pixel.
 * @param {CanvasRenderingContext2D} probe context of a 1x1 canvas
 * @param {string} cssColor
 * @param {[number, number, number]} fallback used when the browser rejects the colour
 */
export function resolveCssColor(probe, cssColor, fallback) {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = 'rgb(1, 2, 3)';
  probe.fillStyle = cssColor;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  // An unparseable colour leaves the sentinel above in place; a fully transparent pixel means nothing was painted.
  return a === 0 || (r === 1 && g === 2 && b === 3 && cssColor.trim() !== 'rgb(1, 2, 3)') ? fallback : [r, g, b];
}

/**
 * Palette of the globe for the current theme.
 * @param {CanvasRenderingContext2D} probe
 * @param {CSSStyleDeclaration} style computed style of the page root
 * @returns {{ ink: number[], accent: number[] }} dots / arcs+markers channels
 */
export function readPalette(probe, style) {
  const ink = resolveCssColor(probe, style.getPropertyValue('--foreground'), [128, 128, 128]);
  const primary = resolveCssColor(probe, style.getPropertyValue('--primary'), [90, 110, 220]);
  return { ink, accent: mixRgb(primary, ink, 0.35) };
}
