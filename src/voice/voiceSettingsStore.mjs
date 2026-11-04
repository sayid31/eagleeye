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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
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
    fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
    try {
      if (fileSystem.lstatSync(filePath).isSymbolicLink()) {
        throw new Error('voice settings path is a symlink; refusing to write');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const temp = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    let fd;
    try {
      fd = fileSystem.openSync(temp, 'wx', 0o600);
      fileSystem.writeSync(fd, `${JSON.stringify(settings, null, 2)}\n`);
      fileSystem.fsyncSync(fd);
      fileSystem.closeSync(fd);
      fd = undefined;
      fileSystem.renameSync(temp, filePath);
    } catch (error) {
      if (fd !== undefined) fileSystem.closeSync(fd);
      try { fileSystem.unlinkSync(temp); } catch { /* temp may not exist; nothing to clean */ }
      throw new Error(`Failed to save voice settings: ${error.message}`);
    }
  }

  return { read, write, filePath };
}
