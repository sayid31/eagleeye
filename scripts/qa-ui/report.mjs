// scripts/qa-ui/report.mjs
/** Console + JSON report of a qa-ui run. Failures are listed in full; moderate axe findings and console noise are counted. */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {{matrix: object[], probes: object[], isolation: {failures: string[], facts: object} | null, contrast: {ok: boolean, line: string} | null, runDir: string}} run
 * @returns {{failed: boolean, text: string}}
 */
export function buildReport({ matrix, probes, isolation, contrast, runDir }) {
  const lines = [];
  const failedCells = matrix.filter((cell) => cell.failures.length);
  const failedProbes = probes.filter((probe) => !probe.ok);
  const moderate = matrix.flatMap((cell) => cell.axe.other.map((violation) => ({ cell, violation })));
  const consoleCells = matrix.filter((cell) => cell.console.length);

  lines.push(`qa:ui — ${matrix.length} page runs, ${probes.length} probes`);
  lines.push(`  pages with failures:   ${failedCells.length}/${matrix.length}`);
  lines.push(`  probes failed:         ${failedProbes.length}/${probes.length}`);
  lines.push(`  axe moderate/minor:    ${moderate.length} finding(s) (reported, not blocking)`);
  lines.push(`  console not clean:     ${consoleCells.length} run(s)`);
  if (contrast) lines.push(`  contrast:              ${contrast.ok ? 'ok' : 'FAIL'} — ${contrast.line}`);
  if (isolation) lines.push(`  isolation:             ${isolation.failures.length ? `${isolation.failures.length} FAIL` : 'ok'}`);
  lines.push('');

  for (const cell of failedCells) {
    lines.push(`FAIL ${cell.role}/${cell.pageId} ${cell.theme}/${cell.viewport}`);
    for (const failure of cell.failures) lines.push(`     - ${failure}`);
  }
  for (const probe of failedProbes) lines.push(`FAIL probe ${probe.id}: ${probe.error}`);
  for (const failure of isolation?.failures ?? []) lines.push(`FAIL isolation: ${failure}`);
  const unique = new Map();
  for (const { cell, violation } of moderate) unique.set(`${violation.rule}|${cell.pageId}`, `${violation.impact} ${violation.rule} on ${cell.pageId} (${violation.count}): ${violation.help}`);
  for (const text of [...unique.values()].slice(0, 25)) lines.push(`note ${text}`);
  const consoleSeen = new Map();
  for (const cell of consoleCells) for (const message of cell.console) consoleSeen.set(message, [...(consoleSeen.get(message) ?? []), cell.pageId]);
  for (const [message, pages] of [...consoleSeen].slice(0, 15)) lines.push(`console ${message.slice(0, 160)}  (${[...new Set(pages)].slice(0, 4).join(', ')})`);
  lines.push('', `screenshots + report.json: ${runDir}`);

  const failed = failedCells.length > 0 || failedProbes.length > 0 || (isolation?.failures.length ?? 0) > 0 || contrast?.ok === false;
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({ matrix, probes, isolation, contrast }, null, 2));
  return { failed, text: lines.join('\n') };
}
