// Sementara: verifier generik (diff terbalik + free vars + siklus/TDZ). Usage: node verify.mjs <cfg>
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { load, eachRef, patternNames } from './lib.mjs';
const meta = JSON.parse(fs.readFileSync(`scripts/tmp-split/meta.${process.argv[2]}.json`, 'utf8'));
const dir = path.dirname(meta.file);
const lets = new Set(meta.lets);
const origSrc = execSync(`git show HEAD:${meta.file}`, { encoding: 'utf8', maxBuffer: 1e8 });
fs.writeFileSync('/tmp/verify.orig.js', origSrc);
const O = load('/tmp/verify.orig.js');
const norm = (t) => t.replace(/\bS\.(_[A-Za-z0-9_$]+)/g, (m, n) => lets.has(n) ? n : m)
  .replace(/\b(_[A-Za-z0-9_$]+): \1\b/g, '$1')
  .replace(/^export\s+/gm, '').replace(/\s+/g, ' ').trim();
const nameOf = (n) => { const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  if (d.type === 'VariableDeclaration') return d.declarations[0].id.name; if (d.type === 'FunctionDeclaration') return d.id.name; return null; };
const orig = new Map();
for (const n of O.ast.body) { const k = nameOf(n); if (k) orig.set(k, O.src.slice(n.start, n.end)); }
const found = new Map(); const mods = new Map();
for (const f of meta.mods) {
  const M = load(path.join(dir, f)); mods.set(f, M);
  for (const n of M.ast.body) { const k = nameOf(n); if (k && k !== 'S') { if (found.has(k)) console.log('DUPLICATE decl', k, found.get(k).f, f); found.set(k, { f, text: M.src.slice(n.start, n.end) }); } }
}
let bad = 0, same = 0; const missing = [];
const exFns = new Set(meta.extracted.map(e => e.fn));
for (const [k, t] of orig) {
  if (k === meta.layer || lets.has(k)) continue;
  const f = found.get(k);
  if (!f) { missing.push(k); continue; }
  if (norm(t) === norm(f.text)) same++; else { bad++; console.log('DIFF', k, f.f); }
}
// lets vs S initializers
const S = mods.get(meta.state);
const sDecl = S ? S.ast.body.map(n => n.type === 'ExportNamedDeclaration' ? n.declaration : n).find(n => n && n.type === 'VariableDeclaration' && n.declarations[0].id.name === 'S') : null;
const props = new Map();
if (sDecl) for (const p of sDecl.declarations[0].init.properties) props.set(p.key.name, S.src.slice(p.value.start, p.value.end));
for (const [k, t] of orig) {
  if (!lets.has(k)) continue;
  const m = t.match(/^(?:export\s+)?let\s+[\w$]+\s*(?:=\s*([\s\S]*?))?;\s*(\/\/.*)?$/);
  const a = norm(m[1] ?? 'undefined'), b = norm(props.get(k) ?? 'MISSING');
  if (a === b) same++; else { bad++; console.log('LET DIFF', k, '|', a.slice(0, 80), '|', b.slice(0, 80)); }
}
// layer: re-inline extracted methods into the parent
const P = mods.get(path.basename(meta.file));
const pl = meta.layer ? P.ast.body.find(n => nameOf(n) === meta.layer) : null;
if (meta.layer) {
let layer = P.src.slice(pl.start, pl.end);
for (const e of meta.extracted) {
  const M = mods.get(e.mod + '.js');
  const n = M.ast.body.find(x => nameOf(x) === e.fn);
  const body = M.src.slice(n.start, n.end).replace(/^export\s+/, '').replace(new RegExp('^(async\\s+)?function ' + e.fn), (m, a) => (a || '') + e.prop);
  const before = layer;
  layer = layer.replace(new RegExp('\\b' + e.prop + ': ' + e.fn + '\\b'), () => body);
  if (before === layer) { bad++; console.log('LAYER: could not re-inline', e.prop); }
}
const la = norm(orig.get(meta.layer)), lb = norm(layer);
if (la === lb) { same++; console.log('layer identical (methods re-inlined)'); }
else { bad++; let i = 0; while (la[i] === lb[i]) i++; console.log('LAYER DIFF at', i, '\n o:', la.slice(Math.max(0, i - 80), i + 120), '\n n:', lb.slice(Math.max(0, i - 80), i + 120)); }
}
console.log('identical', same, 'diffs', bad, 'missing', missing.length ? missing.join(',') : 0);

// free variables
const GLOBALS = new Set('undefined NaN Infinity Math JSON Object Array Map Set WeakMap WeakSet WeakRef Promise Number String Boolean Date Error TypeError RangeError Symbol RegExp parseFloat parseInt isFinite isNaN window document navigator performance console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame localStorage fetch Image URL URLSearchParams AbortController HTMLElement Element Node Event CustomEvent globalThis queueMicrotask Uint8Array Uint8ClampedArray Float32Array Float64Array Int32Array Uint32Array ArrayBuffer atob btoa encodeURIComponent decodeURIComponent Blob MediaStream OffscreenCanvas ImageData Intl structuredClone arguments Reflect Proxy BigInt DOMException TextDecoder TextEncoder ResizeObserver MutationObserver IntersectionObserver'.split(' '));
let fv = 0;
for (const [f, { src, ast }] of mods) {
  const declared = new Set();
  for (const n of ast.body) {
    if (n.type === 'ImportDeclaration') n.specifiers.forEach(s => declared.add(s.local.name));
    const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
    if (d.type === 'VariableDeclaration') d.declarations.forEach(x => patternNames(x.id).forEach(k => declared.add(k)));
    else if (d.type === 'FunctionDeclaration') declared.add(d.id.name);
  }
  const free = new Set();
  for (const n of ast.body) {
    if (n.type === 'ImportDeclaration' || (n.type === 'ExportNamedDeclaration' && !n.declaration) || n.type === 'ExportAllDeclaration') continue;
    eachRef(n, (id, parent, sh, key) => {
      if (sh) return;
      if (parent && parent.type === 'VariableDeclarator' && key === 'id') return;
      if (parent && parent.type === 'FunctionDeclaration' && key === 'id') return;
      if (parent && parent.type === 'Property' && parent.shorthand && key === 'key') return;
      if (declared.has(id.name) || GLOBALS.has(id.name)) return;
      free.add(id.name);
    });
  }
  if (free.size) { fv++; console.log(f, 'FREE:', [...free].join(' ')); }
}
console.log(fv ? 'freevars FAIL' : 'freevars OK');

// unused imports (harmless but noisy) + import-time hazards: top-level non-function initializers that call imported-from-sibling fns
let haz = 0;
const sib = new Set(meta.mods.map(m => './' + m));
for (const [f, { ast }] of mods) {
  const fromSib = new Map();
  for (const n of ast.body) if (n.type === 'ImportDeclaration' && sib.has(n.source.value)) n.specifiers.forEach(s => fromSib.set(s.local.name, n.source.value));
  for (const n of ast.body) {
    const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
    if (d.type !== 'VariableDeclaration' || !d.declarations[0].init) continue;
    eachRef(d.declarations[0].init, (id, p, sh) => { if (!sh && fromSib.has(id.name)) { haz++; console.log('IMPORT-TIME', f, d.declarations[0].id.name, '<-', id.name, fromSib.get(id.name)); } }, { skipFunctions: true });
  }
}
console.log('import-time sibling refs:', haz);
process.exit(bad || fv ? 1 : 0);
