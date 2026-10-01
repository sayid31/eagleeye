// Sementara: codemod state-object S, config-driven (dihapus setelah semua split selesai).
// Usage: node scripts/tmp-split/split.mjs <cfg name> [--write]
import fs from 'node:fs';
import path from 'node:path';
import { walk } from '../../node_modules/estree-walker/src/index.js';
import { load, eachRef, patternNames } from './lib.mjs';

const cfgName = process.argv[2];
const WRITE = process.argv.includes('--write');
const cfg = (await import(`./cfg/${cfgName}.mjs`)).default;
const FILE = cfg.file;
const OUT_DIR = path.dirname(FILE);
const P_NAME = path.basename(FILE, '.js'); // parent module name
const PREFIX = cfg.prefix;
const M_CONST = `${PREFIX}Constants`, M_STATE = `${PREFIX}State`, M_INST = `${PREFIX}Instances`;
const { src, ast } = load(FILE);

// ---- config maps ----------------------------------------------------------------------------
const fnModule = new Map();
for (const [m, names] of Object.entries(cfg.map)) for (const n of names.trim().split(/\s+/)) {
  if (fnModule.has(n)) throw new Error('dup map ' + n);
  fnModule.set(n, m);
}
const parentKeeps = new Set((cfg.parentKeeps || '').trim().split(/\s+/).filter(Boolean));

// ---- top-level items -------------------------------------------------------------------------
const lineEndAfter = (pos) => { const i = src.indexOf('\n', pos); return i < 0 ? src.length : i; };
const items = [];
let prevEnd = 0;
for (const n of ast.body) {
  if (n.type === 'ImportDeclaration') { prevEnd = n.end; continue; }
  let end = n.end;
  if (/^[ \t]*\/\/.*$/.test(src.slice(end, lineEndAfter(end)))) end = lineEndAfter(end);
  let start = prevEnd;
  while (start < n.start && /\s/.test(src[start])) start++;
  const inner = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  items.push({ node: n, inner, start, end, exported: inner !== n });
  prevEnd = end;
}
const lets = new Set();
for (const it of items) {
  const d = it.inner;
  if (d.type === 'VariableDeclaration') {
    if (d.declarations.length !== 1) throw new Error('multi-declarator at ' + d.start);
    const nm = patternNames(d.declarations[0].id);
    if (nm.length !== 1) throw new Error('destructured top-level decl at ' + d.start);
    it.name = nm[0]; it.kind = d.kind;
    if (d.kind === 'let') lets.add(it.name);
    if (d.kind === 'var') throw new Error('top-level var ' + it.name);
  } else if (d.type === 'FunctionDeclaration') { it.name = d.id.name; it.kind = 'fn'; }
  else if (d.type === 'ExportNamedDeclaration') { it.kind = 'exportlist'; it.name = '<exportlist>'; }
  else if (d.type === 'ExportDefaultDeclaration') { it.kind = 'default'; it.name = '<default>'; }
  else if (d.type === 'ExpressionStatement') { it.kind = 'stmt'; it.name = '<stmt@' + d.start + '>'; }
  else throw new Error('unhandled top-level ' + d.type);
}
const fnNames = new Set(items.filter(i => i.kind === 'fn').map(i => i.name));
const layerItem = cfg.layerName ? items.find(i => i.name === cfg.layerName) : null;
if (cfg.layerName && !layerItem) throw new Error('layer not found');

// ---- references (position-indexed) ---------------------------------------------------------------
const edits = [];
const refsByPos = [];
function collect(root) {
  eachRef(root, (id, parent, shadowed, key) => {
    if (parent && parent.type === 'Property' && parent.shorthand && key === 'key') return;
    if (parent && parent.type === 'VariableDeclarator' && key === 'id' && root.type === 'VariableDeclaration' && root.declarations[0] === parent) return;
    if (root.type === 'FunctionDeclaration' && root.id === id) return;
    if (shadowed) return;
    refsByPos.push({ pos: id.start, name: id.name });
    if (lets.has(id.name)) {
      const sh = parent && parent.type === 'Property' && parent.shorthand && parent.value === id;
      if (parent && parent.type === 'Property' && parent.shorthand && parent.value.type === 'AssignmentPattern') throw new Error('shorthand default with state at ' + id.start);
      edits.push({ start: id.start, end: id.end, text: sh ? `${id.name}: S.${id.name}` : `S.${id.name}` });
    }
  });
}
for (const it of items) {
  if (it.kind === 'let') {
    const init = it.inner.declarations[0].init;
    if (init) collect({ type: 'ExpressionStatement', expression: init, start: init.start, end: init.end });
  } else if (it.kind === 'default') {
    refsByPos.push({ pos: it.node.start, name: cfg.layerName });
  } else if (it.kind === 'exportlist') {
    for (const s of it.inner.specifiers) refsByPos.push({ pos: it.node.start, name: s.local.name });
  } else collect(it.inner);
}
edits.sort((a, b) => a.start - b.start);
for (let i = 1; i < edits.length; i++) if (edits[i].start < edits[i - 1].end) throw new Error('overlapping edits');
function render(a, b) {
  let out = '', pos = a;
  for (const e of edits) { if (e.end <= a || e.start >= b) continue; out += src.slice(pos, e.start) + e.text; pos = e.end; }
  return out + src.slice(pos, b);
}
const refsIn = (a, b) => refsByPos.filter(r => r.pos >= a && r.pos < b).map(r => r.name);

// ---- layer method extraction ----------------------------------------------------------------------
const layerObj = layerItem ? layerItem.inner.declarations[0].init : { properties: [] };
const extracted = [];
for (const p of layerObj.properties) {
  if (p.type !== 'Property' || p.computed) continue;
  const spec = cfg.layerMethods[p.key.name];
  if (!spec) continue;
  let usesThis = false;
  walk(p.value, { enter(n) { if (n.type === 'ThisExpression') usesThis = true; if (n !== p.value && /^Function/.test(n.type)) this.skip(); } });
  if (usesThis) throw new Error(`method ${p.key.name} uses this — remove it from layerMethods (stays in parent)`);
  extracted.push({ prop: p.key.name, ...spec, start: p.value.start, end: p.value.end, method: p.method, pStart: p.start, pEnd: p.end, isAsync: p.value.async });
}
const extractedFn = new Map(extracted.map(e => [e.fn, e.mod]));

// ---- module assignment (with automatic const tiering) ------------------------------------------------
const STATE_HEURISTIC = (it) => /^_/.test(it.name) && /^(NewExpression|ArrayExpression)$/.test(it.inner.declarations[0].init?.type);
const pureConsts = new Set();
const tierOf = new Map();
for (const it of items) {
  if (it.kind === 'let') { it.mod = M_STATE; continue; }
  if (it.kind === 'fn') {
    it.mod = parentKeeps.has(it.name) ? P_NAME : fnModule.get(it.name);
    if (!it.mod) throw new Error('unmapped fn ' + it.name);
    continue;
  }
  if (it.kind === 'stmt') { it.mod = fnModule.get(cfg.stmtOwner); if (!it.mod) throw new Error('stmt needs cfg.stmtOwner'); continue; }
  if (it.kind === 'exportlist' || it.kind === 'default' || it === layerItem) { it.mod = P_NAME; continue; }
  // const
  if (fnModule.has(it.name)) { it.mod = fnModule.get(it.name); continue; }
  if (parentKeeps.has(it.name)) { it.mod = P_NAME; continue; }
  const refs = new Set(refsIn(it.inner.start, it.end).filter(n => n !== it.name));
  const pure = [...refs].every(n => pureConsts.has(n) || !(lets.has(n) || fnNames.has(n) || items.some(i => i.name === n)));
  if (pure) {
    pureConsts.add(it.name);
    const explicit = (cfg.stateConsts || '').split(/\s+/).includes(it.name);
    it.mod = explicit || STATE_HEURISTIC(it) ? M_STATE : M_CONST;
  } else it.mod = M_INST;
}
const declMod = new Map(items.filter(i => i.name && !i.name.startsWith('<')).map(i => [i.name, i.mod]));
for (const e of extracted) declMod.set(e.fn, e.mod);

// ---- original imports ---------------------------------------------------------------------------------
const importOf = new Map();
for (const n of ast.body) if (n.type === 'ImportDeclaration') for (const s of n.specifiers) importOf.set(s.local.name, { decl: n, spec: s });

// ---- build module parts ------------------------------------------------------------------------------
const mods = new Map();
const getMod = (m) => { if (!mods.has(m)) mods.set(m, { parts: [], refs: new Set(), stateProps: [] }); return mods.get(m); };
for (const it of items) {
  if (it.mod === P_NAME) continue;
  const M = getMod(it.mod);
  if (it.kind === 'let') {
    M.stateProps.push({ it, text: render(it.start, it.end) });
    for (const r of refsIn(it.inner.start, it.end)) M.refs.add(r);
    continue;
  }
  M.parts.push({ it, text: render(it.start, it.end) });
  for (const r of refsIn(it.node.start, it.end)) M.refs.add(r);
}
for (const e of extracted) {
  let t = render(e.start, e.end);
  if (e.method) {
    if (!t.startsWith('(')) throw new Error('unexpected method value ' + e.prop);
    t = `${e.isAsync ? 'async ' : ''}function ${e.fn}` + t;
  } else {
    const re = /^(async\s+)?function\s*\*?\s*[\w$]*\s*\(/;
    if (!re.test(t)) throw new Error('unexpected method form ' + e.prop);
    t = t.replace(re, (m, a) => `${a || ''}function ${e.fn}(`);
  }
  const M = getMod(e.mod);
  M.parts.push({ it: { name: e.fn, kind: 'fn', start: e.start, end: e.end }, text: 'export ' + t, layerMethod: e });
  for (const r of refsIn(e.start, e.end)) M.refs.add(r);
}
// parent: layer text with methods replaced by names
const PM = getMod(P_NAME);
let layerText = '';
{
  let pos = layerItem ? layerItem.start : 0;
  for (const e of [...extracted].sort((a, b) => a.start - b.start)) {
    if (e.method) { layerText += render(pos, e.pStart) + `${e.prop}: ${e.fn}`; pos = e.pEnd; }
    else { layerText += render(pos, e.start) + e.fn; pos = e.end; }
  }
  if (layerItem) layerText += render(pos, layerItem.end);
}
const inExtracted = (pos) => extracted.some(e => pos >= e.start && pos < e.end);
for (const it of items) {
  if (it.mod !== P_NAME) continue;
  for (const r of refsByPos.filter(r => r.pos >= it.node.start && r.pos < it.end && !inExtracted(r.pos))) PM.refs.add(r.name);
}
for (const e of extracted) PM.refs.add(e.fn);

// ---- needExport & imports ----------------------------------------------------------------------------
const needExport = new Set();
const importsByMod = new Map();
for (const [mname, M] of mods) {
  const local = new Map(), orig = new Map();
  const namesHere = new Set([...M.parts.map(p => p.it.name), ...M.stateProps.map(p => p.it.name)]);
  if (mname === M_STATE) namesHere.add('S');
  for (const r of M.refs) {
    if (lets.has(r)) { if (mname !== M_STATE) (local.get(M_STATE) || local.set(M_STATE, new Set()).get(M_STATE)).add('S'); continue; }
    if (namesHere.has(r)) continue;
    if (r === cfg.layerName && mname !== P_NAME) { (local.get(P_NAME) || local.set(P_NAME, new Set()).get(P_NAME)).add('default:' + r); continue; }
    const tm = declMod.get(r);
    if (tm && tm !== mname) { (local.get(tm) || local.set(tm, new Set()).get(tm)).add(r); needExport.add(r); continue; }
    if (importOf.has(r)) { const { decl, spec } = importOf.get(r); (orig.get(decl) || orig.set(decl, new Set()).get(decl)).add(spec); }
  }
  importsByMod.set(mname, { local, orig });
}
function importLines(mname) {
  const { local, orig } = importsByMod.get(mname);
  const lines = [];
  for (const [decl, specs] of orig) {
    const s = [...specs];
    const ns = s.find(x => x.type === 'ImportNamespaceSpecifier');
    if (ns) { lines.push(`import * as ${ns.local.name} from '${decl.source.value}';`); continue; }
    const def = s.find(x => x.type === 'ImportDefaultSpecifier');
    const named = s.filter(x => x.type === 'ImportSpecifier').map(x => x.imported.name === x.local.name ? x.local.name : `${x.imported.name} as ${x.local.name}`);
    lines.push(`import ${[def && def.local.name, named.length ? `{ ${named.sort().join(', ')} }` : null].filter(Boolean).join(', ')} from '${decl.source.value}';`);
  }
  for (const [tm, names] of [...local].sort()) {
    const dflt = [...names].find(n => n.startsWith('default:'));
    const named = [...names].filter(n => !n.startsWith('default:')).sort();
    const bits = [dflt && dflt.slice(8), named.length ? `{ ${named.join(', ')} }` : null].filter(Boolean);
    lines.push(`import ${bits.join(', ')} from './${tm}.js';`);
  }
  return lines;
}
function withExport(part) {
  const it = part.it;
  if (part.layerMethod || it.exported || !needExport.has(it.name)) return part.text;
  const rel = it.inner.start - it.start;
  return part.text.slice(0, rel) + 'export ' + part.text.slice(rel);
}
const facadeBy = new Map();
for (const it of items) if (it.exported && it.mod !== P_NAME) (facadeBy.get(it.mod) || facadeBy.set(it.mod, []).get(it.mod)).push(it.name);

// ---- assemble ------------------------------------------------------------------------------------------
const outFiles = new Map();
const header = (m) => (cfg.headers[m] || `Moved out of ${P_NAME}.js (${m}).`).split('\n').map(l => '// ' + l).join('\n') + '\n';
for (const [mname, M] of mods) {
  if (mname === P_NAME) continue;
  let body = '';
  if (mname === M_STATE) {
    body += M.parts.map(p => withExport(p).replace(/^(\s*(\/\*\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*)(const )/, (m, a, b, c) => m.includes('export ') ? m : `${a}export ${c}`)).join('\n\n');
    if (M.parts.length) body += '\n\n';
    body += `/** Mutable layer state (formerly module-private \`let\` variables of ${P_NAME}.js). */\nexport const S = {\n`;
    body += M.stateProps.map(p => {
      const d = p.it.inner.declarations[0];
      const lead = src.slice(p.it.start, p.it.inner.start).replace(/^\s+/, '').split('\n').map(l => l ? '  ' + l.trim() : l).join('\n');
      const init = d.init ? render(d.init.start, d.init.end) : 'undefined';
      const trail = src.slice(d.init ? d.init.end : d.id.end, p.it.end).replace(/^\s*;/, '');
      return (lead ? lead.replace(/\s+$/, '') + '\n' : '') + `  ${d.id.name}: ${init},${trail}`;
    }).join('\n') + '\n};\n';
  } else body += M.parts.map(p => withExport(p)).join('\n\n') + '\n';
  outFiles.set(mname + '.js', header(mname) + '\n' + importLines(mname).join('\n') + '\n\n' + body);
}
{
  const facadeLines = [...facadeBy].sort().map(([m, names]) => `export { ${names.sort().join(', ')} } from './${m}.js';`);
  const head = src.slice(0, ast.body.find(n => n.type === 'ImportDeclaration').start).replace(/\s+$/, '');
  const keepText = items.filter(i => i.mod === P_NAME && i !== layerItem && i.kind !== 'default').map(i => { let t = render(i.start, i.end); if (i.kind === 'fn' && needExport.has(i.name) && !i.exported) { const rel = i.inner.start - i.start; t = t.slice(0, rel) + 'export ' + t.slice(rel); } return t; });
  const dflt = items.find(i => i.kind === 'default');
  const parts = [head, importLines(P_NAME).join('\n'), facadeLines.join('\n'), ...keepText.map(t => t.replace(/^\s+/, '')), layerText.replace(/^\s+/, ''), dflt ? src.slice(dflt.start, dflt.end).replace(/^\s+/, '') : ''].filter(Boolean);
  outFiles.set(P_NAME + '.js', parts.join('\n\n') + '\n');
}

// ---- eager-evaluation hazards ---------------------------------------------------------------------------
const warns = [];
for (const it of items.filter(i => i.kind === 'const' || i.kind === 'let')) {
  const root = it.kind === 'let' ? it.inner.declarations[0].init : it.inner.declarations[0].init;
  if (!root) continue;
  walk(root, { enter(n) {
    if (/^(FunctionExpression|ArrowFunctionExpression)$/.test(n.type)) return this.skip();
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && fnNames.has(n.callee.name)) warns.push(`${it.name} eagerly calls local fn ${n.callee.name}`);
  } });
}
const tier = (m) => (m === M_CONST ? 0 : m === M_STATE ? 1 : 2);
for (const it of items.filter(i => i.kind === 'let' || (i.kind === 'const' && (i.mod === M_CONST || i.mod === M_STATE)))) {
  for (const r of new Set(refsIn(it.inner.start, it.end))) {
    const tm = declMod.get(r);
    if (tm && tm !== it.mod && (tm === M_INST || fnNames.has(r) || tier(tm) > tier(it.mod))) warns.push(`${it.name} (${it.mod}) references ${r} (${tm})`);
  }
}

// ---- report ------------------------------------------------------------------------------------------------
console.log('original lines', src.split('\n').length, '| S rewrites', edits.length, '| exported across modules', needExport.size, '| lets', lets.size);
for (const [f, t] of [...outFiles].sort((a, b) => b[1].split('\n').length - a[1].split('\n').length)) console.log(String(t.split('\n').length).padStart(5), f);
for (const w of warns) console.log('WARN', w);
if (WRITE) {
  for (const [f, t] of outFiles) fs.writeFileSync(path.join(OUT_DIR, f), t);
  fs.writeFileSync(`scripts/tmp-split/meta.${cfgName}.json`, JSON.stringify({ file: FILE, layer: cfg.layerName, lets: [...lets], mods: [...outFiles.keys()], extracted: extracted.map(e => ({ prop: e.prop, fn: e.fn, mod: e.mod })), state: M_STATE + '.js' }));
  console.log('written', outFiles.size, 'files');
}
