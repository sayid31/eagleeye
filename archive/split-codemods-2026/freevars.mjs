import fs from 'node:fs';
import { load, eachRef, patternNames } from './lib.mjs';
const mods = new Map(process.argv.slice(2).map(f => [f, load(f)]));
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
