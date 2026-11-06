// src/voice/voiceUsageStore.mjs
/**
 * Disk persistence for the daily voice-usage ledger (`voiceUsageCore.mjs`):
 * one JSON file next to the voice settings, never the `.env` key file. Reads
 * never throw (missing or corrupt = empty ledger); writes are atomic.
 *
 * @module voice/voiceUsageStore
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeJsonFileAtomic } from '../server/atomicJsonFile.mjs';
import { addUsage, emptyLedger, localDayKey, normalizeLedger } from './voiceUsageCore.mjs';

/** Default location: `<repo>/.gev-cache/voice-usage.json` (gitignored). */
export const DEFAULT_VOICE_USAGE_PATH = fileURLToPath(
  new URL('../../.gev-cache/voice-usage.json', import.meta.url),
);

/**
 * @param {{filePath?: string, fileSystem?: typeof fs, now?: () => Date}} [options]
 */
export function createVoiceUsageStore({ filePath = DEFAULT_VOICE_USAGE_PATH, fileSystem = fs, now = () => new Date() } = {}) {
  function read() {
    let text;
    try {
      text = fileSystem.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyLedger();
      console.warn(`[voice-usage] ledger unreadable, treating as empty: ${error?.code || error?.message}`);
      return emptyLedger();
    }
    try {
      return normalizeLedger(JSON.parse(text));
    } catch {
      console.warn('[voice-usage] ledger is not valid JSON, treating as empty');
      return emptyLedger();
    }
  }

  /**
   * Add one validated session report to today's row and persist.
   * @param {{seconds: number, extrasUsd: number}} report
   */
  function record(report) {
    const next = addUsage(read(), localDayKey(now()), report);
    writeJsonFileAtomic(filePath, next, { fileSystem, label: 'voice usage' });
    return next;
  }

  return { read, record, today: () => localDayKey(now()), filePath };
}
