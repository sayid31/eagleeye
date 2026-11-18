// scripts/qa-ui/server.mjs
/**
 * Starts an isolated dev server for the UI gate: its own port, a throwaway auth database in a temp directory, a random
 * 64-hex secret (never printed), keyless providers. Never touches the owner's server or database.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QA_SUPER_ADMIN_EMAIL = 'dev@example.test';
const START_TIMEOUT_MS = 90_000;

/** Env for a throwaway server; also what the session minter must see (same secret, same database). */
export function throwawayEnv(port, dir) {
  return {
    BETTER_AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
    SUPER_ADMIN_EMAILS: QA_SUPER_ADMIN_EMAIL,
    BETTER_AUTH_URL: `http://localhost:${port}`,
    AUTH_DATABASE_FILE: path.join(dir, 'auth.db'),
  };
}

async function waitForServer(url, child, log) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Dev server exited early (code ${child.exitCode}); see ${log}`);
    try {
      const response = await fetch(`${url}/login`, { redirect: 'manual' });
      if (response.status > 0 && response.status < 500) return;
    } catch {
      // Not listening yet: keep polling until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Dev server did not answer within ${START_TIMEOUT_MS / 1000}s; see ${log}`);
}

/**
 * @param {{port: number}} options
 * @returns {Promise<{url: string, env: Record<string, string>, dir: string, stop: () => Promise<void>}>}
 */
export async function startIsolatedServer({ port }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-ui-server-'));
  const env = throwawayEnv(port, dir);
  const log = path.join(dir, 'server.log');
  const out = fs.openSync(log, 'w');
  const viteBin = path.join(REPO_ROOT, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: REPO_ROOT, env: { ...process.env, ...env }, stdio: ['ignore', out, out],
  });
  const url = `http://localhost:${port}`;
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 5000); });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    await waitForServer(url, child, log);
  } catch (error) {
    await stop();
    throw error;
  }
  return { url, env, dir, stop };
}
