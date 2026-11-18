// scripts/qa-ui/isolation.mjs
/**
 * Build-output checks that Tailwind stays inside the React entries (plan/refaktor-ui/01 §Isolasi):
 *  - dist/index.html (the map) links no CSS carrying Tailwind's banner or `--tw-` variables, and its CSS is
 *    byte-identical to the base build (size + sha256, scripts/qa-ui/isolation-baseline.json);
 *  - no JS reachable from the map's entry contains React or Radix;
 *  - admin.html and login.html link the Tailwind CSS; landing.html does not;
 *  - admin/login/landing make no third-party request (no http(s) host in the HTML or its CSS).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TAILWIND_SIGNATURE = /\/\*! tailwindcss v\d|--tw-[a-z]/;
const REACT_SIGNATURE = /react\.transitional\.element|data-radix-/;

const read = (dist, href) => fs.readFileSync(path.join(dist, href.replace(/^\//, '')), 'utf8');
const cssLinks = (html) => [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]).filter((href) => href.startsWith('/assets/'));
const jsRefs = (html) => [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+)"/g)].map((m) => m[1]).filter((href) => href.startsWith('/assets/'));

/** Every chunk reachable through static `import … from "./x.js"` edges from the given entries. */
export function staticJsGraph(dist, entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const href = queue.pop();
    if (seen.has(href)) continue;
    seen.add(href);
    const source = read(dist, href);
    for (const match of source.matchAll(/(?:^|[;}\s,])(?:import|export)\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g)) queue.push(`/assets/${match[1]}`);
  }
  return [...seen];
}

/**
 * @param {string} dist Build output directory.
 * @param {{mapCss: {bytes: number, sha256: string}}} baseline
 * @returns {{failures: string[], facts: Record<string, unknown>}}
 */
export function checkIsolation(dist, baseline) {
  const failures = [];
  const facts = {};
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const mapCss = cssLinks(index);
  facts.mapCssFiles = mapCss;
  for (const href of mapCss) {
    const css = read(dist, href);
    if (TAILWIND_SIGNATURE.test(css)) failures.push(`map CSS ${href} contains Tailwind output`);
    const bytes = Buffer.byteLength(css);
    const sha256 = crypto.createHash('sha256').update(css).digest('hex');
    facts.mapCss = { bytes, sha256 };
    if (bytes !== baseline.mapCss.bytes || sha256 !== baseline.mapCss.sha256) failures.push(`map CSS changed vs the base build: ${bytes} B (base ${baseline.mapCss.bytes} B), sha256 ${sha256.slice(0, 12)}…`);
  }
  if (mapCss.length === 0) failures.push('dist/index.html links no /assets CSS (build layout changed?)');
  const graph = staticJsGraph(dist, jsRefs(index));
  facts.mapJsChunks = graph.length;
  for (const href of graph) if (REACT_SIGNATURE.test(read(dist, href))) failures.push(`map JS chunk ${href} contains React/Radix`);

  for (const page of ['admin.html', 'login.html']) {
    const html = fs.readFileSync(path.join(dist, page), 'utf8');
    if (!cssLinks(html).some((href) => /tailwindcss v\d/.test(read(dist, href)))) failures.push(`${page} does not link the Tailwind CSS`);
  }
  for (const page of ['admin.html', 'login.html', 'landing.html']) {
    const html = fs.readFileSync(path.join(dist, page), 'utf8');
    const external = [...html.matchAll(/(?:src|href)="((?:https?:)?\/\/[^"]+)"/g)].map((m) => m[1]);
    if (external.length) failures.push(`${page} loads from another origin: ${external.join(', ')}`);
    for (const href of cssLinks(html)) if (/url\(\s*['"]?(?:https?:)?\/\//.test(read(dist, href))) failures.push(`${href} (${page}) requests another origin`);
  }
  const landingCss = cssLinks(fs.readFileSync(path.join(dist, 'landing.html'), 'utf8'));
  for (const href of landingCss) if (TAILWIND_SIGNATURE.test(read(dist, href))) failures.push(`landing CSS ${href} contains Tailwind output`);
  return { failures, facts };
}
