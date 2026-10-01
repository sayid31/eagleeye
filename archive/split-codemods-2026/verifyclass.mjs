// Sementara: verifikasi split class — setiap member/item top-level asli ada verbatim di modul baru.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseAst } from '../../node_modules/rollup/dist/parseAst.js';
const cfgName = process.argv[2];
const cfg = (await import(`./cfg/${cfgName}.mjs`)).default;
const meta = JSON.parse(fs.readFileSync(`scripts/tmp-split/meta.${cfgName}.json`, 'utf8'));
const orig = execSync(`git show HEAD:${cfg.file}`, { encoding: 'utf8', maxBuffer: 1 << 28 });
const norm = (s) => s.replace(/\bexport\s+(?=(async function|function|const|class))/g, '').replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();
const DIR = path.dirname(cfg.file);
const all = meta.mods.map(m => fs.readFileSync(path.join(DIR, m), 'utf8'));
const hay = norm(all.join('\n'));
const ast = parseAst(orig);
let ok = 0, bad = 0;
const check = (label, text) => { if (hay.includes(norm(text).replace(/,\s*$/, ''))) ok++; else { bad++; console.log('MISSING', label); } };
for (const n of ast.body) {
  if (n.type === 'ImportDeclaration') continue;
  const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  if (d.type === 'ClassDeclaration' && d.id.name === cfg.className) {
    for (const m of d.body.body) check('member ' + (m.key.name || m.key.value), orig.slice(m.start, m.end));
  } else if (d.type === 'FunctionDeclaration' || d.type === 'VariableDeclaration') check('item ' + (d.id?.name || d.declarations[0].id.name), orig.slice(d.start, d.end));
}
console.log('verbatim ok', ok, 'missing', bad);
// method duplicate check across mixins + class
const names = new Map();
for (const m of meta.mods) {
  const t = fs.readFileSync(path.join(DIR, m), 'utf8');
  if (!/Mixin = \{/.test(t)) continue;
  const a = parseAst(t.replace(/^export /m, ''));
  for (const n of a.body) { const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n; if (d.type === 'VariableDeclaration' && d.declarations[0].init?.type === 'ObjectExpression') for (const p of d.declarations[0].init.properties) { const k = p.key.name; if (names.has(k)) { console.log('DUP method', k, names.get(k), m); bad++; } names.set(k, m); } }
}
process.exit(bad ? 1 : 0);
