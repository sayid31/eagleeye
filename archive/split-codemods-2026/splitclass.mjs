// Sementara: class -> mixin splitter (keluarga B). Dihapus setelah semua split selesai.
// Usage: node scripts/tmp-split/splitclass.mjs <cfg> [--write]
// cfg: { file, className, prefix, mixins: {mod: {exportName, methods:'a b'}}, helpers: {mod:'name ...'} }
// Methods are moved verbatim into `export const xMixin = { ... }` and attached with Object.assign.
// Unmapped top-level fn/const items go to <prefix>Helpers.js / <prefix>Constants.js.
import fs from 'node:fs';
import path from 'node:path';
import { load, eachRef, patternNames } from './lib.mjs';
import { parseAst } from '../../node_modules/rollup/dist/parseAst.js';

const cfgName = process.argv[2];
const WRITE = process.argv.includes('--write');
const cfg = (await import(`./cfg/${cfgName}.mjs`)).default;
const FILE = cfg.file;
const DIR = path.dirname(FILE);
const { src, ast } = load(FILE);
const GLOBALS = new Set('undefined NaN Infinity Math JSON Object Array Map Set WeakMap WeakSet WeakRef Promise Number String Boolean Date Error TypeError RangeError Symbol RegExp parseFloat parseInt isFinite isNaN window document navigator performance console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame localStorage sessionStorage fetch Image URL URLSearchParams AbortController AbortSignal HTMLElement Element Node Event CustomEvent KeyboardEvent MouseEvent globalThis queueMicrotask Uint8Array Uint8ClampedArray Float32Array Float64Array Int32Array Uint32Array ArrayBuffer atob btoa encodeURIComponent decodeURIComponent Blob MediaStream OffscreenCanvas ImageData Intl structuredClone arguments Reflect Proxy BigInt DOMException TextDecoder TextEncoder ResizeObserver MutationObserver IntersectionObserver RTCPeerConnection WebSocket CSS getComputedStyle'.split(' '));

// ---- top-level classification ---------------------------------------------------------------
const imports = []; // {node, names:[local], text}
const topItems = []; // movable fn/const
let classNode = null, classDecl = null, classExported = false;
const parentKeepNodes = [];
const lineEndAfter = (pos) => { const i = src.indexOf('\n', pos); return i < 0 ? src.length : i; };
let prevEnd = 0;
for (const n of ast.body) {
  let end = n.end;
  if (/^[ \t]*\/\/.*$/.test(src.slice(end, lineEndAfter(end)))) end = lineEndAfter(end);
  let start = prevEnd;
  while (start < n.start && /\s/.test(src[start])) start++;
  prevEnd = end;
  if (n.type === 'ImportDeclaration') { imports.push({ node: n, names: n.specifiers.map(s => s.local.name) }); continue; }
  const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  const exported = d !== n;
  if (d.type === 'ClassDeclaration' && d.id.name === cfg.className) { classNode = n; classDecl = d; classExported = exported; continue; }
  if (d.type === 'FunctionDeclaration') { topItems.push({ name: d.id.name, kind: 'fn', start, end, node: n, exported }); continue; }
  if (d.type === 'VariableDeclaration') {
    if (d.declarations.length !== 1) throw new Error('multi-declarator ' + d.start);
    const nm = patternNames(d.declarations[0].id);
    if (nm.length !== 1) throw new Error('destructured top-level ' + d.start);
    topItems.push({ name: nm[0], kind: d.kind === 'const' ? 'const' : 'let', start, end, node: n, exported });
    if (d.kind !== 'const') throw new Error('top-level ' + d.kind + ' ' + nm[0] + ' — use state object first');
    continue;
  }
  parentKeepNodes.push({ node: n, start, end });
}
if (!classNode) throw new Error('class not found');

// ---- helper module assignment ----------------------------------------------------------------
const itemModule = new Map();
for (const [m, names] of Object.entries(cfg.helpers || {})) for (const nm of names.trim().split(/\s+/)) itemModule.set(nm, m);
const M_CONST = `${cfg.prefix}Constants`, M_HELP = `${cfg.prefix}Helpers`;
for (const it of topItems) {
  if (cfg.parentKeeps && cfg.parentKeeps.split(/\s+/).includes(it.name)) { it.module = null; continue; }
  it.module = itemModule.get(it.name) || (it.kind === 'const' ? M_CONST : M_HELP);
}
const itemByName = new Map(topItems.map(i => [i.name, i]));

// ---- class members -----------------------------------------------------------------------------
const members = classDecl.body.body;
const methodModule = new Map();
const mixinMeta = {};
for (const [m, spec] of Object.entries(cfg.mixins)) {
  mixinMeta[m] = spec;
  for (const nm of spec.methods.trim().split(/\s+/)) {
    if (methodModule.has(nm)) throw new Error('dup method map ' + nm);
    methodModule.set(nm, m);
  }
}
const memberInfo = [];
let mPrev = classDecl.body.start + 1;
for (const m of members) {
  let start = mPrev;
  while (start < m.start && /\s/.test(src[start])) start++;
  mPrev = m.end;
  const key = m.key && (m.key.name || m.key.value);
  memberInfo.push({ m, start, end: m.end, key });
}
for (const nm of methodModule.keys()) if (!memberInfo.some(x => x.key === nm && x.m.kind === 'method' && !x.m.static)) throw new Error('mapped method not a plain method: ' + nm);
const modText = new Map(); // module -> array of text chunks
const moved = []; // for verification {module, text}
const mixinBodies = {};
for (const info of memberInfo) {
  const mod = methodModule.get(info.key);
  if (!mod || info.m.kind !== 'method') continue;
  if (/\bsuper\b/.test(src.slice(info.m.start, info.m.end))) throw new Error('super in ' + info.key);
  (mixinBodies[mod] ||= []).push(src.slice(info.start, info.end) + ',');
}

// ---- compose module bodies ------------------------------------------------------------------------
const bodies = new Map(); // module name -> {body, header}
for (const [m, chunks] of Object.entries(mixinBodies)) {
  bodies.set(m, { body: `export const ${mixinMeta[m].exportName} = {\n${chunks.join('\n\n')}\n};\n`, header: mixinMeta[m].header || `${cfg.className} methods (mixin): ${m}.` });
}
const exportNeeded = new Set();
for (const it of topItems) {
  if (!it.module) continue;
  const b = bodies.get(it.module) || { body: '', header: it.module === M_CONST ? `Module constants moved out of ${path.basename(FILE)}.` : `Helper functions moved out of ${path.basename(FILE)}.` };
  bodies.set(it.module, b);
}
// placeholder; real item text added after export decisions
const importSource = new Map(); // local name -> {spec, source}
for (const imp of imports) for (const s of imp.node.specifiers) {
  const kind = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? 'ns' : 'named';
  importSource.set(s.local.name, { kind, imported: kind === 'named' ? s.imported.name || s.imported.value : null, local: s.local.name, source: imp.node.source.value });
}

// free identifiers of a code string against declared names
function freeOf(code) {
  const a = parseAst(code);
  const declared = new Set();
  for (const n of a.body) {
    const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
    if (d.type === 'VariableDeclaration') d.declarations.forEach(x => patternNames(x.id).forEach(k => declared.add(k)));
    else if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') declared.add(d.id.name);
  }
  const free = new Set();
  for (const n of a.body) eachRef(n, (id, parent, sh, key) => {
    if (sh) return;
    if (parent && parent.type === 'VariableDeclarator' && key === 'id') return;
    if (parent && parent.type === 'FunctionDeclaration' && key === 'id') return;
    if (parent && parent.type === 'ClassDeclaration' && key === 'id') return;
    if (parent && parent.type === 'Property' && parent.shorthand && key === 'key') return;
    if (declared.has(id.name) || GLOBALS.has(id.name)) return;
    free.add(id.name);
  });
  return { free, declared };
}

// Pass 1: item bodies text (without export), find cross-module needs
const itemText = new Map();
for (const it of topItems) {
  let t = src.slice(it.start, it.end);
  if (it.exported) t = t.replace(/^(\s*(?:\/\*\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*)export /, '$1');
  itemText.set(it.name, t);
}
const needs = new Map(); // module -> Set(names)
function addNeed(mod, nm) { (needs.get(mod) || needs.set(mod, new Set()).get(mod)).add(nm); }
const parentNeedsFromItems = new Set();
for (const [mod] of bodies) {
  const parts = [];
  if (mixinBodies[mod]) parts.push(bodies.get(mod).body);
  for (const it of topItems) if (it.module === mod) parts.push(itemText.get(it.name));
  const code = parts.join('\n');
  const { free } = freeOf(code);
  for (const nm of free) {
    if (importSource.has(nm)) { addNeed(mod, nm); continue; }
    const it = itemByName.get(nm);
    if (it) { if (!it.module) throw new Error(`${mod} needs parent-kept ${nm}`); if (it.module !== mod) { addNeed(mod, nm); exportNeeded.add(nm); } continue; }
    throw new Error(`${mod}: unresolved identifier ${nm}`);
  }
}

// Parent code after removal
const removals = [];
for (const it of topItems) if (it.module) removals.push([it.start, it.end]);
for (const info of memberInfo) { const mod = methodModule.get(info.key); if (mod && info.m.kind === 'method') removals.push([info.start, info.end]); }
removals.sort((a, b) => a[0] - b[0]);
let parent = '';
{
  let pos = 0;
  for (const [s, e] of removals) { parent += src.slice(pos, s); pos = e; }
  parent += src.slice(pos);
}
// remove import declarations from parent text, regenerate later: compute by marking
const impRanges = imports.map(i => [i.node.start, i.node.end]);
// find parent code without imports for free analysis
let parentNoImp = '';
{
  const rs = [...removals, ...impRanges].sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [s, e] of rs) { if (s < pos) continue; parentNoImp += src.slice(pos, s); pos = e; }
  parentNoImp += src.slice(pos);
  // strip `export {..} from` / export-all statements (not references)
}
const parentUses = new Set();
{
  const a = parseAst(parentNoImp);
  const decl = new Set();
  for (const n of a.body) {
    const d = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
    if (d.type === 'VariableDeclaration') d.declarations.forEach(x => patternNames(x.id).forEach(k => decl.add(k)));
    else if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') decl.add(d.id.name);
  }
  for (const n of a.body) {
    if (n.type === 'ExportNamedDeclaration' && !n.declaration) continue;
    eachRef(n, (id, parentN, sh, key) => {
      if (sh) return;
      if (parentN && parentN.type === 'VariableDeclarator' && key === 'id') return;
      if (parentN && parentN.type === 'FunctionDeclaration' && key === 'id') return;
      if (parentN && parentN.type === 'ClassDeclaration' && key === 'id') return;
      if (parentN && parentN.type === 'Property' && parentN.shorthand && key === 'key') return;
      if (!decl.has(id.name)) parentUses.add(id.name);
    });
  }
}
for (const nm of parentUses) if (itemByName.has(nm) && itemByName.get(nm).module) exportNeeded.add(nm);
// exported items moved (public API) must be re-exported from parent
const reexports = new Map(); // module -> names
for (const it of topItems) if (it.module && it.exported) { exportNeeded.add(it.name); (reexports.get(it.module) || reexports.set(it.module, []).get(it.module)).push(it.name); }

// ---- emit modules --------------------------------------------------------------------------------
const outFiles = new Map();
function importLines(mod, nameSet) {
  const bySource = new Map();
  const sib = [];
  for (const nm of [...nameSet].sort()) {
    if (importSource.has(nm)) {
      const s = importSource.get(nm);
      const e = bySource.get(s.source) || { def: null, ns: null, named: [] };
      if (s.kind === 'default') e.def = nm; else if (s.kind === 'ns') e.ns = nm; else e.named.push(s.imported === nm ? nm : `${s.imported} as ${nm}`);
      bySource.set(s.source, e);
    } else {
      const it = itemByName.get(nm);
      const e = bySource.get('./' + it.module + '.js') || { def: null, ns: null, named: [] };
      e.named.push(nm); bySource.set('./' + it.module + '.js', e);
    }
  }
  const lines = [];
  for (const [source, e] of bySource) {
    if (e.ns) { lines.push(`import * as ${e.ns} from '${source}';`); continue; }
    const parts = [];
    if (e.def) parts.push(e.def);
    if (e.named.length) parts.push(e.named.length > 3 ? `{\n  ${e.named.join(',\n  ')},\n}` : `{ ${e.named.join(', ')} }`);
    lines.push(`import ${parts.join(', ')} from '${source}';`);
  }
  return lines.join('\n');
}
for (const [mod, b] of bodies) {
  const parts = [];
  if (mixinBodies[mod]) parts.push(b.body);
  for (const it of topItems) if (it.module === mod) {
    let t = itemText.get(it.name);
    if (exportNeeded.has(it.name)) t = t.replace(/^(\s*(?:\/\*\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*)(async function|function|const)\b/, '$1export $2');
    parts.push(t);
  }
  const header = '// ' + b.header.split('\n').join('\n// ');
  const imp = importLines(mod, needs.get(mod) || new Set());
  outFiles.set(path.join(DIR, mod + '.js'), `${header}\n${imp ? imp + '\n' : ''}\n${parts.join('\n\n').replace(/^\n+/, '')}\n`.replace(/\n{3,}/g, '\n\n'));
}

// ---- parent -----------------------------------------------------------------------------------------
let parentOut = parent;
// rewrite imports: prune unused specifiers
const importReplace = [];
for (const imp of imports) {
  const used = imp.node.specifiers.filter(s => parentUses.has(s.local.name));
  if (used.length === imp.node.specifiers.length) continue;
  importReplace.push({ imp, used });
}
// Work on original src offsets: rebuild by applying removals + import edits together
{
  const edits = removals.map(([s, e]) => ({ s, e, t: '' }));
  for (const { imp, used } of importReplace) {
    let t = '';
    if (used.length) {
      const def = used.find(s => s.type === 'ImportDefaultSpecifier');
      const ns = used.find(s => s.type === 'ImportNamespaceSpecifier');
      const named = used.filter(s => s.type === 'ImportSpecifier').map(s => (s.imported.name || s.imported.value) === s.local.name ? s.local.name : `${s.imported.name || s.imported.value} as ${s.local.name}`);
      const parts = [];
      if (def) parts.push(def.local.name);
      if (ns) parts.push(`* as ${ns.local.name}`);
      if (named.length) parts.push(named.length > 3 ? `{\n  ${named.join(',\n  ')},\n}` : `{ ${named.join(', ')} }`);
      t = `import ${parts.join(', ')} from '${imp.node.source.value}';`;
    }
    edits.push({ s: imp.node.start, e: imp.node.end, t });
  }
  // class end: add Object.assign after class
  const classEnd = classNode.end;
  const mixNames = Object.values(mixinMeta).map(x => x.exportName);
  edits.push({ s: classEnd, e: classEnd, t: `\n\n// Method groups live in ${cfg.prefix}*.js mixins; attached once at module load.\nObject.assign(${cfg.className}.prototype, ${mixNames.join(', ')});` });
  edits.sort((a, b) => a.s - b.s || a.e - b.e);
  let pos = 0, out = '';
  for (const ed of edits) { if (ed.s < pos) throw new Error('overlap edit at ' + ed.s); out += src.slice(pos, ed.s) + ed.t; pos = ed.e; }
  out += src.slice(pos);
  // insert new imports after the last import
  const newNames = new Map();
  const lastImp = imports[imports.length - 1].node.end;
  const addImports = [];
  for (const [mod, spec] of Object.entries(mixinMeta)) addImports.push(`import { ${spec.exportName} } from './${mod}.js';`);
  const helperNames = new Map();
  for (const nm of parentUses) { const it = itemByName.get(nm); if (it && it.module) (helperNames.get(it.module) || helperNames.set(it.module, []).get(it.module)).push(nm); }
  for (const [mod, names] of helperNames) addImports.push(`import { ${names.sort().join(', ')} } from './${mod}.js';`);
  const reexp = [];
  for (const [mod, names] of reexports) reexp.push(`export { ${names.sort().join(', ')} } from './${mod}.js';`);
  // compute insertion point in `out`: find the original import end text position after edits
  let shift = 0;
  for (const ed of edits) if (ed.e <= lastImp && ed.s < lastImp) shift += ed.t.length - (ed.e - ed.s);
  const at = lastImp + shift;
  out = out.slice(0, at) + '\n' + addImports.join('\n') + (reexp.length ? '\n' + reexp.join('\n') : '') + out.slice(at);
  parentOut = out.replace(/\n{3,}/g, '\n\n');
}
outFiles.set(FILE, parentOut);

// ---- report -------------------------------------------------------------------------------------------
for (const [f, t] of [...outFiles].sort((a, b) => b[1].split('\n').length - a[1].split('\n').length)) console.log(String(t.split('\n').length).padStart(6), path.basename(f));
fs.writeFileSync('scripts/tmp-split/meta.' + cfgName + '.json', JSON.stringify({ file: FILE, mods: [...outFiles.keys()].map(f => path.basename(f)), classMethods: members.filter(m => m.kind === 'method').map(m => m.key.name || m.key.value) }, null, 1));
if (WRITE) { for (const [f, t] of outFiles) fs.writeFileSync(f, t); console.log('written', outFiles.size, 'files'); }
