// Test helper: source-text assertions on a split layer read the parent module
// plus its `<layer>*.js` siblings as one text. `S._x` is normalized back to
// `_x` and a leading `export ` is dropped, so regexes written against the
// original single-file layer keep asserting the same statements.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Modules (layers and gevActions) whose source is split across `<name>*.js` siblings. */
const SPLIT_LAYERS = new Set(['flights', 'militaryFlights', 'rocketLaunches', 'gevActions']);

/**
 * Return the normalized source text of a layer module.
 * @param {string|URL} file - Path or URL of the layer's parent module.
 * @returns {string} Concatenated source when the layer is split, else the file text.
 */
export function readLayerSourceText(file) {
  const p = file instanceof URL ? fileURLToPath(file) : String(file);
  const base = path.basename(p, '.js');
  const raw = readFileSync(p, 'utf8');
  if (!SPLIT_LAYERS.has(base)) return raw;
  const dir = path.dirname(p);
  const siblings = readdirSync(dir)
    .filter((f) => new RegExp(`^${base}[A-Z][A-Za-z]*\\.js$`).test(f))
    .sort();
  const text = [raw, ...siblings.map((f) => readFileSync(path.join(dir, f), 'utf8'))].join('\n');
  return text.replace(/\bS\.(_[A-Za-z0-9_$]+)/g, '$1').replace(/^export /gm, '');
}
