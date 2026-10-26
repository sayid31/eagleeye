// src/config/dotenvPrecedence.mjs
/**
 * Decides which dotenv values may populate process.env at Vite config time.
 *
 * Extracted from `vite.config.js`'s inline loop so the precedence rule is
 * testable on its own (and so the already-over-budget config file does not
 * grow another branch).
 *
 * THE ORDERING THAT MATTERS: Vite's own `loadEnv` defers to a matching
 * `process.env` entry, so an empty shell export makes `loadEnv` itself return
 * `''` for that key — the `.env` value never even reaches the caller. Guarding
 * the assignment (`if (process.env[key] === undefined)`) therefore cannot fix
 * it: by then both sides are `''`. The empty entries have to be removed BEFORE
 * `loadEnv` reads, which is why this module drives the load instead of just
 * filtering its result.
 *
 * @module config/dotenvPrecedence
 */

/**
 * True when a shell/Keychain value should be treated as ABSENT, letting the
 * checkout's dotenv value through.
 *
 * An empty export (`export OPENAI_API_KEY=` still sitting in a shell, or a
 * launcher that exports every known key whether or not it resolved one) is
 * absence, not an override. Treating it as an override is indistinguishable
 * from a missing key to everything downstream: `/api/realtime/token` answered
 * 503 "OPENAI_API_KEY is not set" under `npm run dev` with a perfectly good
 * 164-char key in `.env`. Whitespace counts as empty for the same reason — a
 * key that is all spaces cannot authenticate either.
 *
 * @param {string|undefined} shellValue Value already on process.env, if any.
 * @returns {boolean} Whether the dotenv value should win.
 */
export function shellValueIsAbsent(shellValue) {
  return shellValue === undefined || String(shellValue).trim() === '';
}

/**
 * Deletes empty-valued entries from an env object so a dotenv loader cannot
 * mistake them for deliberate overrides.
 *
 * @param {Record<string, string|undefined>} target Mutated in place.
 * @param {Iterable<string>} keys Names to consider.
 * @returns {string[]} Names deleted — safe to log (names only, never values).
 */
export function pruneEmptyEnvValues(target, keys) {
  const pruned = [];
  for (const key of keys) {
    if (key in target && shellValueIsAbsent(target[key])) {
      delete target[key];
      pruned.push(key);
    }
  }
  return pruned;
}

/**
 * Applies dotenv values onto a target env object without clobbering real
 * shell/Keychain overrides.
 *
 * @param {Record<string, string|undefined>} target Mutated in place (process.env).
 * @param {Record<string, string>} loaded Values from Vite's loadEnv.
 * @returns {string[]} Names actually written, in iteration order.
 */
export function applyDotenvWithoutClobbering(target, loaded) {
  const applied = [];
  for (const [key, val] of Object.entries(loaded || {})) {
    if (shellValueIsAbsent(target[key])) {
      target[key] = val;
      applied.push(key);
    }
  }
  return applied;
}

/**
 * Loads this checkout's dotenv files into `target`, letting only REAL
 * shell/Keychain values override them.
 *
 * Two passes are deliberate and cheap (dotenv files are small): pass one
 * reveals which keys resolved empty — each is either genuinely blank in
 * `.env` or shadowed by an empty shell export, and both deserve the same
 * treatment. Those entries are pruned from `target`, then pass two re-reads
 * the files with nothing left to shadow them. Keys absent from `.env` simply
 * stay absent, which is what every consumer already tests for (`if (!apiKey)`).
 *
 * @param {object} options
 * @param {Record<string, string|undefined>} options.target Usually process.env.
 * @param {(mode: string, dir: string, prefix: string) => Record<string,string>} options.loadEnv Vite's loadEnv.
 * @param {string} options.mode Vite mode.
 * @param {string} options.dir Checkout directory holding the dotenv files.
 * @returns {{applied: string[], pruned: string[]}} Names only — never values.
 */
export function loadCheckoutEnv({ target, loadEnv, mode, dir }) {
  const firstPass = loadEnv(mode, dir, '');
  const emptyKeys = Object.keys(firstPass).filter((key) => shellValueIsAbsent(firstPass[key]));
  const pruned = pruneEmptyEnvValues(target, emptyKeys);
  const loaded = pruned.length ? loadEnv(mode, dir, '') : firstPass;
  return { applied: applyDotenvWithoutClobbering(target, loaded), pruned };
}
