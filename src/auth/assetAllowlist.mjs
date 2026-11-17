// src/auth/assetAllowlist.mjs
/**
 * Static files the server hands out WITHOUT a session (plan/auth/02 §Aset).
 * An allowlist, not "anything with an extension": Vite serves every file under
 * the project root, so a path not listed here (an auth database, a cache
 * file, a stray CSV) is answered 404 by the guard. Pure.
 *
 * Known gap: `/src/` serves the map's source modules, which carry the
 * browser-exposed CESIUM_ION_TOKEN inline (plan/2026-11-17-cesium-ion-token-proxy.md).
 *
 * @module auth/assetAllowlist
 */

/** Vite dev-server internals and module paths. */
export const DEV_ASSET_PREFIXES = Object.freeze([
  '/@vite/', '/@react-refresh', '/@id/', '/node_modules/.vite/', '/src/', '/cesium/',
  // The Vite client imports its env module by file path, not via /@vite/env.
  '/node_modules/vite/dist/client/',
  // Cesium's public ESM build (the library /cesium/ also serves); test:track imports it directly.
  '/node_modules/cesium/Build/Cesium/',
]);
/** Build output served by `vite preview`. */
export const PREVIEW_ASSET_PREFIXES = Object.freeze(['/assets/', '/cesium/']);
/** Named files from `public/` (and the dev-only root stylesheet). */
export const PUBLIC_ASSET_FILES = Object.freeze([
  '/style.css', '/logo.svg', '/pin.svg', '/location.svg', '/visual-presets.svg', '/voice-mic.svg',
]);
const MODEL_FILE = /^\/models\/[A-Za-z0-9_-]+\.glb$/;
/** `/@fs/` (absolute file paths) is needed only when Vite runs from another root (Pinokio). */
const FS_PREFIX = '/@fs/';
// Encoded dot/slash/backslash/NUL: a path a later decoder could turn into a traversal.
const SMUGGLED = /%(2e|2f|5c|00)/i;

/**
 * Whether a raw request path is plain enough to compare against the allowlist.
 * @param {string} pathname
 * @returns {boolean}
 */
export function isPlainPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return false;
  if (pathname.includes('\\') || pathname.includes('//') || SMUGGLED.test(pathname)) return false;
  return !pathname.split('/').some((segment) => segment === '.' || segment === '..');
}

/**
 * @param {string} pathname Raw request path (no query).
 * @param {{mode?: 'dev' | 'preview', allowFsPrefix?: boolean}} [options]
 * @returns {boolean}
 */
export function isPublicAsset(pathname, { mode = 'dev', allowFsPrefix = false } = {}) {
  if (!isPlainPath(pathname)) return false;
  if (PUBLIC_ASSET_FILES.includes(pathname) || MODEL_FILE.test(pathname)) return true;
  const prefixes = mode === 'preview' ? PREVIEW_ASSET_PREFIXES : DEV_ASSET_PREFIXES;
  if (prefixes.some((prefix) => pathname.startsWith(prefix))) return true;
  return mode === 'dev' && allowFsPrefix && pathname.startsWith(FS_PREFIX);
}
