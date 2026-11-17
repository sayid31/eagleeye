/**
 * What the Vite dev server must never hand to an anonymous client.
 *
 * The dev server (also what pm2 runs on 0.0.0.0) serves every file under the
 * project root that `server.fs.deny` does not match — dotfiles included. Runtime
 * state lives under that root: the owner audit trail, the server log, voice
 * settings/usage and transcripts, the auth database, pm2 stdout/stderr. All of
 * it is denied here so a plain `GET /.gev-cache/admin-audit.jsonl` gets 403.
 *
 * Vite matches these globs (picomatch, `dot`, case-insensitive) against the
 * ABSOLUTE file path and turns a slash-less pattern into "any depth". That is
 * why no pattern names a bare directory like `data` or `log` at any depth: it
 * would also deny the `src/data/*` modules or `src/admin/log/*`. The pm2
 * `logs/` directory and `.claude/` are instead anchored to the project root:
 * git worktrees live under `.claude/worktrees/`, so an any-depth `.claude`
 * pattern would deny a worktree's entire dev server.
 *
 * @module src/server/devServerExposure
 */

/** Vite's own defaults plus Pinokio's credential file; kept because `deny` replaces the default list. */
const CREDENTIAL_DENY = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/ENVIRONMENT'];

/**
 * Runtime-written data: caches/audit/server log (`.gev-cache`), voice transcripts
 * and QA harness logs (`.gev-logs`), the auth DB home (`.gev-data`, legacy
 * `data/auth.db*`), and any SQLite/JSONL/log file.
 */
const RUNTIME_DATA_DENY = [
  '**/.gev-cache/**', '**/.gev-data/**', '**/.gev-logs/**', '**/data/auth.db*',
  '*.db', '*.db-wal', '*.db-shm', '*.db-journal', '*.sqlite', '*.sqlite3', '*.jsonl', '*.log',
];

/** Escape glob metacharacters so a filesystem path is matched literally. */
function globLiteral(dir) {
  return String(dir).replace(/\\/g, '/').replace(/\/+$/, '').replace(/[*?[\]{}()!+@]/g, '\\$&');
}

/**
 * Full `server.fs.deny` list for a project rooted at `rootDir`. Root-anchored:
 * pm2 stdout/stderr (`./logs/`) and agent session state + nested worktrees (`./.claude/`).
 * @param {string} rootDir absolute project root
 * @returns {string[]}
 */
export function devServerFsDeny(rootDir) {
  const root = globLiteral(rootDir);
  return [...CREDENTIAL_DENY, ...RUNTIME_DATA_DENY, `${root}/logs/**`, `${root}/.claude/**`];
}

/**
 * Vite plugin that answers 404 on `/__open-in-editor`. Vite mounts that
 * launch-editor middleware with no auth and no Host check once
 * `allowedHosts: true`, so any client could spawn an editor process on the
 * server host. Mounted from `configureServer` directly, it runs before Vite's
 * internal middleware. The cost is losing click-to-open in the error overlay.
 * @returns {import('vite').Plugin}
 */
export function blockOpenInEditor() {
  return {
    name: 'gev-block-open-in-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__open-in-editor', (_req, res) => {
        res.statusCode = 404;
        res.end();
      });
    },
  };
}
