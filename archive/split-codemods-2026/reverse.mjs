// Diff terbalik: setiap deklarasi top-level asli harus identik (setelah S._x -> _x) di modul baru.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { load, patternNames } from './lib.mjs';
const meta = JSON.parse(fs.readFileSync('scripts/tmp-split/meta.json', 'utf8'));
const origSrc = execSync('git show HEAD:src/data/cctv.js', { encoding: 'utf8', maxBuffer: 1e8 });
fs.writeFileSync('/tmp/cctv.orig.js', origSrc);
const O = load('/tmp/cctv.orig.js');
const lets = new Set(meta.lets);
const norm = (t) => t.replace(/\bS\.(_[A-Za-z0-9_]+)/g, (m, n) => lets.has(n) ? n : m)
  .replace(/^export\s+/gm, '').replace(/\s+/g, ' ').trim();
const nameOf = (n) => { const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  if (d.type === 'VariableDeclaration') return d.declarations[0].id.name; if (d.type === 'FunctionDeclaration') return d.id.name; return null; };
const orig = new Map();
for (const n of O.ast.body) { const k = nameOf(n); if (k) orig.set(k, O.src.slice(n.start, n.end)); }
const found = new Map();
for (const f of meta.mods) {
  const M = load('src/data/' + f);
  for (const n of M.ast.body) { const k = nameOf(n); if (k && k !== 'S') found.set(k, { f, text: M.src.slice(n.start, n.end) }); }
}
let bad = 0, same = 0, missing = [];
const extracted = { init: 'initCctvLayer', setParams: 'setCctvLayerParams', destroy: 'destroyCctvLayer' };
for (const [k, t] of orig) {
  if (k === 'cctvLayer' || lets.has(k)) continue;
  const f = found.get(k);
  if (!f) { missing.push(k); continue; }
  const a = norm(t), b = norm(f.text);
  if (a === b) { same++; continue; }
  // let vs S property: handled below
  bad++; console.log('DIFF', k, f.f); console.log('  o:', a.slice(0, 160)); console.log('  n:', b.slice(0, 160));
}
// lets: compare initializer text
const S = load('src/data/cctvState.js');
const sDecl = S.ast.body.find(n => nameOf(n) === 'S');
const props = new Map(sDecl.declarations ? [] : []);
const obj = (sDecl.declaration || sDecl).declarations[0].init;
for (const p of obj.properties) props.set(p.key.name, S.src.slice(p.value.start, p.value.end));
for (const [k, t] of orig) {
  if (!lets.has(k)) continue;
  const m = t.match(/=\s*([\s\S]*?);\s*(\/\/.*)?$/);
  const a = norm(m[1]), b = norm(props.get(k) ?? 'MISSING');
  if (a === b) same++; else { bad++; console.log('LET DIFF', k, a, '|', b); }
}
// cctvLayer: compare after substituting extracted method names back is skipped; compare non-extracted members
console.log('identical decls', same, 'diffs', bad, 'missing', missing.length ? missing.join(',') : 0);
// exports preserved
const oExp = [...origSrc.matchAll(/^export (?:async )?(?:function|const|let) ([A-Za-z0-9_$]+)/gm)].map(m => m[1]);
const pub = load('src/data/cctv.js').src;
const surface = new Set(oExp);

// cctvLayer: reconstruct original text by inlining extracted methods back
const P = load('src/data/cctv.js');
const LL = load('src/data/cctvLayerLifecycle.js');
let layer = P.src.slice(P.ast.body.find(n => nameOf(n) === 'cctvLayer').start, P.ast.body.find(n => nameOf(n) === 'cctvLayer').end);
const oLayer = orig.get('cctvLayer');
const fnText = new Map();
for (const n of LL.ast.body) { const k = nameOf(n); if (k) fnText.set(k, LL.src.slice(n.start, n.end)); }
let checked = 0;
for (const [prop, fn] of Object.entries(extracted)) {
  const body = fnText.get(fn).replace(/^export\s+/, '').replace(new RegExp('^(async\\s+)?function ' + fn), (m, a) => (a || '') + prop);
  layer = layer.replace(new RegExp('\\b' + prop + ': ' + fn + '\\b'), () => body);
  checked++;
}
const la = norm(oLayer), lb = norm(layer);
if (la === lb) { same++; console.log('cctvLayer identical (methods re-inlined)'); }
else { bad++; let i = 0; while (la[i] === lb[i]) i++; console.log('LAYER DIFF at', i, '\n o:', la.slice(i - 60, i + 100), '\n n:', lb.slice(i - 60, i + 100)); }
console.log('TOTAL identical', same, 'diffs', bad);
process.exit(bad ? 1 : 0);
