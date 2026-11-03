// src/voice/gevLiveViewport.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDownscale, estimateDataUrlBytes, renderFreshCesiumFrame } from './gevLiveViewport.js';

test('computeDownscale leaves an already-small frame untouched', () => {
  assert.deepEqual(computeDownscale(800, 600, 1200 * 900), { width: 800, height: 600 });
});

test('computeDownscale clamps a huge landscape frame under the pixel budget', () => {
  const maxPx = 1200 * 900; // 1,080,000
  const out = computeDownscale(3840, 2160, maxPx); // 4K, 8.29 MP
  assert.ok(out.width * out.height <= maxPx, `pixels ${out.width * out.height} <= ${maxPx}`);
  // aspect ratio preserved (16:9) within rounding
  assert.ok(Math.abs(out.width / out.height - 3840 / 2160) < 0.01);
});

test('computeDownscale clamps a TALL PORTRAIT frame too (the width-only bug)', () => {
  const maxPx = 1200 * 900;
  // A narrow-but-very-tall portrait window: width alone (1080) would have
  // passed the old 1200px width clamp untouched, but its 1080*3000 = 3.24 MP
  // total blows the budget and must be scaled down.
  const out = computeDownscale(1080, 3000, maxPx);
  assert.ok(out.width * out.height <= maxPx, `portrait pixels ${out.width * out.height} <= ${maxPx}`);
  assert.ok(out.height < 3000, 'height was reduced');
  assert.ok(out.width < 1080, 'width was reduced');
  assert.ok(Math.abs(out.width / out.height - 1080 / 3000) < 0.01, 'aspect preserved');
});

test('computeDownscale never upscales and never returns a zero dimension', () => {
  assert.deepEqual(computeDownscale(10, 10, 1_000_000), { width: 10, height: 10 });
  const tiny = computeDownscale(1, 1, 1);
  assert.ok(tiny.width >= 1 && tiny.height >= 1);
});

test('computeDownscale is defensive against garbage input', () => {
  const out = computeDownscale(0, 0, 0);
  assert.ok(out.width >= 1 && out.height >= 1);
  const nan = computeDownscale(NaN, NaN, NaN);
  assert.ok(nan.width >= 1 && nan.height >= 1);
});

test('estimateDataUrlBytes decodes base64 length minus the data-URL prefix', () => {
  // "AAAA" (4 base64 chars, no padding) = 3 bytes.
  assert.equal(estimateDataUrlBytes('data:image/jpeg;base64,AAAA'), 3);
  // one '=' pad => 2 bytes; two '==' pads => 1 byte
  assert.equal(estimateDataUrlBytes('data:image/jpeg;base64,AAA='), 2);
  assert.equal(estimateDataUrlBytes('data:image/jpeg;base64,AA=='), 1);
});

test('estimateDataUrlBytes handles a raw base64 string with no comma prefix', () => {
  assert.equal(estimateDataUrlBytes('AAAA'), 3);
});

test('estimateDataUrlBytes is safe on non-strings', () => {
  assert.equal(estimateDataUrlBytes(null), 0);
  assert.equal(estimateDataUrlBytes(undefined), 0);
  assert.equal(estimateDataUrlBytes(12345), 0);
});

test('estimateDataUrlBytes flags a payload over the 200KB ceiling', () => {
  const LIMIT = 200 * 1024;
  // ~300 KB of base64 (each char ~0.75 bytes) decodes well over the ceiling.
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(300 * 1024);
  assert.ok(estimateDataUrlBytes(big) > LIMIT);
  // A small one stays under.
  const small = 'data:image/jpeg;base64,' + 'A'.repeat(1024);
  assert.ok(estimateDataUrlBytes(small) < LIMIT);
});

// --- M14: item_not_found from a stale viewport-delete must be non-fatal ---

test('hidden document yields no fresh frame — capture must not label a stale canvas Current', async () => {
  const originalDocument = globalThis.document;
  let requested = 0;
  const scene = {
    postRender: { addEventListener() { return () => {}; } },
    requestRender() { requested += 1; },
  };
  try {
    globalThis.document = { hidden: true };
    const fresh = await renderFreshCesiumFrame({ scene });
    assert.equal(fresh, false, 'hidden capture reports non-fresh');
    assert.equal(requested, 0, 'no secret render restart while hidden');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('visible document with a rendering scene reports a fresh frame', async () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { hidden: false };
    let fire = null;
    const scene = {
      postRender: { addEventListener(listener) { fire = listener; return () => { fire = null; }; } },
      requestRender() { queueMicrotask(() => fire?.()); },
    };
    const fresh = await renderFreshCesiumFrame({ scene });
    assert.equal(fresh, true);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('a tab switch during the bounded render wait invalidates freshness', async () => {
  const originalDocument = globalThis.document;
  try {
    const doc = { hidden: false };
    globalThis.document = doc;
    let fire = null;
    const scene = {
      postRender: { addEventListener(listener) { fire = listener; return () => { fire = null; }; } },
      requestRender() { doc.hidden = true; queueMicrotask(() => fire?.()); },
    };
    const fresh = await renderFreshCesiumFrame({ scene });
    assert.equal(fresh, false, 'freshness rechecked after the await');
  } finally {
    globalThis.document = originalDocument;
  }
});
