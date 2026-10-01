// Test helper: source-text assertions on a split layer read the parent module
// plus its `<layer>*.js` siblings as one text. `S._x` is normalized back to
// `_x` and a leading `export ` is dropped, so regexes written against the
// original single-file layer keep asserting the same statements.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Modules (layers and gevActions) whose source is split across `<name>*.js` siblings. */
/** Split classes: mixin sibling suffixes in original member order, re-flattened to class-member layout. */
const MIXIN_CLASSES = new Map([['cockpitViewController', ['Controls', 'Frame', 'Hud', 'Brief', 'Signals']],
  ['manager', ['Registration', 'Update', 'Params', 'LifecycleQueries', 'Delegates', 'Subscriptions']]]);

const SPLIT_LAYERS = new Set(['flights', 'militaryFlights', 'rocketLaunches', 'gevActions', 'traffic', 'satellites', 'gevRealtime', 'radio', 'aisLiveVessels', 'militaryAwareness', 'cockpitViewController', 'manager']);

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
  const order = MIXIN_CLASSES.get(base);
  const siblings = readdirSync(dir)
    .filter((f) => new RegExp(`^${base}[A-Z][A-Za-z]*\\.js$`).test(f))
    .sort((a, b) => (order ? order.indexOf(a.slice(base.length, -3)) - order.indexOf(b.slice(base.length, -3)) : 0) || a.localeCompare(b));
  const parts = siblings.map((f) => readFileSync(path.join(dir, f), 'utf8'));
  const text = (order ? [...parts, raw] : [raw, ...parts]).join('\n');
  const flat = text.replace(/\bS\.(_[A-Za-z0-9_$]+)/g, '$1').replace(/^export /gm, '');
  if (!order) return flat;
  // Mixin methods sit at column 0 and end in `},`; restore the class-member shape and
  // drop the module seams so adjacent members read as one class body again.
  return flat
    .replace(/\n\};\n[\s\S]*?const \w+Mixin = \{\n/g, '\n\n')
    .replace(/^((?:async )?[A-Za-z_$][\w$]*\([^\n]*\) \{)$/gm, '  $1')
    .replace(/\n  \},\n/g, '\n  }\n')
    .replace(/\n\n\/\*\* /g, '\n\n  /** ');
}
