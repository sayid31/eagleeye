// src/data/overpassCoverStore.mjs
/**
 * File-backed cover index for the `/api/overpass` proxy: loads the remembered
 * road tiles at startup and writes them back atomically (owner-only, crash-safe)
 * next to the disk cache. See overpassCoverIndex.mjs for what the index does.
 *
 * @module data/overpassCoverStore
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonFileAtomic } from '../server/atomicJsonFile.mjs';
import { overpassDiskTtlMs } from './overpassDiskCache.mjs';
import { createOverpassCoverIndex } from './overpassCoverIndex.mjs';

/** Where the index lives: beside `.gev-cache/overpass/`, not inside it (the disk budget sweeps that directory). */
export const OVERPASS_COVER_INDEX_FILE = path.join(process.cwd(), '.gev-cache', 'overpass-cover-index.json');

/**
 * @param {string} [filePath]
 * @returns {ReturnType<typeof createOverpassCoverIndex>}
 */
export function createOverpassCoverStore(filePath = OVERPASS_COVER_INDEX_FILE) {
  return createOverpassCoverIndex({
    load: () => {
      try {
        const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return Array.isArray(rows) ? rows : null;
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn('[Overpass Cover] index unreadable, starting empty:', error?.message || error);
        return null;
      }
    },
    save: (rows) => writeJsonFileAtomic(filePath, rows, { label: 'Overpass cover index' }),
    ttlFor: overpassDiskTtlMs,
  });
}
