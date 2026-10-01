// Sementara: util parse + resolusi scope untuk codemod pilot (dihapus setelah pilot)
import fs from 'node:fs';
import { parseAst } from '../../node_modules/rollup/dist/parseAst.js';
import { walk } from '../../node_modules/estree-walker/src/index.js';

export function load(file) {
  const src = fs.readFileSync(file, 'utf8');
  return { src, ast: parseAst(src) };
}
export function patternNames(p, out = []) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': p.properties.forEach(x => patternNames(x.type === 'RestElement' ? x.argument : x.value, out)); break;
    case 'ArrayPattern': p.elements.forEach(x => patternNames(x, out)); break;
    case 'AssignmentPattern': patternNames(p.left, out); break;
    case 'RestElement': patternNames(p.argument, out); break;
  }
  return out;
}
function declsInStatements(list, out) {
  for (const s of list) {
    const d = s.type === 'ExportNamedDeclaration' && s.declaration ? s.declaration : s;
    if (d.type === 'VariableDeclaration') d.declarations.forEach(x => patternNames(x.id, out));
    else if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') out.push(d.id.name);
  }
}
function varHoisted(node, out) {
  walk(node, { enter(n, parent) {
    if (n !== node && /Function/.test(n.type)) return this.skip();
    if (n.type === 'VariableDeclaration' && n.kind === 'var') n.declarations.forEach(x => patternNames(x.id, out));
  } });
}
/** Names declared by a scope-creating node (own scope only). */
export function scopeNames(n) {
  const out = [];
  if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)) {
    n.params.forEach(p => patternNames(p, out));
    if (n.type === 'FunctionExpression' && n.id) out.push(n.id.name);
    if (n.body.type === 'BlockStatement') { declsInStatements(n.body.body, out); varHoisted(n.body, out); }
  } else if (n.type === 'BlockStatement') declsInStatements(n.body, out);
  else if (n.type === 'CatchClause') patternNames(n.param, out);
  else if (/^For(In|Of)?Statement$/.test(n.type)) {
    const init = n.init || n.left;
    if (init && init.type === 'VariableDeclaration' && init.kind !== 'var') init.declarations.forEach(x => patternNames(x.id, out));
  } else if (n.type === 'SwitchStatement') n.cases.forEach(c => declsInStatements(c.consequent, out));
  else if (n.type === 'ClassExpression' && n.id) out.push(n.id.name);
  return out;
}
const SCOPE_T = /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|BlockStatement|CatchClause|ForStatement|ForInStatement|ForOfStatement|SwitchStatement|ClassExpression)$/;

/**
 * Visit each identifier that is a real variable reference (not property name /
 * key / label), with `shadowed` = declared in an enclosing non-module scope.
 * cb(idNode, parent, shadowed, isDeclId)
 */
export function eachRef(root, cb, opts = {}) {
  const stack = [];
  const isShadow = (name) => stack.some(s => s.has(name));
  walk(root, {
    enter(n, parent, key) {
      if (opts.skipFunctions && n !== root && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)) return this.skip();
      if (n !== root && SCOPE_T.test(n.type)) stack.push(new Set(scopeNames(n)));
      else if (n === root && SCOPE_T.test(n.type)) stack.push(new Set(scopeNames(n)));
      if (n.type !== 'Identifier') return;
      if (parent) {
        if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
        if (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand) return;
        if (parent.type === 'PropertyDefinition' && key === 'key' && !parent.computed) return;
        if (parent.type === 'MethodDefinition' && key === 'key' && !parent.computed) return;
        if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label') return;
        if (parent.type === 'ImportSpecifier' || parent.type === 'ExportSpecifier') return;
      }
      cb(n, parent, isShadow(n.name), key);
    },
    leave(n) { if (SCOPE_T.test(n.type)) stack.pop(); },
  });
}
