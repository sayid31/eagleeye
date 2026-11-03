import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDotenvWithoutClobbering,
  loadCheckoutEnv,
  pruneEmptyEnvValues,
  shellValueIsAbsent,
} from './dotenvPrecedence.mjs';

/**
 * Stand-in for Vite's loadEnv, reproducing the behaviour that caused the bug:
 * a matching process.env entry WINS over the dotenv file, so an empty export
 * makes loadEnv itself return ''.
 */
function fakeLoadEnv(fileValues, target) {
  return () => Object.fromEntries(
    Object.entries(fileValues).map(([key, fileVal]) => [
      key,
      key in target ? target[key] : fileVal,
    ]),
  );
}

test('a real shell value still beats .env', () => {
  const target = { OPENAI_API_KEY: 'from-shell' };
  const applied = applyDotenvWithoutClobbering(target, { OPENAI_API_KEY: 'from-dotenv' });
  assert.equal(target.OPENAI_API_KEY, 'from-shell');
  assert.deepEqual(applied, [], 'nothing should be written when the shell owns the value');
});

test('an EMPTY shell export does not shadow .env (the 503 regression)', () => {
  // The whole bug: `'' === undefined` is false, so an empty export used to win
  // and voice answered 503 "OPENAI_API_KEY is not set" with a valid .env.
  const target = { OPENAI_API_KEY: '' };
  const applied = applyDotenvWithoutClobbering(target, { OPENAI_API_KEY: 'from-dotenv' });
  assert.equal(target.OPENAI_API_KEY, 'from-dotenv');
  assert.deepEqual(applied, ['OPENAI_API_KEY']);
});

test('a whitespace-only shell export is absence too', () => {
  const target = { TOMTOM_API_KEY: '   ' };
  applyDotenvWithoutClobbering(target, { TOMTOM_API_KEY: 'from-dotenv' });
  assert.equal(target.TOMTOM_API_KEY, 'from-dotenv');
});

test('an unset key takes the .env value', () => {
  const target = {};
  applyDotenvWithoutClobbering(target, { FIRMS_MAP_KEY: 'from-dotenv' });
  assert.equal(target.FIRMS_MAP_KEY, 'from-dotenv');
});

test('an empty .env value does not invent a key that was never configured', () => {
  const target = {};
  applyDotenvWithoutClobbering(target, { AISSTREAM_API_KEY: '' });
  assert.equal(target.AISSTREAM_API_KEY, '', 'copied verbatim; still absent by shellValueIsAbsent');
  assert.equal(shellValueIsAbsent(target.AISSTREAM_API_KEY), true);
});

test('keys are decided independently — one empty var does not affect its neighbours', () => {
  const target = { OPENAI_API_KEY: '', TOMTOM_API_KEY: 'real-shell-value' };
  const applied = applyDotenvWithoutClobbering(target, {
    OPENAI_API_KEY: 'dotenv-openai',
    TOMTOM_API_KEY: 'dotenv-tomtom',
    CESIUM_ION_TOKEN: 'dotenv-cesium',
  });
  assert.equal(target.OPENAI_API_KEY, 'dotenv-openai');
  assert.equal(target.TOMTOM_API_KEY, 'real-shell-value');
  assert.equal(target.CESIUM_ION_TOKEN, 'dotenv-cesium');
  assert.deepEqual(applied, ['OPENAI_API_KEY', 'CESIUM_ION_TOKEN']);
});

test('shellValueIsAbsent classifies each shape', () => {
  assert.equal(shellValueIsAbsent(undefined), true);
  assert.equal(shellValueIsAbsent(''), true);
  assert.equal(shellValueIsAbsent('\t \n'), true);
  assert.equal(shellValueIsAbsent('sk-value'), false);
  assert.equal(shellValueIsAbsent('0'), false, '"0" is a legitimate value, not absence');
});

test('missing or empty loaded input is a no-op, not a throw', () => {
  const target = { A: 'keep' };
  assert.deepEqual(applyDotenvWithoutClobbering(target, {}), []);
  assert.deepEqual(applyDotenvWithoutClobbering(target, null), []);
  assert.deepEqual(applyDotenvWithoutClobbering(target, undefined), []);
  assert.equal(target.A, 'keep');
});

test('pruneEmptyEnvValues deletes only the empty entries it was asked about', () => {
  const target = { EMPTY: '', BLANK: '  ', REAL: 'v', UNRELATED_EMPTY: '' };
  const pruned = pruneEmptyEnvValues(target, ['EMPTY', 'BLANK', 'REAL', 'NEVER_SET']);
  assert.deepEqual(pruned, ['EMPTY', 'BLANK']);
  assert.equal('EMPTY' in target, false);
  assert.equal('BLANK' in target, false);
  assert.equal(target.REAL, 'v');
  assert.equal(target.UNRELATED_EMPTY, '', 'untouched because it was not in the key list');
});

test('loadCheckoutEnv recovers the .env value an EMPTY shell export was hiding', () => {
  // The real regression end-to-end: loadEnv defers to the empty export, so a
  // guard at assignment time sees '' on BOTH sides and can never recover the
  // key. Pruning first is what makes the second read return the real value.
  const target = { OPENAI_API_KEY: '' };
  const files = { OPENAI_API_KEY: 'sk-real-164-char-key', TOMTOM_API_KEY: 'tom' };
  const result = loadCheckoutEnv({
    target, loadEnv: fakeLoadEnv(files, target), mode: 'development', dir: '/repo',
  });
  assert.equal(target.OPENAI_API_KEY, 'sk-real-164-char-key');
  assert.deepEqual(result.pruned, ['OPENAI_API_KEY']);
  assert.ok(result.applied.includes('OPENAI_API_KEY'));
});

test('loadCheckoutEnv still lets a REAL shell export override .env', () => {
  const target = { OPENAI_API_KEY: 'sk-from-shell' };
  const files = { OPENAI_API_KEY: 'sk-from-dotenv' };
  const result = loadCheckoutEnv({
    target, loadEnv: fakeLoadEnv(files, target), mode: 'development', dir: '/repo',
  });
  assert.equal(target.OPENAI_API_KEY, 'sk-from-shell');
  assert.deepEqual(result.pruned, []);
});

test('loadCheckoutEnv leaves a key absent when .env genuinely has no value', () => {
  // Pruning must not invent a key: downstream consumers test `if (!apiKey)`,
  // and an absent key has to stay absent so the 503 remains truthful.
  const target = { FIRMS_MAP_KEY: '' };
  const result = loadCheckoutEnv({
    target, loadEnv: fakeLoadEnv({ FIRMS_MAP_KEY: '' }, target), mode: 'development', dir: '/repo',
  });
  assert.equal(Boolean(target.FIRMS_MAP_KEY), false);
  assert.deepEqual(result.pruned, ['FIRMS_MAP_KEY']);
});

test('loadCheckoutEnv reads once when there is nothing empty to prune', () => {
  let reads = 0;
  const target = {};
  const loadEnv = () => { reads += 1; return { A: 'a', B: 'b' }; };
  const result = loadCheckoutEnv({ target, loadEnv, mode: 'development', dir: '/repo' });
  assert.equal(reads, 1, 'the second pass is only worth paying for when something was pruned');
  assert.deepEqual(result.applied, ['A', 'B']);
  assert.deepEqual(result.pruned, []);
});
