// src/voice/voiceSettingsStore.mjs
/**
 * Disk persistence for voice settings: one JSON file, deliberately NOT the
 * `.env` credential store, so settings and API keys never share a file.
 *
 * Writes mirror the key store's discipline (temp file 0600 'wx', fsync, atomic
 * rename, refuse a symlinked target). Reads never throw: a missing file is the
 * defaults; an unreadable or invalid file is ALSO the defaults (old behavior)
 * and is reported via `valid:false` so the panel can tell the owner.
 *
 * @module voice/voiceSettingsStore
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeJsonFileAtomic } from '../server/atomicJsonFile.mjs';
import { normalizeStoredSettings } from './voiceSettingsCore.mjs';

/** Default location: `<repo>/.gev-cache/voice-settings.json` (gitignored). */
export const DEFAULT_VOICE_SETTINGS_PATH = fileURLToPath(
  new URL('../../.gev-cache/voice-settings.json', import.meta.url),
);

/**
 * @param {{filePath?: string, fileSystem?: typeof fs}} [options]
 * @returns {{read: () => {settings: object, valid: boolean}, write: (settings: object) => void, filePath: string}}
 */
export function createVoiceSettingsStore({ filePath = DEFAULT_VOICE_SETTINGS_PATH, fileSystem = fs } = {}) {
  function read() {
    let text;
    try {
      text = fileSystem.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return normalizeStoredSettings(null);
      return { ...normalizeStoredSettings(undefined), valid: false };
    }
    try {
      return normalizeStoredSettings(JSON.parse(text));
    } catch {
      return { ...normalizeStoredSettings(undefined), valid: false };
    }
  }

  function write(settings) {
    writeJsonFileAtomic(filePath, settings, { fileSystem, label: 'voice settings' });
  }

  return { read, write, filePath };
}
