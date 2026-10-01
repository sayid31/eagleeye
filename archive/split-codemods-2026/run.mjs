// Sementara (pilot cctv.js): codemod state-object S. Dihapus setelah pilot.
import fs from 'node:fs';
import path from 'node:path';
import { load, eachRef, patternNames } from './lib.mjs';

const FILE = 'src/data/cctv.js';
const OUT_DIR = path.dirname(FILE);
const WRITE = process.argv.includes('--write');
const { src, ast } = load(FILE);

// ---- module map: function/const name -> module -------------------------------------------
const MAP = {
  cctvMath: 'toRad normalizeHeading clamp normalizeSignedAngle angularDeltaAbs offsetDegrees haversineKm sectorAreaKm2 safeNumber quantize headingFromId',
  cctvCalibrationStore: 'normalizeCalibration isDefaultCalibration normalizeCoverageMode safeWindowLocalStorage readCalibrationStoreV2 writeCalibrationStoreV2 loadCalibrationStore saveCalibrationStore deriveCalBadge calibrationPatchMovesAnchor applyCalibrationPatch',
  cctvGeometry: 'ensureCameraPose projectPoint computeFrustumGeometry activationProbeClampRange liftAlongSurfaceNormal frustumCartesians _frustumCartesiansForTest frustumFrameEcef planeOrientationFor applyFrustumGeometry updateRecordGeometry',
  cctvCatalog: 'CAMERA_SEEDS normalizeFeedType isVideoFeedType seedCatalog cityIdByName loadCameraSources buildCatalogFromSources mergeSeedAndSourceCatalogs currentViewContext _normalizeFeedTypeForTest _isVideoFeedTypeForTest _buildCatalogFromSourcesForTest',
  cctvGround: 'surfaceRegimeKey projectionTilesReady currentSurfaceRegime groundPriorAltFor isGroundResolved groundAltFor rearmGroundResolution resolveCommittedGroundAnchor resolveGroundPriors applyLateGroundPriors handleMapStackChanged refreshHorizonCulling',
  cctvProjectionFrames: 'frameSignatureFromPixels projectionFrameSignature paintNextProjectionBuffer refreshProjectionTextures frameUrlFor mediaUrlFor paintProjectionPlaceholder refreshProjectionImage paintPlaceholderThrottled drawProjectionFrame',
  cctvProjectionPlane: 'createCctvProjectionOverlayEntry updatePlanePlacement clearProjectionOverlay setPlaneVisible createProjectionPlane _createCctvProjectionPlaneForTest _updateCctvProjectionPlaneForTest _drawProjectionFrameForTest _refreshProjectionTexturesForTest _createProjectionProxyVideoForTest _destroyProjectionRuntimeForTest',
  cctvProjectionRuntime: 'attachHlsJs createProjectionRuntime createProjectionProxyVideo ensureProjectionRuntime destroyProjectionRuntime getActiveProjectionMirrorStream projectionLoopIsNeeded startProjectionLoop stopProjectionLoop pauseInactiveProjectionFeeds',
  cctvGeometryQueue: 'stopGeometryLoadQueue createGeometryProgressNotifier processCctvGeometryQueueBatch cctvGeometryDrainPacing processCctvGeometryDrainBatch prioritizeActiveCctvGeometryRecord processGeometryBatch enqueueGeometryRefresh startGeometryLoadQueue',
  cctvCoverage: 'getActiveRecord activeCctvOcclusionPlanes buildCoverageVisibleSet destroyViewshedVolume rebuildViewshedVolume hideCctvRecordVisuals hideCctvVisuals refreshCoverageStyles buildCoverageEntities materializeCctvCoverageEntities materializeCctvActiveCoverageEntities materializeCctvVisibleCoverageEntities registerCoverageEntities ensureActiveCoverageEntities ensureVisibleCoverageEntities destroyCoverageEntities _setCctvCoverageStateForTest nearestCameraIdToViewer coverageNeighborCount refreshCctvFocusStyles applyCctvFocusDeemphasis',
  cctvAmbientCards: 'ensureCardFrameSlot refreshAmbientCards pushAmbientCardEntries handleHoverMove cancelHoverRelease scheduleHoverRelease clearHoverCard hoverFetchCardFrame cardFrameTick fetchCardFrame startCardFrameLoop stopCardFrameLoop teardownAmbientCards setCctvCardPresentationOptions _pushAmbientCardEntriesForTest _setCctvOverlayHostForTest',
  cctvPublicState: 'buildSummaryText getPublicCameraState uiState notifyListeners notifyListenersThrottled syncHealthState _getPublicCameraStateForTest',
  cctvActivation: 'ensureGizmo runActivationObstructionProbe clearProbeClampOnDeactivation cctvRecordNeedsActivation bindCctvWorldClickGesture setActiveCamera deactivateActiveCamera cctvEmptyClickDeselects extractPickedCameraId _extractPickedCameraIdForTest focusCctvRecord focusCamera maybeAutoHop cctvCycleIndex clearRuntimeState',
};
const HEADERS = {
  cctvConstants: 'Immutable module constants (endpoints, intervals, colors, seeds-independent tables) moved out of cctv.js.',
  cctvState: 'Shared mutable state of the CCTV layer. The former module-private `let` variables of cctv.js live as\nproperties of the single exported object `S`; the const containers are exported directly.',
  cctvMath: 'Pure angle/distance/number helpers moved out of cctv.js (no layer state).',
  cctvCalibrationStore: 'Per-camera calibration normalization, localStorage store (v2) and calibration patch application.',
  cctvGeometry: 'Frustum/pose geometry and per-record geometry application moved out of cctv.js.',
  cctvCatalog: 'Camera catalog: seeds, feed-type normalization, source merge and catalog build.',
  cctvGround: 'Ground-altitude priors, surface regime and map-stack change handling for CCTV records.',
  cctvProjectionFrames: 'Projection texture painting, frame URLs and frame signatures.',
  cctvProjectionPlane: 'Projection plane creation/placement and its test hooks.',
  cctvProjectionRuntime: 'Projection video/HLS runtime lifecycle and the projection refresh loop.',
  cctvGeometryQueue: 'Batched geometry load queue and progress notifier.',
  cctvCoverage: 'Coverage wireframes/viewshed volumes, visibility set and focus de-emphasis styling.',
  cctvAmbientCards: 'Ambient thumbnail cards, hover card and card frame fetch loop.',
  cctvPublicState: 'Public camera state, UI state snapshot and listener notification.',
  cctvActivation: 'Camera activation/deactivation, click gesture, focus and auto-hop.',
  cctvLayerLifecycle: 'Large cctvLayer methods (init/setParams/destroy) moved out of cctv.js as plain functions; the layer object still references them.',
};
const fnModule = new Map();
for (const [m, names] of Object.entries(MAP)) for (const n of names.split(/\s+/)) {
  if (fnModule.has(n)) throw new Error('dup map ' + n);
  fnModule.set(n, m);
}
const LAYER_METHODS = { init: 'initCctvLayer', setParams: 'setCctvLayerParams', destroy: 'destroyCctvLayer' };

// ---- top-level items ------------------------------------------------------------------------
const lineEndAfter = (pos) => { let i = src.indexOf('\n', pos); return i < 0 ? src.length : i; };
const items = [];
let prevEnd = 0;
for (const n of ast.body) {
  if (n.type === 'ImportDeclaration') { prevEnd = n.end; continue; }
  let end = n.end;
  const rest = src.slice(end, lineEndAfter(end));
  if (/^[ \t]*\/\/.*$/.test(rest)) end = lineEndAfter(end);
  // leading = from prevEnd (skip leading newlines)
  let start = prevEnd;
  while (start < n.start && /\s/.test(src[start])) start++;
  const inner = n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n;
  items.push({ node: n, inner, start, end, exported: inner !== n });
  prevEnd = end;
}
const lets = new Set();
const topKind = new Map();
for (const it of items) {
  const d = it.inner;
  if (d.type === 'VariableDeclaration') {
    if (d.declarations.length !== 1) throw new Error('multi-declarator at ' + d.start);
    const nm = patternNames(d.declarations[0].id);
    if (nm.length !== 1) throw new Error('destructured top-level decl');
    it.name = nm[0]; it.kind = d.kind;
    topKind.set(it.name, d.kind);
    if (d.kind === 'let') lets.add(it.name);
  } else if (d.type === 'FunctionDeclaration') { it.name = d.id.name; it.kind = 'fn'; topKind.set(it.name, 'fn'); }
  else if (d.type === 'IfStatement') { it.kind = 'if'; it.name = '<if>'; }
  else if (d.type === 'ExportNamedDeclaration' || d.type === 'ExportDefaultDeclaration') { it.kind = d.type === 'ExportDefaultDeclaration' ? 'default' : 'exportlist'; it.name = '<' + it.kind + '>'; }
  else throw new Error('unhandled top-level ' + d.type);
}
// assign module
const STATE_CONST = new Set(['_scratchFocusScreen', '_cardFetchImages', '_cardFetchPendingIds']);
for (const it of items) {
  if (it.kind === 'let' || STATE_CONST.has(it.name)) it.mod = 'cctvState';
  else if (it.kind === 'const') it.mod = fnModule.get(it.name) || 'cctvConstants';
  else if (it.kind === 'fn') { it.mod = fnModule.get(it.name); if (!it.mod) throw new Error('unmapped fn ' + it.name); }
  else if (it.kind === 'if') it.mod = 'cctvAmbientCards';
  else it.mod = 'cctv'; // export list / default / cctvLayer handled below
  if (it.kind === 'const' && it.name === 'cctvLayer') it.mod = 'cctv';
}
const declMod = new Map(items.filter(i => i.name && !i.name.startsWith('<')).map(i => [i.name, i.mod]));

// ---- imports of original file ---------------------------------------------------------------
const importOf = new Map(); // local -> {decl, spec}
for (const n of ast.body) if (n.type === 'ImportDeclaration') for (const s of n.specifiers) importOf.set(s.local.name, { decl: n, spec: s });

// ---- edits -----------------------------------------------------------------------------------
const edits = [];
const needExport = new Set();
const refsByPos = []; // {pos,name}
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
let layerItem;
for (const it of items) {
  if (it.kind === 'let') {
    // initializer may reference other state
    const init = it.inner.declarations[0].init;
    if (init) collect({ type: 'ExpressionStatement', expression: init, start: init.start, end: init.end });
    continue;
  }
  if (it.kind === 'exportlist' || it.kind === 'default') { refsByPos.push({ pos: it.node.start, name: it.kind === 'default' ? 'cctvLayer' : 'CCTV_FOCUS_RESULT' }); continue; }
  if (it.name === 'cctvLayer') { layerItem = it; }
  collect(it.inner.type === 'VariableDeclaration' || it.inner.type === 'FunctionDeclaration' || it.inner.type === 'IfStatement' ? it.inner : it.inner);
}
edits.sort((a, b) => a.start - b.start);
for (let i = 1; i < edits.length; i++) if (edits[i].start < edits[i - 1].end) throw new Error('overlapping edits');
function render(a, b) {
  let out = '', pos = a;
  for (const e of edits) { if (e.end <= a || e.start >= b) continue; out += src.slice(pos, e.start) + e.text; pos = e.end; }
  return out + src.slice(pos, b);
}

// ---- cctvLayer extraction --------------------------------------------------------------------
const layerObj = layerItem.inner.declarations[0].init;
const layerExtracted = []; // {name, fnName, start, end}
for (const p of layerObj.properties) {
  if (p.type === 'Property' && !p.computed && LAYER_METHODS[p.key.name]) {
    layerExtracted.push({ prop: p.key.name, fnName: LAYER_METHODS[p.key.name], start: p.value.start, end: p.value.end, node: p.value, method: p.method, pStart: p.start, pEnd: p.end, isAsync: p.value.async });
  }
}
// ---- build module pieces ---------------------------------------------------------------------
const mods = new Map(); // mod -> {chunks:[], refs:Set, exportsNeeded}
const getMod = (m) => { if (!mods.has(m)) mods.set(m, { chunks: [], refs: new Set(), parts: [] }); return mods.get(m); };
function refsIn(a, b) { return refsByPos.filter(r => r.pos >= a && r.pos < b).map(r => r.name); }
const facade = []; // {name, mod}
for (const it of items) {
  if (it.mod === 'cctv') continue;
  const M = getMod(it.mod);
  if (it.kind === 'let') continue; // built separately
  let text = render(it.start, it.end);
  M.parts.push({ it, text });
  for (const r of refsIn(it.node.start, it.end)) M.refs.add(r);
}
// state module
{
  const M = getMod('cctvState');
  M.stateProps = items.filter(i => i.kind === 'let').map(i => ({ it: i, text: render(i.start, i.end) }));
  for (const i of items.filter(i => i.kind === 'let')) for (const r of refsIn(i.inner.start, i.end)) M.refs.add(r);
}
// layer lifecycle module
const P = getMod('cctv'); P.parts = []; 
const LL = getMod('cctvLayerLifecycle');
for (const ex of layerExtracted) {
  let t = render(ex.start, ex.end);
  if (ex.method) {
    if (!t.startsWith('(')) throw new Error('unexpected method value ' + ex.prop);
    t = `${ex.isAsync ? 'async ' : ''}function ${ex.fnName}` + t;
  } else {
    const re = /^(async\s+)?function\s*\*?\s*[\w$]*\s*\(/;
    if (!re.test(t)) throw new Error('unexpected method form ' + ex.prop + ': ' + t.slice(0, 40));
    t = t.replace(re, (m, a) => `${a || ''}function ${ex.fnName}(`);
  }
  const leading = src.slice(0, 0);
  ex.text = 'export ' + t;
  LL.parts.push({ it: { name: ex.fnName, kind: 'fn', start: ex.start, end: ex.end, node: ex.node }, text: ex.text, layerMethod: ex });
  for (const r of refsIn(ex.start, ex.end)) LL.refs.add(r);
}
// parent: layer text with methods replaced by names
let layerText = '';
{
  let pos = layerItem.start;
  const sorted = [...layerExtracted].sort((a, b) => a.start - b.start);
  for (const ex of sorted) {
    if (ex.method) { layerText += render(pos, ex.pStart) + `${ex.prop}: ${ex.fnName}`; pos = ex.pEnd; }
    else { layerText += render(pos, ex.start) + ex.fnName; pos = ex.end; }
  }
  layerText += render(pos, layerItem.end);
  for (const r of refsIn(layerItem.node.start, layerItem.end)) {
    if (!layerExtracted.some(ex => refsByPos.find(x => x.pos >= ex.start && x.pos < ex.end && x.name === r && false))) P.refs.add(r);
  }
  // exclude refs inside extracted ranges from parent
  P.refs = new Set(refsByPos.filter(r => r.pos >= layerItem.node.start && r.pos < layerItem.end && !layerExtracted.some(ex => r.pos >= ex.start && r.pos < ex.end)).map(r => r.name));
  for (const ex of layerExtracted) P.refs.add(ex.fnName);
}
P.refs.add('CCTV_FOCUS_RESULT'); P.refs.add('cctvLayer');
// ---- which names need export & imports --------------------------------------------------------
const modOfName = (n) => declMod.get(n) || (layerExtracted.find(e => e.fnName === n) ? 'cctvLayerLifecycle' : null);
const importsByMod = new Map();
for (const [mname, M] of mods) {
  const local = new Map(); // srcModule -> Set names
  const orig = new Map(); // decl -> set of specifiers
  const namesHere = new Set([...M.parts.map(p => p.it.name), ...(M.stateProps || []).map(p => p.it.name)]);
  if (mname === 'cctvState') namesHere.add('S');
  for (const r of M.refs) {
    if (lets.has(r)) { if (mname !== 'cctvState') { (local.get('cctvState') || local.set('cctvState', new Set()).get('cctvState')).add('S'); } continue; }
    if (namesHere.has(r)) continue;
    const tm = modOfName(r);
    if (tm && tm !== mname) { (local.get(tm) || local.set(tm, new Set()).get(tm)).add(r); needExport.add(r); continue; }
    if (importOf.has(r)) { const { decl, spec } = importOf.get(r); (orig.get(decl) || orig.set(decl, new Set()).get(decl)).add(spec); }
  }
  importsByMod.set(mname, { local, orig });
}
// modules that reference lets need S; state module itself may reference constants
function importLines(mname, isParent) {
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
  for (const [tm, names] of [...local].sort()) lines.push(`import { ${[...names].sort().join(', ')} } from './${tm}.js';`);
  return lines;
}
// ---- export insertion (needExport) -----------------------------------------------------------
function withExport(part) {
  const it = part.it;
  if (part.layerMethod) return part.text; // already exported
  if (it.exported) return part.text;
  if (!needExport.has(it.name)) return part.text;
  // insert `export ` at inner.start relative to chunk start
  const rel = it.inner.start - it.start;
  // account for edits before inner.start within the chunk (only comments precede -> none)
  return part.text.slice(0, rel) + 'export ' + part.text.slice(rel);
}
// originally-exported names -> facade from owning module
const origExports = [];
for (const it of items) if (it.exported) origExports.push(it.name);
const facadeBy = new Map();
for (const n of origExports) { const m = declMod.get(n); if (m === 'cctv') continue; (facadeBy.get(m) || facadeBy.set(m, []).get(m)).push(n); }

// ---- assemble ----------------------------------------------------------------------------------
const outFiles = new Map();
function header(m) { return HEADERS[m].split('\n').map(l => '// ' + l).join('\n') + '\n'; }
for (const [mname, M] of mods) {
  if (mname === 'cctv') continue;
  let body = '';
  if (mname === 'cctvState') {
    const consts = M.parts.map(p => withExport(p)).map(t => t.replace(/^(\s*(\/\*\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*)(const )/, '$1export $3'));
    body += consts.join('\n\n') + '\n\n';
    body += '/** Mutable layer state (formerly module-private `let` variables of cctv.js). */\nexport const S = {\n';
    body += M.stateProps.map(p => {
      const d = p.it.inner.declarations[0];
      const lead = src.slice(p.it.start, p.it.inner.start).replace(/^\s+/, '').split('\n').map(l => l ? '  ' + l.trim() : l).join('\n');
      let init = d.init ? render(d.init.start, d.init.end) : 'undefined';
      const trail = src.slice(d.init ? d.init.end : d.id.end, p.it.end).replace(/^\s*;/, '');
      return (lead ? lead.replace(/\s+$/, '') + '\n' : '') + `  ${d.id.name}: ${init},${trail}`;
    }).join('\n') + '\n};\n';
  } else {
    body += M.parts.map(p => withExport(p)).join('\n\n') + '\n';
  }
  const imps = importLines(mname).join('\n');
  outFiles.set(mname + '.js', header(mname) + '\n' + imps + '\n\n' + body);
}
// parent
{
  const facadeLines = [...facadeBy].sort().map(([m, names]) => `export { ${names.sort().join(', ')} } from './${m}.js';`);
  const exportList = items.find(i => i.kind === 'exportlist');
  const layerLead = src.slice(layerItem.start, layerItem.inner.start);
  const imps = importLines('cctv').join('\n');
  const defaultItem = items.find(i => i.kind === 'default');
  const head = src.slice(0, ast.body.find(n => n.type === 'ImportDeclaration').start);
  const text = head.replace(/\s+$/, '') + '\n\n' + imps + '\n\n' + facadeLines.join('\n') + '\n' + src.slice(exportList.start, exportList.end) + '\n\n' + layerText + '\n\n' + src.slice(defaultItem.start, defaultItem.end) + '\n';
  outFiles.set('cctv.js', text);
}
// ---- report --------------------------------------------------------------------------------------
const orig = src.split('\n').length;
console.log('original lines', orig, 'edits(S rewrites)', edits.length, 'needExport', needExport.size);
for (const [f, t] of [...outFiles].sort()) console.log(String(t.split('\n').length).padStart(5), f);
// TDZ/cycle hazard: import-time-evaluated modules importing function modules
for (const m of ['cctvConstants', 'cctvState']) {
  const { local } = importsByMod.get(m);
  const bad = [...local].filter(([tm]) => tm !== 'cctvConstants' && tm !== 'cctvState');
  if (bad.length) console.log('HAZARD', m, 'imports from', bad.map(([tm, n]) => tm + ':' + [...n].join(',')).join(' '));
}
const stateImportsConst = importsByMod.get('cctvState').local.get('cctvConstants');
if (stateImportsConst) console.log('state imports constants:', [...stateImportsConst].join(' '));
const constImportsState = importsByMod.get('cctvConstants').local.get('cctvState');
if (constImportsState) console.log('HAZARD constants imports state');
if (WRITE) {
  fs.mkdirSync('scripts/tmp-split/out', { recursive: true });
  for (const [f, t] of outFiles) fs.writeFileSync(path.join(OUT_DIR, f), t);
  fs.writeFileSync('scripts/tmp-split/meta.json', JSON.stringify({ lets: [...lets], mods: [...outFiles.keys()] }));
  console.log('written');
}
