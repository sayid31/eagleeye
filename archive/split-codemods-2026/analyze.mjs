// Sementara: analisis top-level cctv.js (dihapus setelah pilot)
import fs from 'node:fs';
import { parseAst } from '../../node_modules/rollup/dist/parseAst.js';
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const ast = parseAst(src, { jsx: false });
const kinds = {};
const rows = [];
for (const n of ast.body) {
  const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  let k = d.type;
  if (d.type === 'VariableDeclaration') k = d.kind;
  kinds[k] = (kinds[k] || 0) + 1;
}
console.log(kinds);
const lines = src.split('\n').length;
console.log('lines', lines);
// export list
const exps = [];
for (const n of ast.body) {
  if (n.type === 'ExportNamedDeclaration') {
    if (n.declaration) {
      const d = n.declaration;
      if (d.type === 'VariableDeclaration') d.declarations.forEach(x => exps.push(x.id.name));
      else exps.push(d.id.name);
    } else n.specifiers.forEach(s => exps.push(s.exported.name));
  } else if (n.type === 'ExportDefaultDeclaration') exps.push('default');
}
console.log('exports', exps.length, exps.join(' '));
