import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { load, eachRef, patternNames } from './lib.mjs';
const meta = JSON.parse(fs.readFileSync('scripts/tmp-split/meta.json', 'utf8'));
const lets = new Set(meta.lets);
const oldSrc = execSync('git show HEAD~1:src/data/cctv.js', { encoding: 'utf8', maxBuffer: 1e8 });
fs.writeFileSync('/tmp/cctv.old.js', oldSrc);

// A. public export surface
const O = load('/tmp/cctv.old.js');
const oldExp = new Set();
for (const n of O.ast.body) {
  if (n.type === 'ExportNamedDeclaration') {
    if (n.declaration) { const d = n.declaration; (d.declarations ? d.declarations.map(x => x.id.name) : [d.id.name]).forEach(x => oldExp.add(x)); }
    else n.specifiers.forEach(s => oldExp.add(s.exported.name));
  } else if (n.type === 'ExportDefaultDeclaration') oldExp.add('default');
}
const mod = await import('../../src/data/cctv.js');
const newExp = new Set(Object.keys(mod));
console.log('A. export surface: old', oldExp.size, 'new', newExp.size,
  'missing', [...oldExp].filter(x => !newExp.has(x)).join(',') || 'none',
  '| extra', [...newExp].filter(x => !oldExp.has(x)).join(',') || 'none');

// B. line multiset: every original line must exist in new files (after S._x -> _x, export stripped)
const norm = (l) => l.replace(/\bS\.(_[A-Za-z0-9_]+)/g, (m, n) => lets.has(n) ? n : m).replace(/^\s*export\s+/, '').trim();
const bag = new Map();
for (const f of ['cctv.js', ...meta.mods.filter(m => m !== 'cctv.js')]) {
  for (const l of fs.readFileSync('src/data/' + f, 'utf8').split('\n')) { const k = norm(l); if (k) bag.set(k, (bag.get(k) || 0) + 1); }
}
const lost = [];
for (const l of oldSrc.split('\n')) {
  const k = norm(l); if (!k) continue;
  const c = bag.get(k) || 0;
  if (c <= 0) lost.push(l.trim()); else bag.set(k, c - 1);
}
const real = lost.filter(l => !/^(import |\} from |\/\/ -{10,}|\/\/ =+$)/.test(l));
console.log('B. original lines not found in new files:', real.length);
real.slice(0, 25).forEach(l => console.log('   -', l.slice(0, 130)));

// C. import graph among cctv modules + import-time evaluation hazards
const cctvFiles = ['cctv.js', ...meta.mods.filter(m => m !== 'cctv.js')];
const graph = new Map();
const topEval = [];
for (const f of cctvFiles) {
  const { src, ast } = load('src/data/' + f);
  const imps = new Map();
  for (const n of ast.body) if (n.type === 'ImportDeclaration' && /^\.\/cctv[A-Za-z]*\.js$/.test(n.source.value)) {
    const t = n.source.value.slice(2); n.specifiers.forEach(s => imps.set(s.local.name, t));
    if (!graph.has(f)) graph.set(f, new Set()); graph.get(f).add(t);
  }
  for (const n of ast.body) {
    const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
    if (d.type === 'ImportDeclaration' || d.type === 'FunctionDeclaration' || d.type === 'ExportNamedDeclaration' || d.type === 'ExportDefaultDeclaration') continue;
    const used = new Set();
    eachRef(d, (id, p, sh) => { if (!sh && imps.has(id.name)) used.add(id.name + '<-' + imps.get(id.name)); });
    if (used.size) topEval.push(f + ': ' + (d.declarations ? d.declarations[0].id.name : d.type) + ' uses ' + [...used].join(', '));
  }
}
// cycles
const cyc = new Set();
(function dfs() {
  const color = new Map();
  const stack = [];
  const visit = (u) => { color.set(u, 1); stack.push(u);
    for (const v of graph.get(u) || []) { if (color.get(v) === 1) cyc.add(stack.slice(stack.indexOf(v)).concat(v).join(' > ')); else if (!color.get(v)) visit(v); }
    stack.pop(); color.set(u, 2); };
  for (const k of graph.keys()) if (!color.get(k)) visit(k);
})();
console.log('C. import cycles found:', cyc.size);
console.log('   import-time statements that use cctv-module imports:', topEval.length ? '\n   ' + topEval.join('\n   ') : 'none');
