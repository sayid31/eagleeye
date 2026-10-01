import fs from 'node:fs';
import { parseAst } from '../../node_modules/rollup/dist/parseAst.js';
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const lineOf = (pos) => src.slice(0, pos).split('\n').length;
const ast = parseAst(src);
const out = [];
for (const n of ast.body) {
  const exp = n.type === 'ExportNamedDeclaration' && n.declaration ? 'E ' : '  ';
  const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  const a = lineOf(n.start), b = lineOf(n.end);
  let name = '';
  if (d.type === 'FunctionDeclaration') name = 'fn ' + d.id.name;
  else if (d.type === 'VariableDeclaration') name = d.kind + ' ' + d.declarations.map(x => x.id.name || '{..}').join(',');
  else if (d.type === 'ImportDeclaration') continue;
  else name = d.type;
  out.push(`${a}-${b}(${b - a + 1}) ${exp}${name}`);
}
console.log(out.join('\n'));
