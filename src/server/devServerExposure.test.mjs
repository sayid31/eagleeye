// Boots a real Vite dev server against a temp project root holding the same
// runtime-data layout the app writes, then requests each file anonymously.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { devServerFsDeny, blockOpenInEditor } from './devServerExposure.mjs';

const SENTINEL = 'GEV-SENTINEL-must-not-leak'; // test-only
const DENIED = [
  '.gev-cache/x.jsonl',
  '.gev-cache/server-log.json',
  '.gev-cache/voice-settings.json',
  '.gev-data/auth.db',
  '.gev-logs/realtime-conversations.jsonl',
  '.claude/settings.local.json',
  'data/auth.db',
  'data/auth.db-wal',
  'logs/x.log',
  'logs/eagleeye-out.txt',
  'stray.sqlite',
  'nested/state.db-shm',
];
const SERVED = {
  'style.css': 'body{color:red}',
  'src/data/layer.js': 'export const layer = 1;',
  'src/admin/log/serverLogCore.mjs': 'export const core = 1;',
  'src/logs/notes.txt': 'not pm2 output',
};

let server;
let tmp;
let root;
let base;

test.before(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gev-fs-deny-')));
  // The project root sits inside a `.claude/worktrees/` checkout on purpose: the
  // deny list must not lock a worktree's own dev server out of everything.
  root = path.join(tmp, '.claude', 'worktrees', 'wt');
  const write = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  write('index.html', '<!doctype html><title>t</title>');
  for (const rel of DENIED) write(rel, `${SENTINEL} ${rel}`);
  for (const [rel, body] of Object.entries(SERVED)) write(rel, body);
  server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    appType: 'spa',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [blockOpenInEditor()],
    server: { host: '127.0.0.1', port: 0, fs: { deny: devServerFsDeny(root) } },
  });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
});

test.after(async () => {
  await server?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

async function get(urlPath) {
  const res = await fetch(base + urlPath);
  return { status: res.status, body: await res.text() };
}

/** Body text plus any inline base64 source map, so content can't hide in `sourcesContent`. */
function decoded(body) {
  const maps = [...body.matchAll(/base64,([A-Za-z0-9+/=]+)/g)].map((m) => Buffer.from(m[1], 'base64').toString());
  return [body, ...maps].join('\n');
}

for (const rel of DENIED) {
  test(`anonymous GET /${rel} is refused without leaking content`, async () => {
    // Plain and ?raw read the file itself: both must be refused outright.
    for (const suffix of ['', '?raw']) {
      const { status, body } = await get(`/${rel}${suffix}`);
      assert.notEqual(status, 200, `/${rel}${suffix} returned 200`);
      assert.ok(!decoded(body).includes(SENTINEL), `/${rel}${suffix} leaked file content`);
    }
    // ?import/?url may answer with an asset-URL module; it must still never carry the bytes.
    for (const suffix of ['?import', '?url', '?import&raw']) {
      const { body } = await get(`/${rel}${suffix}`);
      assert.ok(!decoded(body).includes(SENTINEL), `/${rel}${suffix} leaked file content`);
    }
  });
}

test('denied runtime files are also refused through /@fs/ absolute paths', async () => {
  for (const rel of ['data/auth.db', '.gev-cache/x.jsonl', 'logs/x.log']) {
    const { status, body } = await get(`/@fs${root}/${rel}`);
    assert.notEqual(status, 200);
    assert.ok(!body.includes(SENTINEL));
  }
});

test('the plain file request for a denied path gets 403', async () => {
  assert.equal((await get('/.gev-cache/x.jsonl')).status, 403);
  assert.equal((await get('/data/auth.db')).status, 403);
});

test('normal assets and src modules (including src/data and src/admin/log) are still served from a worktree root', async () => {
  for (const [rel, body] of Object.entries(SERVED)) {
    const res = await get(`/${rel}`);
    assert.equal(res.status, 200, `/${rel} should be served`);
    assert.ok(res.body.includes(body.split(' ')[0]), `/${rel} body mismatch`);
  }
});

test('/__open-in-editor is answered with 404 instead of launching an editor', async () => {
  const { status } = await get('/__open-in-editor?file=index.html');
  assert.equal(status, 404);
});

test('devServerFsDeny anchors logs/ to the root and keeps the credential defaults', () => {
  const deny = devServerFsDeny('/srv/app (prod)');
  assert.ok(deny.includes('.env') && deny.includes('**/.git/**') && deny.includes('**/ENVIRONMENT'));
  assert.ok(deny.includes('/srv/app \\(prod\\)/logs/**'));
  assert.ok(deny.includes('/srv/app \\(prod\\)/.claude/**'));
  assert.ok(!deny.includes('**/.claude/**'), 'an any-depth .claude pattern would deny every file of a worktree');
  assert.ok(!deny.some((p) => /(^|\/)(\*\*\/)?data\/\*\*$/.test(p)), 'must never deny a whole data/ dir');
});

test('vite.config.js uses the shared deny list and the open-in-editor block', () => {
  const source = fs.readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  assert.match(source, /deny:\s*devServerFsDeny\(__dirname\)/);
  assert.match(source, /plugins:\s*\[\s*blockOpenInEditor\(\)/);
});
