import { load, eachRef, scopeNames } from './lib.mjs';
import { walk } from '../../node_modules/estree-walker/src/index.js';
const { src, ast } = load('src/data/cctv.js');
const lineOf = (p) => src.slice(0, p).split('\n').length;
// top-level names
const top = new Map(); // name -> kind
for (const n of ast.body) {
  const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  if (d.type === 'VariableDeclaration') d.declarations.forEach(x => top.set(x.id.name, d.kind));
  else if (d.type === 'FunctionDeclaration') top.set(d.id.name, 'fn');
}
const lets = [...top].filter(([, k]) => k === 'let').map(([n]) => n);
// shadow check: any nested declaration of a top-level state name
const conflicts = {};
walk(ast, { enter(n) {
  if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|BlockStatement|CatchClause|ForStatement|ForInStatement|ForOfStatement|SwitchStatement)$/.test(n.type) && n !== ast) {
    for (const nm of scopeNames(n)) if (top.has(nm)) (conflicts[nm] ||= []).push(lineOf(n.start));
  }
} });
// ignore the top-level Program body scope itself (BlockStatement bodies of top functions are nested scopes: fine)
console.log('shadow conflicts:', JSON.stringify(conflicts));
// non-declaration top statements
for (const n of ast.body) {
  if (n.type === 'IfStatement') console.log('IF@', lineOf(n.start), src.slice(n.start, n.start + 400));
  if (n.type === 'ExportNamedDeclaration' && !n.declaration) console.log('EXP@', lineOf(n.start), src.slice(n.start, n.end));
}
// cctvLayer members
const layer = ast.body.map(n => n.declarations?.[0]).find(d => d?.id?.name === 'cctvLayer');
console.log('cctvLayer members:');
for (const p of layer.init.properties) console.log(' ', lineOf(p.start) + '-' + lineOf(p.end), p.key?.name, p.type, p.value?.type);
// this usage in layer
let thisCount = 0; walk(layer.init, { enter(n) { if (n.type === 'ThisExpression') thisCount++; } });
console.log('this in cctvLayer:', thisCount);
// tops referencing cctvLayer
const refsLayer = new Set();
for (const n of ast.body) { const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  if (d.type === 'FunctionDeclaration') eachRef(d, (id, p, sh) => { if (id.name === 'cctvLayer' && !sh) refsLayer.add(d.id.name); }); }
console.log('functions referencing cctvLayer:', [...refsLayer].join(' '));
