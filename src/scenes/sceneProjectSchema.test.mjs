// Pure project-schema normalization/migration extracted from scenes/director.js.
// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultProject,
  DEFAULT_HOLD_SEC,
  DEFAULT_SHOT_DURATION_SEC,
  normalizeLayerEntry,
  normalizeProject,
  normalizeShot,
  PROJECT_VERSION,
  recipeToScene,
  uid,
} from './sceneProjectSchema.js';
import { SCENE_RECIPES } from './recipes.js';

test('uid produces a prefixed, unique-looking identifier', () => {
  const a = uid('shot');
  const b = uid('shot');
  assert.match(a, /^shot-[a-z0-9]{8}$/);
  assert.notEqual(a, b);
});

test('normalizeLayerEntry accepts boolean shorthand', () => {
  assert.deepEqual(normalizeLayerEntry(true), { enabled: true });
  assert.deepEqual(normalizeLayerEntry(false), { enabled: false });
  assert.deepEqual(normalizeLayerEntry(undefined), { enabled: false });
});

test('normalizeLayerEntry accepts full object form and deep-clones params', () => {
  const params = { rangeM: 500 };
  const entry = normalizeLayerEntry({ enabled: true, params });
  assert.deepEqual(entry, { enabled: true, params: { rangeM: 500 } });
  assert.notEqual(entry.params, params); // deep-cloned, not the same reference
});

test('recipeToScene converts every SCENE_RECIPES entry without throwing', () => {
  for (const recipe of SCENE_RECIPES) {
    const scene = recipeToScene(recipe);
    assert.equal(scene.id, recipe.id);
    assert.equal(scene.title, recipe.title);
    assert.equal(scene.shots.length, recipe.cameraPath.length);
    for (const shot of scene.shots) {
      assert.ok(shot.id);
      assert.ok(Number.isFinite(shot.durationSec));
      assert.ok(Number.isFinite(shot.camera.lat));
      assert.ok(shot.visual.style);
    }
  }
});

test('recipeToScene derives hud visibility/variant from ui.hudMode', () => {
  const recipe = {
    id: 'r1', title: 'R1', style: 'normal',
    ui: { hudMode: 'off' },
    layers: {},
    post: {},
    cameraPath: [{ lat: 1, lon: 2, alt: 100 }],
  };
  const scene = recipeToScene(recipe);
  assert.equal(scene.shots[0].visual.hud.visible, false);
});

test('createDefaultProject builds one scene per SCENE_RECIPES entry', () => {
  const project = createDefaultProject();
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(project.scenes.length, SCENE_RECIPES.length);
  assert.ok(project.createdAt);
  assert.ok(project.updatedAt);
});

test('normalizeShot fills in safe defaults for a fully empty shot', () => {
  const shot = normalizeShot({}, 2);
  assert.equal(shot.title, 'Shot 3');
  assert.equal(shot.durationSec, DEFAULT_SHOT_DURATION_SEC);
  assert.equal(shot.holdSec, 0);
  assert.equal(shot.camera.alt, 800); // floor default
  assert.equal(shot.visual.style, 'normal');
  assert.equal(shot.visual.hud.visible, true);
});

test('normalizeShot preserves provided values and clamps out-of-range ones', () => {
  const shot = normalizeShot({
    id: 'shot-fixed',
    title: 'Custom',
    durationSec: 10,
    camera: { lat: 30, lon: -97, alt: 50 }, // below the 100m floor
    visual: { sharpen: { enabled: true, intensity: 500 } }, // above the 100 ceiling
  }, 0);
  assert.equal(shot.id, 'shot-fixed');
  assert.equal(shot.title, 'Custom');
  assert.equal(shot.camera.alt, 100); // floored
  assert.equal(shot.visual.sharpen.intensity, 100); // clamped
});

test('normalizeProject falls back to the default project for invalid input', () => {
  const project = normalizeProject(null);
  assert.equal(project.scenes.length, SCENE_RECIPES.length);
});

test('normalizeProject falls back to the default project when scenes are empty', () => {
  const project = normalizeProject({ version: 2, scenes: [] });
  assert.equal(project.scenes.length, SCENE_RECIPES.length);
});

test('normalizeProject migrates an older-schema project and bumps the version', () => {
  const raw = {
    version: 1,
    createdAt: '2020-01-01T00:00:00.000Z',
    scenes: [{ id: 'old-scene', title: 'Old Scene', shots: [{ camera: { lat: 1, lon: 2 } }] }],
  };
  const project = normalizeProject(raw);
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(project.createdAt, raw.createdAt); // preserved
  assert.equal(project.scenes.length, 1);
  assert.equal(project.scenes[0].id, 'old-scene');
  assert.equal(project.scenes[0].shots.length, 1);
});

test('normalizeProject keeps a title-only scene with no shots', () => {
  const raw = { version: PROJECT_VERSION, scenes: [{ id: 's1', title: 'Empty Scene', shots: [] }] };
  const project = normalizeProject(raw);
  assert.equal(project.scenes.length, 1);
  assert.equal(project.scenes[0].shots.length, 0);
});

test('DEFAULT_HOLD_SEC and DEFAULT_SHOT_DURATION_SEC are sane positive defaults', () => {
  assert.ok(DEFAULT_HOLD_SEC >= 0);
  assert.ok(DEFAULT_SHOT_DURATION_SEC > 0);
});
