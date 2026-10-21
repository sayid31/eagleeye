/**
 * overpassDiskBudget.mjs — size bound for the Overpass disk cache.
 *
 * The disk layer had no eviction of any kind: `readOverpassDisk` filters
 * expired entries on READ, but nothing ever deleted a file, so the directory
 * only grew (measured 2026-10-21: 939 files / 369 MB accumulated over 47 days
 * of ordinary use). That was tolerable while the road TTL was 7 days and the
 * entries were effectively dead weight; raising it to 60 days makes the
 * directory a long-lived store, which it has to be bounded to be.
 *
 * Eviction is least-recently-cached-first, by the `cachedAt` already stored in
 * each payload, falling back to file mtime for anything unparseable. The
 * planning step is a pure function of (entries, budget) so it tests without
 * touching a filesystem.
 *
 * Node-only (imported by overpassCore.mjs via vite.config.js), never bundled
 * for the browser.
 *
 * @module data/overpassDiskBudget
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';

/**
 * Disk budget for the Overpass cache (bytes) — 600 MB.
 *
 * Chosen above the 369 MB that 47 days of real use produced, so ordinary
 * exploration never evicts anything, while a pathological session (or the
 * multi-MB boundary pivots) cannot fill a laptop disk. Road payloads dominate
 * the directory, and losing the coldest ones only costs a refetch.
 */
export const OVERPASS_DISK_BUDGET_BYTES = 600 * 1024 * 1024;

/**
 * Decide which cache files to delete to get back under budget.
 *
 * Evicts coldest-first and stops as soon as the total fits, so a cache already
 * under budget plans no deletions at all.
 *
 * @param {Array<{file:string,size:number,cachedAt:number}>} entries Cache files.
 * @param {number} [budgetBytes] Size ceiling.
 * @returns {{evict:string[],totalBytes:number,freedBytes:number}}
 */
export function planOverpassDiskEviction(entries, budgetBytes = OVERPASS_DISK_BUDGET_BYTES) {
  const list = (entries || []).filter((e) => e && typeof e.file === 'string');
  const totalBytes = list.reduce((sum, e) => sum + (Number(e.size) || 0), 0);
  if (totalBytes <= budgetBytes) return { evict: [], totalBytes, freedBytes: 0 };

  // Coldest first; ties broken by name so the plan is deterministic in tests.
  const byAge = [...list].sort(
    (a, b) => (Number(a.cachedAt) || 0) - (Number(b.cachedAt) || 0) || a.file.localeCompare(b.file),
  );
  const evict = [];
  let freedBytes = 0;
  for (const entry of byAge) {
    if (totalBytes - freedBytes <= budgetBytes) break;
    evict.push(entry.file);
    freedBytes += Number(entry.size) || 0;
  }
  return { evict, totalBytes, freedBytes };
}

/**
 * Read one cache file's size and cache timestamp.
 *
 * Prefers the `cachedAt` inside the payload over mtime, because a payload
 * rewritten in place keeps its original age in that field. Unreadable or
 * unparseable files report mtime so they stay evictable rather than immortal.
 *
 * @param {string} dir Cache directory.
 * @param {string} file File name within it.
 * @returns {Promise<?{file:string,size:number,cachedAt:number}>} Null if unreadable.
 */
export async function statOverpassDiskEntry(dir, file) {
  const full = path.join(dir, file);
  try {
    const stat = await fsp.stat(full);
    if (!stat.isFile()) return null;
    let cachedAt = stat.mtimeMs;
    try {
      const parsed = JSON.parse(await fsp.readFile(full, 'utf8'));
      if (Number.isFinite(parsed?.cachedAt)) cachedAt = parsed.cachedAt;
    } catch { /* keep mtime — an unparseable entry must stay evictable */ }
    return { file, size: stat.size, cachedAt };
  } catch {
    return null;
  }
}

/**
 * Bring the Overpass disk cache back under its size budget.
 *
 * Safe to call concurrently with reads and writes: a deleted entry is a cache
 * miss, never a corrupt response, and an already-deleted file is ignored.
 *
 * @param {string} dir Cache directory.
 * @param {{budgetBytes?:number}} [opts]
 * @returns {Promise<{evicted:number,freedBytes:number,totalBytes:number}>}
 */
export async function enforceOverpassDiskBudget(dir, opts = {}) {
  const { budgetBytes = OVERPASS_DISK_BUDGET_BYTES } = opts;
  let files;
  try {
    files = await fsp.readdir(dir);
  } catch {
    // No cache directory yet — nothing to bound.
    return { evicted: 0, freedBytes: 0, totalBytes: 0 };
  }
  const entries = (await Promise.all(
    files.filter((f) => f.endsWith('.json')).map((f) => statOverpassDiskEntry(dir, f)),
  )).filter(Boolean);

  const plan = planOverpassDiskEviction(entries, budgetBytes);
  let evicted = 0;
  for (const file of plan.evict) {
    try {
      await fsp.unlink(path.join(dir, file));
      evicted += 1;
    } catch { /* already gone, or a concurrent write owns it — not an error */ }
  }
  return { evicted, freedBytes: plan.freedBytes, totalBytes: plan.totalBytes };
}

/** Writes since the last sweep. The sweep stats the whole directory, so it is not per-write. */
let _writesSinceSweep = 0;

/** Cache writes allowed between disk-budget sweeps. */
export const OVERPASS_SWEEP_EVERY_WRITES = 25;

/**
 * Count a cache write and sweep the directory once every
 * `OVERPASS_SWEEP_EVERY_WRITES` of them.
 *
 * @param {string} dir Cache directory.
 * @param {{every?:number,budgetBytes?:number}} [opts]
 * @returns {Promise<?{evicted:number,freedBytes:number,totalBytes:number}>} Null when no sweep ran.
 */
export async function noteOverpassDiskWrite(dir, opts = {}) {
  const { every = OVERPASS_SWEEP_EVERY_WRITES } = opts;
  _writesSinceSweep += 1;
  if (_writesSinceSweep < every) return null;
  _writesSinceSweep = 0;
  const result = await enforceOverpassDiskBudget(dir, opts);
  if (result.evicted) {
    console.log(
      `[Overpass Proxy] disk cache trimmed: ${result.evicted} entr${result.evicted === 1 ? 'y' : 'ies'}, `
      + `${Math.round(result.freedBytes / 1e6)} MB freed`,
    );
  }
  return result;
}

/** Forget the write count so a sweep is a fixed number of writes away. Exported for tests. */
export function _resetOverpassSweepCounter() {
  _writesSinceSweep = 0;
}
