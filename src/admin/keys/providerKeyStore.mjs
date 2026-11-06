// src/admin/keys/providerKeyStore.mjs
/**
 * The provider-key credential store behind POWER UP and /admin → API Keys.
 * Moved out of vite.config.js unchanged in behavior; both HTTP surfaces
 * (`legacyKeySetupPlugin.mjs`, `adminKeysRoutes.mjs`) are thin shells over it.
 *
 * Which store this launch owns: a Pinokio-managed launch writes the app-scoped
 * `pinokio/ENVIRONMENT`; every other launch writes the repo-root `.env` that
 * Vite's loadEnv reads. A key supplied by any other workflow (shell export,
 * Keychain via dev-fresh.sh, …) is `external` and can be neither replaced nor
 * removed here.
 *
 * Never returns, logs or echoes a key value. Node-only.
 *
 * @module admin/keys/providerKeyStore
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseEnv as parseDotenvText } from 'node:util';
import { readEnvironmentSource as readPinokioEnvironmentSource } from '../../../scripts/pinokio-environment.mjs';
import {
  isKeySetupExternallyManaged, keySetupStatus, upsertDotenvValues, validateKeySetupUpdates,
} from '../../keySetupCore.mjs';
import { hardenCredentialFile } from '../../keySetupHardening.mjs';

/**
 * @param {object} options
 * @param {string} options.rootDir Repo root (where `.env` and `pinokio/` live).
 * @param {string | undefined} options.launcherAtBoot `GEV_LAUNCHER` captured before loadEnv.
 * @param {Record<string, string>} options.providerEnvAtBoot Provider values before loadEnv ('' = absent).
 * @param {Set<string>} options.devFreshExternalAtBoot Names dev-fresh.sh marked as external.
 * @param {Record<string, string | undefined>} [options.env] Live environment (process.env).
 * @param {typeof fs} [options.fileSystem]
 * @param {(file: string) => boolean} [options.harden] Restrict a file to the current account.
 */
export function createProviderKeyStore({
  rootDir, launcherAtBoot, providerEnvAtBoot, devFreshExternalAtBoot,
  env = process.env, fileSystem = fs, harden = hardenCredentialFile,
}) {
  // The launcher marker comes from the BOOT environment: a stray
  // `GEV_LAUNCHER=pinokio` line in someone's .env must never redirect a plain
  // `npm run dev` to write the Pinokio store it never loaded.
  const pinokioManaged = () => launcherAtBoot === 'pinokio';
  const storeName = () => (pinokioManaged() ? 'pinokio-environment' : 'env-file');
  const storePath = () => path.join(rootDir, ...(pinokioManaged() ? ['pinokio', 'ENVIRONMENT'] : ['.env']));

  // Only ENOENT means empty. Every other failure must ABORT a save: upserting
  // into a wrongly-empty string and atomically replacing the file would
  // destroy every other provider key the user had configured.
  const readStore = () => {
    try {
      // The Pinokio launcher supports a UTF-16 ENVIRONMENT; reuse its decoder.
      // We always write back UTF-8, which is what the launcher normalizes to.
      if (pinokioManaged()) return readPinokioEnvironmentSource(storePath());
      return fileSystem.readFileSync(storePath(), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return '';
      const unreadable = new Error('the existing configuration could not be read, so nothing was changed');
      unreadable.code = 'GEV_STORE_UNREADABLE';
      throw unreadable;
    }
  };

  // Status must never fail because the store is unreadable — it reports the
  // LIVE environment; an unreadable store only costs file/external attribution.
  const storeValues = () => {
    try {
      return parseDotenvText(readStore());
    } catch {
      return {};
    }
  };

  // Boot provenance closes the equal-value ambiguity: an exported X remains
  // external even when the editable store independently contains X.
  const isExternallyManaged = (name, inStore) => {
    const wasExternalAtBoot = pinokioManaged()
      ? false
      : launcherAtBoot === 'dev-fresh'
        ? devFreshExternalAtBoot.has(name)
        : providerEnvAtBoot[name] !== '';
    return isKeySetupExternallyManaged({ effectiveValue: env[name], storedValue: inStore[name], wasExternalAtBoot });
  };

  /** Registry + presence + source ('file' editable / 'external' read-only). Never a value. */
  const status = () => {
    const inStore = storeValues();
    const result = keySetupStatus(env);
    for (const key of result.keys) {
      key.managed = key.set
        ? (key.envVars.some((name) => isExternallyManaged(name, inStore)) ? 'external' : 'file')
        : null;
    }
    return { ...result, store: storeName() };
  };

  // Fresh same-dir temp created 0600 'wx', hardened BEFORE the secret touches
  // it (Windows ACL inheritance), full write loop, fsync, rename over target.
  const persistStore = (text) => {
    const filepath = storePath();
    try {
      if (fileSystem.lstatSync(filepath).isSymbolicLink()) {
        throw new Error('refusing to write a credential store that is a symlink');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    // Random suffix, not the pid: a stale temp would otherwise make every
    // later save in this process fail EEXIST forever.
    const tmp = path.join(path.dirname(filepath), `.${path.basename(filepath)}.${randomUUID().slice(0, 8)}.tmp`);
    const fd = fileSystem.openSync(tmp, 'wx', 0o600);
    let staged = false;
    try {
      if (!harden(tmp)) {
        const error = new Error('could not restrict the credential file to your account; nothing was saved');
        error.code = 'GEV_HARDEN_FAILED';
        throw error;
      }
      const buffer = Buffer.from(text, 'utf8');
      let written = 0;
      while (written < buffer.length) {
        written += fileSystem.writeSync(fd, buffer, written, buffer.length - written);
      }
      fileSystem.fsyncSync(fd);
      staged = true;
    } finally {
      fileSystem.closeSync(fd);
      if (!staged) fileSystem.rmSync(tmp, { force: true });
    }
    try {
      fileSystem.renameSync(tmp, filepath);
    } catch (error) {
      fileSystem.rmSync(tmp, { force: true });
      throw error;
    }
  };

  /**
   * Validate and persist `{ENV_VAR: value | null}` (null = remove), then make
   * the values live on `env` for the server-side proxies. The caller restarts
   * the dev server so the client-exposed defines re-inject.
   *
   * @param {unknown} body Parsed JSON request body.
   * @returns {{ok: true, saved: string[], removed: string[]} | {ok: false, httpStatus: number, error: string}}
   */
  const applyUpdates = (body) => {
    const verdict = validateKeySetupUpdates(body);
    if (!verdict.ok) return { ok: false, httpStatus: 400, error: verdict.error };
    // Neither replace NOR remove may touch an externally-supplied credential.
    const inStore = storeValues();
    for (const name of Object.keys(verdict.updates)) {
      if (isExternallyManaged(name, inStore)) {
        return { ok: false, httpStatus: 409, error: `${name} is configured outside Provider Settings and can only be changed where it was set` };
      }
    }
    try {
      persistStore(upsertDotenvValues(readStore(), verdict.updates));
    } catch (error) {
      // Hardening/unreadable failures carry an honest, path-free message.
      // Anything else gets a fixed message: a raw fs error can carry a path.
      if (error?.code === 'GEV_HARDEN_FAILED' || error?.code === 'GEV_STORE_UNREADABLE') {
        return { ok: false, httpStatus: 500, error: `The key was not saved: ${error.message}` };
      }
      console.warn(`[KeySetup] write to the ${storeName()} store failed: ${error?.code || 'unknown error'}`);
      return { ok: false, httpStatus: 500, error: `Could not write the ${storeName()} store` };
    }
    // Removal sets '' rather than deleting: an empty value stays falsy through
    // loadEnv after restart, matching the Pinokio launcher's blank semantics.
    for (const [name, value] of Object.entries(verdict.updates)) env[name] = value === null ? '' : value;
    const names = Object.keys(verdict.updates);
    return {
      ok: true,
      saved: names.filter((name) => verdict.updates[name] !== null),
      removed: names.filter((name) => verdict.updates[name] === null),
    };
  };

  return { status, applyUpdates, storeName, storePath };
}

/**
 * One deliberate dev-server restart, after the response has flushed. Vite's
 * own .env watcher may fire too; a second queued restart is harmless.
 * @param {{restart: () => Promise<void>}} server
 */
export function scheduleDevServerRestart(server, delayMs = 250) {
  setTimeout(() => {
    server.restart().catch((error) => {
      console.warn('[KeySetup] Dev-server restart failed:', error?.message || error);
    });
  }, delayMs);
}
