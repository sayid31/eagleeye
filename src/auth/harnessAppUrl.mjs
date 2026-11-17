// src/auth/harnessAppUrl.mjs
/**
 * Test-harness helper: the map moved from `/` to `/app`, but
 * scripts/track-regression.mjs (4k lines, deliberately untouched) navigates to
 * its `--url` as given. scripts/authCheckout.mjs rewrites the argv before that
 * script reads it.
 *
 * @module auth/harnessAppUrl
 */

/** The map is served at /app; the harness defaults to it. */
export const HARNESS_APP_PATH = '/app';

/**
 * `--url http://host:port` (or none, = http://localhost:4173) → the same origin + `/app`.
 * A `--url` that already names a path is left alone.
 * @param {string[]} argv process.argv
 * @returns {string[]} A new argv.
 */
export function applyHarnessAppPath(argv) {
  const at = argv.indexOf('--url');
  const given = at >= 0 ? argv[at + 1] : undefined;
  const url = new URL(given ?? 'http://localhost:4173');
  if (url.pathname !== '/') return [...argv];
  url.pathname = HARNESS_APP_PATH;
  const next = [...argv];
  if (at >= 0) next[at + 1] = url.toString();
  else next.push('--url', url.toString());
  return next;
}
