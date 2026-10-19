import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('source badge shows an explicit offline label ahead of the generic status', async () => {
  const mixin = await readFile(new URL('./cctvPanelMixin.js', import.meta.url), 'utf8');
  const offlineAt = mixin.indexOf('isSourceOffline(activeCamera.sourceStatus)');
  const genericAt = mixin.indexOf("const status = String(activeCamera.sourceStatus || 'unknown')");
  assert.ok(offlineAt > 0, 'offline branch exists');
  assert.ok(offlineAt < genericAt, 'offline branch runs before the generic KIND · STATUS label');
  assert.match(mixin, /KAMERA MATI · SUMBER MATI/);
  assert.match(mixin, /frameState = 'offline'/);
});

test('stylesheet defines a distinct offline badge state', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /#cctv-source-badge\[data-frame-state='offline'\]/);
});

test('source badge reports the player state after offline and before the generic status', async () => {
  const mixin = await readFile(new URL('./cctvPanelMixin.js', import.meta.url), 'utf8');
  const offlineAt = mixin.indexOf('isSourceOffline(activeCamera.sourceStatus)');
  const playbackAt = mixin.indexOf('playbackBadge(activeCamera.playbackState, {');
  const genericAt = mixin.indexOf("const status = String(activeCamera.sourceStatus || 'unknown')");
  assert.ok(offlineAt > 0 && offlineAt < playbackAt && playbackAt < genericAt);
});

test('stylesheet defines the stalled badge state', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /#cctv-source-badge\[data-frame-state='stalled'\]/);
});
