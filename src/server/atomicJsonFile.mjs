// src/server/atomicJsonFile.mjs
/**
 * Owner-only JSON file write shared by the voice settings and voice usage
 * stores: temp file 0600 opened 'wx', fsync, atomic rename, symlinked target
 * refused. A crash mid-write leaves the old file intact.
 *
 * @module server/atomicJsonFile
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * @param {string} filePath
 * @param {unknown} data Serialized with 2-space JSON plus a trailing newline.
 * @param {{fileSystem?: typeof fs, label?: string}} [options] `label` names the file in errors.
 */
export function writeJsonFileAtomic(filePath, data, { fileSystem = fs, label = 'file' } = {}) {
  fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    if (fileSystem.lstatSync(filePath).isSymbolicLink()) {
      throw new Error(`${label} path is a symlink; refusing to write`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temp = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  let fd;
  try {
    fd = fileSystem.openSync(temp, 'wx', 0o600);
    fileSystem.writeSync(fd, `${JSON.stringify(data, null, 2)}\n`);
    fileSystem.fsyncSync(fd);
    fileSystem.closeSync(fd);
    fd = undefined;
    fileSystem.renameSync(temp, filePath);
  } catch (error) {
    if (fd !== undefined) fileSystem.closeSync(fd);
    try { fileSystem.unlinkSync(temp); } catch { /* temp may not exist; nothing to clean */ }
    throw new Error(`Failed to save ${label}: ${error.message}`);
  }
}
